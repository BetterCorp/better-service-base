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
      if (getMethod(event) === 'GET') return this.page('Vault Setup', setupForm(), 'overview', false);
      const body = await readBody<Record<string, unknown>>(event);
      const result = await this.options.vault.createFirstAdmin({
        setupCode: String(body.setupCode ?? ''),
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        passwordConfirm: String(body.passwordConfirm ?? ''),
      });
      return this.page('Vault Setup Complete', setupComplete(result.email, result.totpSecret, result.totpUri), 'overview', false);
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
      if (getMethod(event) === 'GET') return this.page('Vault Login', loginForm(), 'overview', false);
      return sendRedirect(event, '/login');
    }));

    app.use('/passkeys/setup', defineEventHandler(async (event) => {
      if (getMethod(event) !== 'GET') return sendRedirect(event, '/passkeys/setup');
      const user = await this.passkeySetupUser(event);
      return this.page('Set Up Passkey', passkeySetupPage(), 'profile', !user.setupToken);
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

    app.use('/api/applications/update', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.updateApplication(
        user.userId,
        String(body.id ?? ''),
        String(body.name ?? ''),
        stringOrUndefined(body.description),
      );
      return { success: true };
    }));

    app.use('/api/applications/delete', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.deleteApplication(user.userId, String(body.id ?? ''));
      return { success: true };
    }));

    app.use('/api/applications', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createApplication(user.userId, String(body.name ?? ''), stringOrUndefined(body.description));
    }));

    app.use('/api/groups/update', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.updateGroup(user.userId, String(body.id ?? ''), String(body.applicationId ?? ''), String(body.name ?? ''));
      return { success: true };
    }));

    app.use('/api/groups/delete', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.deleteGroup(user.userId, String(body.id ?? ''));
      return { success: true };
    }));

    app.use('/api/groups', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createGroup(user.userId, String(body.applicationId ?? ''), String(body.name ?? ''));
    }));

    app.use('/api/profiles/update', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.updateProfile(user.userId, String(body.id ?? ''), String(body.groupId ?? ''), String(body.name ?? ''));
      return { success: true };
    }));

    app.use('/api/profiles/delete', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.deleteProfile(user.userId, String(body.id ?? ''));
      return { success: true };
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

    app.use('/applications', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Applications', applicationsPage(dashboard), 'applications');
    }));

    app.use('/deployments', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Deployments', deploymentsPage(dashboard), 'deployments');
    }));

    app.use('/configs', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Configs', configsPage(dashboard), 'configs');
    }));

    app.use('/runtime-keys', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const query = getQuery(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Runtime Keys', runtimeKeysPage(dashboard, String(query.secret ?? '')), 'runtime-keys');
    }));

    app.use('/plugins', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Plugins', pluginsPage(dashboard), 'plugins');
    }));

    app.use('/profile', defineEventHandler(async (event) => {
      const session = await this.requireUser(event);
      const profile = await this.options.vault.userProfile(session.userId);
      return this.page('Profile', profilePage(profile), 'profile');
    }));

    app.use('/', defineEventHandler(async (event) => {
      if (await this.options.vault.setupRequired()) return sendRedirect(event, '/setup');
      const session = getCookie(event, 'vault_session');
      if (!session) return sendRedirect(event, '/login');
      await this.options.vault.requireSession(session);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Vault', overviewPage(dashboard), 'overview');
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

  private page(title: string, body: string, active: NavItem = 'overview', authenticated = true): string {
    return html(title, body, active, authenticated);
  }
}

type NavItem = 'overview' | 'applications' | 'deployments' | 'configs' | 'runtime-keys' | 'plugins' | 'profile';
type DashboardData = Awaited<ReturnType<VaultService['dashboard']>>;
type UserProfileData = Awaited<ReturnType<VaultService['userProfile']>>;

function html(title: string, body: string, active: NavItem, authenticated: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{--bg:#f5f7fb;--panel:#fff;--text:#15181c;--muted:#637083;--line:#d9dee8;--primary:#155eef;--danger:#b42318;--ok:#067647;--sidebar:#101828}
    *{box-sizing:border-box}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:var(--bg);color:var(--text)}
    header{background:var(--sidebar);color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1d2939}
    header a{color:#d0d5dd;text-decoration:none}
    .shell{display:grid;grid-template-columns:230px minmax(0,1fr);min-height:calc(100vh - 54px)}
    nav{background:#fff;border-right:1px solid var(--line);padding:14px}
    nav a{display:block;color:#344054;text-decoration:none;padding:9px 10px;border-radius:6px;margin:2px 0;font-weight:600;font-size:14px}
    nav a.active{background:#eaf1ff;color:#155eef}
    main{max-width:1180px;width:100%;padding:24px}
    section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;margin:0 0 16px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
    h1,h2,h3{margin:0 0 12px} h1{font-size:26px} h2{font-size:18px} h3{font-size:15px;color:#344054}
    label{display:block;font-size:13px;font-weight:650;color:#344054;margin:12px 0 6px}
    input,textarea,select{display:block;width:100%;margin:0 0 12px;padding:10px 11px;border:1px solid #b9c0ca;border-radius:6px;font:inherit;background:#fff}
    textarea{min-height:140px;font-family:ui-monospace,Consolas,monospace}
    button,.button{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;border:0;border-radius:6px;padding:10px 13px;font:inherit;font-weight:650;cursor:pointer;text-decoration:none}
    button.secondary,.button.secondary{background:#fff;color:#344054;border:1px solid var(--line)}
    table{width:100%;border-collapse:collapse;font-size:14px}td,th{border-bottom:1px solid #e3e6eb;text-align:left;padding:8px;vertical-align:top}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
    .form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
    .metric{font-size:28px;font-weight:750}.page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin:0 0 18px}
    .inline-form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.inline-form label{min-width:190px}
    .muted{color:var(--muted)}.danger{color:var(--danger)}.ok{color:var(--ok)}
    .auth{max-width:480px;margin:32px auto}.stack{display:flex;flex-direction:column;gap:12px}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .status{margin-top:12px;color:var(--muted);font-size:14px}.code{word-break:break-all;background:#f2f4f7;border:1px solid var(--line);border-radius:6px;padding:10px}
    @media(max-width:760px){.shell{display:block}nav{border-right:0;border-bottom:1px solid var(--line)}main{padding:16px}.page-head{display:block}}
  </style>
</head>
<body>
  <header><strong>Vault</strong>${authenticated ? '<a href="/logout" style="color:#fff">Logout</a>' : ''}</header>
  ${authenticated ? `<div class="shell">${nav(active)}<main>${body}</main></div>` : `<main>${body}</main>`}
</body>
</html>`;
}

function nav(active: NavItem): string {
  const items: Array<[NavItem, string, string]> = [
    ['overview', 'Overview', '/'],
    ['applications', 'Applications', '/applications'],
    ['deployments', 'Deployments', '/deployments'],
    ['configs', 'Configs', '/configs'],
    ['runtime-keys', 'Runtime Keys', '/runtime-keys'],
    ['plugins', 'Plugins', '/plugins'],
    ['profile', 'Profile', '/profile'],
  ];
  return `<nav>${items.map(([id, label, href]) => `<a class="${id === active ? 'active' : ''}" href="${href}">${label}</a>`).join('')}</nav>`;
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

function overviewPage(data: DashboardData): string {
  return `<div class="page-head"><div><h1>Overview</h1><p class="muted">Current Vault inventory and deployment configuration status.</p></div></div>
  <div class="grid">
    ${metric('Applications', data.applications.length)}
    ${metric('Service Groups', data.groups.length)}
    ${metric('Deployment Profiles', data.profiles.length)}
    ${metric('Runtime Keys', data.runtimeKeys.length)}
  </div>
  <section><h2>Recent Runtime Keys</h2>${runtimeKeyTable(data.runtimeKeys.slice(0, 8), data)}</section>`;
}

function applicationsPage(data: DashboardData): string {
  return `<div class="page-head"><div><h1>Applications</h1><p class="muted">Create product or system boundaries for deployment profiles.</p></div></div>
  <section><h2>Create Application</h2>
    <form data-api="/api/applications" data-redirect="/applications">
      <div class="form-grid">
        ${input('name', 'Name', true)}
        ${input('description', 'Description')}
      </div>
      <button>Create Application</button><p class="status"></p>
    </form>
  </section>
  <section><h2>Applications</h2>${applicationsTable(data)}</section>
  ${formScript()}`;
}

function deploymentsPage(data: DashboardData): string {
  return `<div class="page-head"><div><h1>Deployments</h1><p class="muted">Model service groups and deployment profiles for containers.</p></div></div>
  <div class="grid">
    <section><h2>Create Service Group</h2>
      <form data-api="/api/groups" data-redirect="/deployments">
        ${select('applicationId', 'Application', data.applications.map((x) => [x.id, x.name]))}
        ${input('name', 'Group Name', true)}
        <button>Create Group</button><p class="status"></p>
      </form>
    </section>
    <section><h2>Create Deployment Profile</h2>
      <form data-api="/api/profiles" data-redirect="/deployments">
        ${select('groupId', 'Service Group', data.groups.map((x) => [x.id, groupLabel(x, data)]))}
        ${input('name', 'Profile Name', true, 'default')}
        <button>Create Profile</button><p class="status"></p>
      </form>
    </section>
  </div>
  <section><h2>Service Groups</h2>${groupsTable(data)}</section>
  <section><h2>Deployment Profiles</h2>${profilesTable(data)}</section>
  ${formScript()}`;
}

function configsPage(data: DashboardData): string {
  return `<div class="page-head"><div><h1>Configs</h1><p class="muted">Save draft runtime config for a deployment profile, then publish it when ready.</p></div></div>
  <section><h2>Edit Draft</h2>
    <form data-api="/api/drafts" data-redirect="/configs">
      ${select('profileId', 'Deployment Profile', data.profiles.map((x) => [x.id, profileLabel(x, data)]))}
      <label>Config JSON</label><textarea name="config" required placeholder='{"default":{"observable":{},"events":{},"services":{}}}'></textarea>
      <button>Save Draft</button><p class="status"></p>
    </form>
  </section>
  <section><h2>Publish Draft</h2>
    <form data-api="/api/publish" data-redirect="/configs">
      ${select('profileId', 'Deployment Profile', data.profiles.map((x) => [x.id, profileLabel(x, data)]))}
      <button>Publish Active Version</button><p class="status"></p>
    </form>
  </section>
  ${formScript()}`;
}

function runtimeKeysPage(data: DashboardData, secret: string): string {
  return `<div class="page-head"><div><h1>Runtime Keys</h1><p class="muted">Bind a container credential to one application, service group, deployment profile, and config plugin.</p></div></div>
  ${secret ? `<section><h2>Runtime Secret</h2><p class="muted">Shown once. Store it in the container environment now.</p><p class="code"><code>${escapeHtml(secret)}</code></p></section>` : ''}
  <section><h2>Create Runtime Key</h2>
    <form data-api="/api/runtime-keys" data-secret-redirect="/runtime-keys">
      <div class="form-grid">
        ${input('name', 'Name', true)}
        ${select('applicationId', 'Application', data.applications.map((x) => [x.id, x.name]))}
        ${select('groupId', 'Service Group', data.groups.map((x) => [x.id, groupLabel(x, data)]))}
        ${select('profileId', 'Deployment Profile', data.profiles.map((x) => [x.id, profileLabel(x, data)]))}
        ${input('containerName', 'Container Name')}
        ${input('configPluginId', 'Config Plugin', true, 'config-vault')}
      </div>
      <button>Create Runtime Key</button><p class="status"></p>
    </form>
  </section>
  <section><h2>Runtime Keys</h2>${runtimeKeyTable(data.runtimeKeys, data)}</section>
  ${formScript()}`;
}

function pluginsPage(data: DashboardData): string {
  return `<div class="page-head"><div><h1>Plugin Catalog</h1><p class="muted">Register public, private, or uploaded plugin schemas for config authoring.</p></div></div>
  <section><h2>Create Plugin</h2>
    <form data-api="/api/plugins" data-redirect="/plugins">
      <div class="form-grid">
        ${input('org', 'Org', true, '_')}
        ${input('name', 'Name', true)}
        ${input('pluginId', 'Plugin ID', true)}
        ${input('packageName', 'Package')}
        ${input('version', 'Version', true, '0.0.0')}
        ${select('kind', 'Kind', [['service', 'service'], ['events', 'events'], ['observable', 'observable'], ['config', 'config']])}
        ${select('source', 'Source', [['manual', 'manual'], ['registry', 'registry'], ['upload', 'upload']])}
      </div>
      <label>Config Schema JSON</label><textarea name="configSchema" placeholder='{"type":"object"}'></textarea>
      <button>Create Plugin</button><p class="status"></p>
    </form>
  </section>
  <section><h2>Catalog</h2>${table(data.plugins.map((x) => [x.pluginId, x.version, x.kind, x.source, x.packageName ?? '']))}</section>
  ${formScript()}`;
}

function profilePage(data: UserProfileData): string {
  return `<div class="page-head"><div><h1>Profile</h1><p class="muted">Account security and admin authentication settings.</p></div></div>
  <section><h2>Account</h2>${table([[data.user.email, data.user.createdAt]])}</section>
  <section><h2>Passkey Accounts</h2>
    ${data.passkeys.length === 0 ? '<p class="muted">No passkeys registered.</p>' : table(data.passkeys.map((x) => [shortId(x.credentialId), x.createdAt]))}
    <p><a class="button" href="/passkeys/setup">Add Passkey</a></p>
  </section>`;
}

function applicationsTable(data: DashboardData): string {
  if (data.applications.length === 0) return '<p class="muted">None</p>';
  return `<table>${data.applications.map((app) => `<tr><td>
    <form data-api="/api/applications/update" data-redirect="/applications" class="inline-form">
      <input type="hidden" name="id" value="${escapeHtml(app.id)}">
      ${input('name', 'Name', true, app.name)}
      ${input('description', 'Description', false, app.description ?? '')}
      <button>Save</button><p class="status"></p>
    </form>
  </td><td class="actions">${deleteForm('/api/applications/delete', app.id, '/applications', 'Delete application and related groups, profiles, configs, and keys?')}</td></tr>`).join('')}</table>`;
}

function groupsTable(data: DashboardData): string {
  if (data.groups.length === 0) return '<p class="muted">None</p>';
  return `<table>${data.groups.map((group) => `<tr><td>
    <form data-api="/api/groups/update" data-redirect="/deployments" class="inline-form">
      <input type="hidden" name="id" value="${escapeHtml(group.id)}">
      ${select('applicationId', 'Application', selectedOptions(data.applications.map((x) => [x.id, x.name]), group.applicationId))}
      ${input('name', 'Name', true, group.name)}
      <button>Save</button><p class="status"></p>
    </form>
  </td><td class="actions">${deleteForm('/api/groups/delete', group.id, '/deployments', 'Delete group and related profiles, configs, and keys?')}</td></tr>`).join('')}</table>`;
}

function profilesTable(data: DashboardData): string {
  if (data.profiles.length === 0) return '<p class="muted">None</p>';
  return `<table>${data.profiles.map((profile) => `<tr><td>
    <form data-api="/api/profiles/update" data-redirect="/deployments" class="inline-form">
      <input type="hidden" name="id" value="${escapeHtml(profile.id)}">
      ${select('groupId', 'Service Group', selectedOptions(data.groups.map((x) => [x.id, groupLabel(x, data)]), profile.groupId))}
      ${input('name', 'Name', true, profile.name)}
      <span class="muted">${profile.activeVersionId ? 'published' : 'no published config'}</span>
      <button>Save</button><p class="status"></p>
    </form>
  </td><td class="actions">${deleteForm('/api/profiles/delete', profile.id, '/deployments', 'Delete deployment profile and related configs and keys?')}</td></tr>`).join('')}</table>`;
}

function deleteForm(action: string, id: string, redirect: string, confirm: string): string {
  return `<form data-api="${escapeHtml(action)}" data-redirect="${escapeHtml(redirect)}" data-confirm="${escapeHtml(confirm)}">
    <input type="hidden" name="id" value="${escapeHtml(id)}">
    <button class="secondary" type="submit">Delete</button><p class="status"></p>
  </form>`;
}

function metric(label: string, value: number): string {
  return `<section><p class="muted">${escapeHtml(label)}</p><div class="metric">${value}</div></section>`;
}

function input(name: string, label: string, required = false, value = ''): string {
  return `<label>${escapeHtml(label)}<input name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${required ? 'required' : ''}></label>`;
}

function select(name: string, label: string, options: Array<[string, string]>): string {
  const body = options.length === 0
    ? '<option value="">Create the required parent record first</option>'
    : options.map(([value, optionLabel]) => {
      const selected = optionLabel.endsWith('\u0000selected');
      const labelText = selected ? optionLabel.slice(0, -9) : optionLabel;
      return `<option value="${escapeHtml(value)}" ${selected ? 'selected' : ''}>${escapeHtml(labelText)}</option>`;
    }).join('');
  return `<label>${escapeHtml(label)}<select name="${escapeHtml(name)}" ${options.length === 0 ? 'disabled' : 'required'}>${body}</select></label>`;
}

function selectedOptions(options: Array<[string, string]>, selectedValue: string): Array<[string, string]> {
  return options.map(([value, label]) => [value, value === selectedValue ? `${label}\u0000selected` : label]);
}

function groupLabel(group: { id: string; applicationId: string; name: string }, data: DashboardData): string {
  const app = data.applications.find((candidate) => candidate.id === group.applicationId);
  return `${app?.name ?? 'Unknown'} / ${group.name}`;
}

function profileLabel(profile: { id: string; groupId: string; name: string }, data: DashboardData): string {
  const group = data.groups.find((candidate) => candidate.id === profile.groupId);
  return `${group ? groupLabel(group, data) : 'Unknown'} / ${profile.name}`;
}

function runtimeKeyTable(keys: DashboardData['runtimeKeys'], data: DashboardData): string {
  return table(keys.map((key) => [
    key.name,
    key.id,
    profileLabel({ id: key.profileId, groupId: key.groupId, name: data.profiles.find((profile) => profile.id === key.profileId)?.name ?? key.profileId }, data),
    key.containerName ?? '',
    key.revokedAt ?? 'active',
  ]));
}

function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function formScript(): string {
  return `<script>
  document.querySelectorAll('form[data-api]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.dataset.confirm && !confirm(form.dataset.confirm)) return;
      const status = form.querySelector('.status');
      if (status) { status.textContent = 'Saving...'; status.className = 'status'; }
      try {
        const data = {};
        for (const [key, value] of new FormData(form).entries()) {
          if (typeof value !== 'string' || value.trim() === '') continue;
          data[key] = value;
        }
        const csrf = document.cookie.split('; ').find((x) => x.startsWith('vault_csrf='))?.split('=')[1] || '';
        const res = await fetch(form.dataset.api, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || 'Save failed');
        if (form.dataset.secretRedirect && result.secret) {
          location.href = form.dataset.secretRedirect + '?secret=' + encodeURIComponent(result.secret);
          return;
        }
        location.href = form.dataset.redirect || location.pathname;
      } catch (error) {
        if (status) {
          status.textContent = error instanceof Error ? error.message : 'Save failed';
          status.className = 'status danger';
        }
      }
    });
  });
  </script>`;
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
