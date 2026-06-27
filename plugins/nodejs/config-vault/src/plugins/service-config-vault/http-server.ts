import { createServer, type Server } from 'node:http';
import {
  createApp,
  defineEventHandler,
  deleteCookie,
  getCookie,
  getHeader,
  getMethod,
  getQuery,
  readBody,
  sendRedirect,
  setCookie,
  setResponseHeader,
  setResponseStatus,
  toNodeListener,
} from 'h3';
import type { Observable } from '@bsb/base';
import type { VaultService } from './vault.js';
import type { VaultRuntimeConfig } from './types.js';

export interface VaultHttpOptions {
  host: string;
  port: number;
  publicUrl: string;
  production: boolean;
  obs: Observable;
  vault: VaultService;
}

export class VaultHttpServer {
  private readonly options: VaultHttpOptions;
  private server?: Server;

  constructor(options: VaultHttpOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const app = createApp();

    app.use('/health', defineEventHandler(() => ({ status: 'ok' })));

    app.use('/runtime/config', defineEventHandler(async (event) => {
      const keyId = getHeader(event, 'x-vault-key-id') ?? '';
      const secret = getHeader(event, 'x-vault-secret') ?? '';
      const resolved = await this.options.vault.resolveRuntimeConfig(keyId, secret, this.options.obs);
      return resolved;
    }));

    app.use('/setup', defineEventHandler(async (event) => {
      if (getMethod(event) === 'GET') return this.page('Vault Setup', setupForm());
      const body = await readBody<Record<string, unknown>>(event);
      const result = await this.options.vault.createFirstAdmin({
        setupCode: String(body.setupCode ?? ''),
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        passwordConfirm: String(body.passwordConfirm ?? ''),
      });
      return this.page('Vault Setup Complete', setupComplete(result.email, result.totpSecret, result.totpUri));
    }));

    app.use('/login/start', defineEventHandler(async (event) => {
      const body = await readBody<Record<string, unknown>>(event);
      const result = await this.options.vault.login(
        String(body.email ?? ''),
        String(body.password ?? ''),
        String(body.totpCode ?? ''),
      );
      if (result.status === 'passkey_setup_required') {
        setCookie(event, 'vault_passkey_setup', result.setupToken, {
          httpOnly: true,
          sameSite: 'lax',
          secure: this.options.production,
          path: '/',
          maxAge: 10 * 60,
        });
        return { status: result.status, redirect: '/passkeys/setup' };
      }
      if (result.status === 'passkey_required') {
        return result;
      }
    }));

    app.use('/login/finish', defineEventHandler(async (event) => {
      const body = await readBody<Record<string, unknown>>(event);
      const credential = parseJsonObject(body.credential);
      if (!credential) throw new Error('Passkey credential is required');
      const session = await this.options.vault.finishLogin(String(body.challengeId ?? ''), credential);
      setLoginCookies(event, session.sessionId, session.csrfToken, this.options.production);
      return { status: 'success', redirect: '/' };
    }));

    app.use('/login', defineEventHandler(async (event) => {
      if (getMethod(event) === 'GET') return this.page('Vault Login', loginForm());
      return sendRedirect(event, '/login');
    }));

    app.use('/passkeys/setup', defineEventHandler(async (event) => {
      if (getMethod(event) !== 'GET') return sendRedirect(event, '/passkeys/setup');
      await this.passkeySetupUser(event);
      return this.page('Set Up Passkey', passkeySetupPage());
    }));

    app.use('/api/passkeys/register/options', defineEventHandler(async (event) => {
      const user = await this.passkeySetupUser(event);
      return this.options.vault.startPasskeyRegistration(user.userId);
    }));

    app.use('/api/passkeys/register/verify', defineEventHandler(async (event) => {
      const user = await this.passkeySetupUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      const credential = parseJsonObject(body.credential);
      if (!credential) throw new Error('Passkey credential is required');
      await this.options.vault.finishPasskeyRegistration(user.userId, credential);
      if (user.setupToken) {
        this.options.vault.clearPasskeySetupToken(user.setupToken);
        deleteCookie(event, 'vault_passkey_setup', { path: '/' });
      }
      return { success: true, relogin: Boolean(user.setupToken), redirect: user.setupToken ? '/login' : '/' };
    }));

    app.use('/logout', defineEventHandler(async (event) => {
      const sessionId = getCookie(event, 'vault_session');
      if (sessionId) await this.options.vault.logout(sessionId);
      deleteCookie(event, 'vault_session', { path: '/' });
      deleteCookie(event, 'vault_csrf', { path: '/' });
      deleteCookie(event, 'vault_passkey_setup', { path: '/' });
      return sendRedirect(event, '/login');
    }));

    app.use('/api/applications', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createApplication(user.userId, String(body.name ?? ''), stringOrUndefined(body.description));
    }));

    app.use('/api/groups', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createGroup(user.userId, String(body.applicationId ?? ''), String(body.name ?? ''));
    }));

    app.use('/api/profiles', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createProfile(user.userId, String(body.groupId ?? ''), String(body.name ?? 'default'));
    }));

    app.use('/api/plugins', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createPlugin(user.userId, {
        org: String(body.org ?? '_'),
        name: String(body.name ?? ''),
        pluginId: String(body.pluginId ?? body.name ?? ''),
        packageName: body.packageName === undefined ? null : String(body.packageName),
        version: String(body.version ?? '0.0.0'),
        kind: parseKind(body.kind),
        source: parseSource(body.source),
        configSchema: parseJsonObject(body.configSchema) ?? null,
        eventSchema: parseJsonObject(body.eventSchema) ?? null,
      });
    }));

    app.use('/api/drafts', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      const config = parseJsonObject(body.config) as VaultRuntimeConfig | undefined;
      if (!config) throw new Error('Config must be a JSON object');
      await this.options.vault.saveDraft(user.userId, String(body.profileId ?? ''), config);
      return { success: true };
    }));

    app.use('/api/publish', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.publishDraft(user.userId, String(body.profileId ?? ''));
    }));

    app.use('/api/runtime-keys', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createRuntimeKey(user.userId, {
        name: String(body.name ?? ''),
        applicationId: String(body.applicationId ?? ''),
        groupId: String(body.groupId ?? ''),
        profileId: String(body.profileId ?? ''),
        containerName: body.containerName === undefined ? null : String(body.containerName),
        configPluginId: String(body.configPluginId ?? 'config-vault'),
      });
    }));

    app.use('/', defineEventHandler(async (event) => {
      if (await this.options.vault.setupRequired()) return sendRedirect(event, '/setup');
      const session = getCookie(event, 'vault_session');
      if (!session) return sendRedirect(event, '/login');
      await this.options.vault.requireSession(session);
      const query = getQuery(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Vault', dashboardPage(dashboard, String(query.secret ?? '')));
    }));

    app.use(defineEventHandler((event) => {
      setResponseStatus(event, 404);
      return this.page('Not Found', '<p>Not found.</p>');
    }));

    this.server = createServer(toNodeListener(app));
    await new Promise<void>((resolve) => {
      this.server?.listen(this.options.port, this.options.host, resolve);
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((error) => error ? reject(error) : resolve());
    });
  }

  private async requireUser(event: Parameters<typeof getCookie>[0]): Promise<{ userId: string; csrfToken: string }> {
    const session = await this.options.vault.requireSession(getCookie(event, 'vault_session'));
    const headerCsrf = getHeader(event, 'x-csrf-token');
    const cookieCsrf = getCookie(event, 'vault_csrf');
    if (headerCsrf !== session.csrfToken && cookieCsrf !== session.csrfToken) {
      throw new Error('Invalid CSRF token');
    }
    return session;
  }

  private async passkeySetupUser(event: Parameters<typeof getCookie>[0]): Promise<{ userId: string; setupToken?: string }> {
    const setupToken = getCookie(event, 'vault_passkey_setup');
    if (setupToken) {
      return {
        userId: this.options.vault.consumePasskeySetupToken(setupToken),
        setupToken,
      };
    }
    const session = await this.requireUser(event);
    return { userId: session.userId };
  }

  private page(title: string, body: string): string {
    return html(title, body);
  }
}

function html(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{--bg:#f5f7fb;--panel:#fff;--text:#15181c;--muted:#637083;--line:#d9dee8;--primary:#155eef;--danger:#b42318;--ok:#067647}
    *{box-sizing:border-box}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:var(--bg);color:var(--text)}
    header{background:#101828;color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1d2939}
    header a{color:#d0d5dd;text-decoration:none}
    main{max-width:1180px;margin:0 auto;padding:24px}
    section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;margin:0 0 16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
    h1,h2,h3{margin:0 0 12px} h1{font-size:26px} h2{font-size:18px} h3{font-size:15px;color:#344054}
    label{display:block;font-size:13px;font-weight:650;color:#344054;margin:12px 0 6px}
    input,textarea,select{display:block;width:100%;margin:0 0 12px;padding:10px 11px;border:1px solid #b9c0ca;border-radius:6px;font:inherit;background:#fff}
    textarea{min-height:140px;font-family:ui-monospace,Consolas,monospace}
    button,.button{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:0;border-radius:6px;padding:10px 13px;font:inherit;font-weight:650;cursor:pointer;text-decoration:none}
    button.secondary,.button.secondary{background:#fff;color:#344054;border:1px solid var(--line)}
    table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #e3e6eb;text-align:left;padding:8px;vertical-align:top}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
    .muted{color:var(--muted)}.danger{color:var(--danger)}.ok{color:var(--ok)}
    .auth{max-width:480px;margin:32px auto}.stack{display:flex;flex-direction:column;gap:12px}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .status{margin-top:12px;color:var(--muted);font-size:14px}.code{word-break:break-all;background:#f2f4f7;border:1px solid var(--line);border-radius:6px;padding:10px}
  </style>
</head>
<body>
  <header><strong>Vault</strong><a href="/logout" style="color:#fff">Logout</a></header>
  <main>${body}</main>
</body>
</html>`;
}

function setLoginCookies(event: Parameters<typeof setCookie>[0], sessionId: string, csrfToken: string, production: boolean): void {
  setCookie(event, 'vault_session', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    path: '/',
  });
  setCookie(event, 'vault_csrf', csrfToken, {
    sameSite: 'lax',
    secure: production,
    path: '/',
  });
}

function setupForm(): string {
  return `<section class="auth"><h1>First Admin Setup</h1>
    <p class="muted">Enter the one-time setup code printed in the service logs. Vault will generate TOTP enrollment details after the admin user is created.</p>
    <form method="post">
      <label>Setup Code</label><input name="setupCode" autocomplete="one-time-code" required>
      <label>Admin Email</label><input name="email" type="email" autocomplete="username" required>
      <label>Password</label><input name="password" type="password" autocomplete="new-password" minlength="12" required>
      <label>Confirm Password</label><input name="passwordConfirm" type="password" autocomplete="new-password" minlength="12" required>
      <button>Create Admin</button>
    </form>
  </section>`;
}

function setupComplete(email: string, totpSecret: string, totpUri: string): string {
  return `<section class="auth"><h1>Admin Created</h1>
    <p>Add this TOTP secret to your authenticator app before logging in as <strong>${escapeHtml(email)}</strong>.</p>
    <p><strong>TOTP secret:</strong></p>
    <p class="code"><code>${escapeHtml(totpSecret)}</code></p>
    <p><strong>Authenticator URI:</strong></p>
    <p class="code"><code>${escapeHtml(totpUri)}</code></p>
    <p class="muted">On first login, Vault will require passkey enrollment before dashboard access.</p>
    <p><a class="button" href="/login">Continue to login</a></p>
  </section>`;
}

function loginForm(): string {
  return `<section class="auth"><h1>Login</h1>
    <p class="muted">Vault requires password, TOTP, and passkey. If no passkey is enrolled yet, you will be sent to passkey setup and then asked to log in again.</p>
    <form id="login-form">
      <label>Email</label><input name="email" type="email" autocomplete="username" required>
      <label>Password</label><input name="password" type="password" autocomplete="current-password" required>
      <label>TOTP Code</label><input name="totpCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,}" required>
      <div class="actions"><button>Continue</button></div>
      <p id="login-status" class="status"></p>
    </form>
  </section>
  <script>${webauthnClientScript()}
  const loginFormEl = document.getElementById('login-form');
  const loginStatus = document.getElementById('login-status');
  loginFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      loginStatus.textContent = 'Checking credentials...';
      const data = Object.fromEntries(new FormData(loginFormEl).entries());
      const started = await fetch('/login/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
      const result = await started.json();
      if (!started.ok) throw new Error(result.message || 'Login failed');
      if (result.status === 'passkey_setup_required') {
        location.href = result.redirect;
        return;
      }
      if (result.status === 'passkey_required') {
        loginStatus.textContent = 'Use your passkey to finish login...';
        const credential = await navigator.credentials.get({ publicKey: publicKeyRequestToBrowser(result.options) });
        const finished = await fetch('/login/finish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ challengeId: result.challengeId, credential: credentialToJSON(credential) }),
        });
        const done = await finished.json();
        if (!finished.ok) throw new Error(done.message || 'Passkey login failed');
        location.href = done.redirect || '/';
        return;
      }
    } catch (error) {
      loginStatus.textContent = error instanceof Error ? error.message : 'Login failed';
      loginStatus.className = 'status danger';
      return;
    }
  });
  </script>`;
}

function passkeySetupPage(): string {
  return `<section class="auth"><h1>Set Up Passkey</h1>
    <p class="muted">Register a device passkey. After this succeeds, Vault will force a fresh login with password, TOTP, and passkey.</p>
    <div class="actions"><button id="register-passkey">Register Passkey</button></div>
    <p id="passkey-status" class="status"></p>
  </section>
  <script>${webauthnClientScript()}
  const statusEl = document.getElementById('passkey-status');
  document.getElementById('register-passkey').addEventListener('click', async () => {
    try {
      statusEl.textContent = 'Preparing passkey registration...';
      const optionsRes = await fetch('/api/passkeys/register/options', { method: 'POST' });
      const options = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(options.message || 'Could not start passkey registration');
      statusEl.textContent = 'Use your device passkey prompt...';
      const credential = await navigator.credentials.create({ publicKey: publicKeyCreationToBrowser(options) });
      const verifyRes = await fetch('/api/passkeys/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: credentialToJSON(credential) }),
      });
      const verified = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verified.message || 'Passkey registration failed');
      statusEl.textContent = verified.relogin ? 'Passkey registered. Redirecting to login...' : 'Passkey registered.';
      statusEl.className = 'status ok';
      location.href = verified.redirect || '/login';
    } catch (error) {
      statusEl.textContent = error instanceof Error ? error.message : 'Passkey registration failed';
      statusEl.className = 'status danger';
    }
  });
  </script>`;
}

function dashboardPage(data: Awaited<ReturnType<VaultService['dashboard']>>, secret: string): string {
  return `<div class="grid">
    <section><h2>Applications</h2>${table(data.applications.map((x) => [x.name, x.description ?? '', x.id]))}
      <h3>Create Application</h3>${apiForm('/api/applications', ['name', 'description'])}</section>
    <section><h2>Plugin Catalog</h2>${table(data.plugins.map((x) => [x.pluginId, x.version, x.kind, x.source]))}
      <h3>Create/Upload Plugin</h3>${pluginForm()}</section>
  </div>
  <section><h2>Profiles and Runtime</h2>
    <p class="muted">Use the JSON API to create groups/profiles, save drafts, publish, and create runtime keys. CSRF token is available in the <code>vault_csrf</code> cookie.</p>
    ${secret ? `<p><strong>Runtime secret, shown once:</strong> <code>${escapeHtml(secret)}</code></p>` : ''}
    <h3>Runtime Keys</h3>${table(data.runtimeKeys.map((x) => [x.name, x.id, x.profileId, x.containerName ?? '', x.revokedAt ?? 'active']))}
  </section>
  <section><h2>Draft Config JSON</h2>${apiForm('/api/drafts', ['profileId'], 'config')}</section>
  <section><h2>Publish Draft</h2>${apiForm('/api/publish', ['profileId'])}</section>
  <section><h2>Create Runtime Key</h2>${apiForm('/api/runtime-keys', ['name', 'applicationId', 'groupId', 'profileId', 'containerName', 'configPluginId'])}</section>
  <section><h2>Security</h2><p class="muted">Register another passkey for this admin account.</p><a class="button secondary" href="/passkeys/setup">Add Passkey</a></section>`;
}

function webauthnClientScript(): string {
  return `
  function base64UrlToBuffer(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return buffer;
  }
  function bufferToBase64Url(value) {
    const bytes = new Uint8Array(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
  }
  function publicKeyCreationToBrowser(options) {
    return {
      ...options,
      challenge: base64UrlToBuffer(options.challenge),
      user: { ...options.user, id: base64UrlToBuffer(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map((credential) => ({ ...credential, id: base64UrlToBuffer(credential.id) })),
    };
  }
  function publicKeyRequestToBrowser(options) {
    return {
      ...options,
      challenge: base64UrlToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map((credential) => ({ ...credential, id: base64UrlToBuffer(credential.id) })),
    };
  }
  function credentialToJSON(credential) {
    if (!credential) throw new Error('Passkey prompt was cancelled');
    const response = credential.response;
    const json = { id: credential.id, rawId: bufferToBase64Url(credential.rawId), type: credential.type, clientExtensionResults: credential.getClientExtensionResults() };
    if (response.attestationObject) {
      json.response = {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        attestationObject: bufferToBase64Url(response.attestationObject),
        transports: response.getTransports ? response.getTransports() : [],
      };
    } else {
      json.response = {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        authenticatorData: bufferToBase64Url(response.authenticatorData),
        signature: bufferToBase64Url(response.signature),
        userHandle: response.userHandle ? bufferToBase64Url(response.userHandle) : null,
      };
    }
    return json;
  }
  `;
}

function apiForm(action: string, fields: string[], textarea?: string): string {
  return `<form data-api="${action}" onsubmit="return submitJson(this)">
    ${fields.map((field) => `<input name="${field}" placeholder="${field}" ${field === 'configPluginId' ? 'value="config-vault"' : ''}>`).join('')}
    ${textarea ? `<textarea name="${textarea}" placeholder="${textarea} JSON"></textarea>` : ''}
    <button>Submit</button>
  </form>
  <script>
  async function submitJson(form){
    const data={}; for(const item of new FormData(form).entries()){data[item[0]]=item[1]}
    const csrf=document.cookie.split('; ').find(x=>x.startsWith('vault_csrf='))?.split('=')[1]||'';
    const res=await fetch(form.dataset.api,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(data)});
    alert(JSON.stringify(await res.json(),null,2)); location.reload(); return false;
  }
  </script>`;
}

function pluginForm(): string {
  return apiForm('/api/plugins', ['org', 'name', 'pluginId', 'packageName', 'version', 'kind', 'source'], 'configSchema');
}

function table(rows: string[][]): string {
  if (rows.length === 0) return '<p class="muted">None</p>';
  return `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`;
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Expected JSON object');
  return parsed as Record<string, unknown>;
}

function parseKind(value: unknown): 'service' | 'events' | 'observable' | 'config' {
  return value === 'events' || value === 'observable' || value === 'config' ? value : 'service';
}

function parseSource(value: unknown): 'registry' | 'manual' | 'upload' {
  return value === 'registry' || value === 'upload' ? value : 'manual';
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char));
}
