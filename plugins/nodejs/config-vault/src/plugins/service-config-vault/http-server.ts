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
      await this.options.vault.createFirstAdmin({
        setupCode: String(body.setupCode ?? ''),
        email: String(body.email ?? ''),
        password: String(body.password ?? ''),
        totpCode: String(body.totpCode ?? ''),
        passkeyCredential: parseJsonObject(body.passkeyCredential),
      });
      return sendRedirect(event, '/login');
    }));

    app.use('/login', defineEventHandler(async (event) => {
      if (getMethod(event) === 'GET') return this.page('Vault Login', loginForm());
      const body = await readBody<Record<string, unknown>>(event);
      const session = await this.options.vault.login(
        String(body.email ?? ''),
        String(body.password ?? ''),
        String(body.totpCode ?? ''),
        parseJsonObject(body.passkeyCredential),
      );
      setCookie(event, 'vault_session', session.sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.options.production,
        path: '/',
      });
      setCookie(event, 'vault_csrf', session.csrfToken, {
        sameSite: 'lax',
        secure: this.options.production,
        path: '/',
      });
      return sendRedirect(event, '/');
    }));

    app.use('/logout', defineEventHandler(async (event) => {
      const sessionId = getCookie(event, 'vault_session');
      if (sessionId) await this.options.vault.logout(sessionId);
      deleteCookie(event, 'vault_session', { path: '/' });
      deleteCookie(event, 'vault_csrf', { path: '/' });
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
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#f7f8fa;color:#15181c}
    header{background:#15181c;color:#fff;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
    main{max-width:1180px;margin:0 auto;padding:24px}
    section{background:#fff;border:1px solid #d9dde3;border-radius:8px;padding:16px;margin:0 0 16px}
    input,textarea,select{display:block;width:100%;box-sizing:border-box;margin:6px 0 12px;padding:9px;border:1px solid #b9c0ca;border-radius:6px;font:inherit}
    textarea{min-height:140px;font-family:ui-monospace,Consolas,monospace}
    button{background:#1267d8;color:#fff;border:0;border-radius:6px;padding:9px 12px;font:inherit;cursor:pointer}
    table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e3e6eb;text-align:left;padding:8px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
    .muted{color:#5b6470}.danger{color:#a40000}
  </style>
</head>
<body>
  <header><strong>Vault</strong><a href="/logout" style="color:#fff">Logout</a></header>
  <main>${body}</main>
</body>
</html>`;
}

function setupForm(): string {
  return `<section><h1>First Admin Setup</h1>
    <p class="muted">Enter the one-time setup code printed in the service logs. Initial TOTP accepts <code>000000</code>; replace it after setup.</p>
    <form method="post">
      <input name="setupCode" placeholder="Setup code" required>
      <input name="email" type="email" placeholder="Admin email" required>
      <input name="password" type="password" placeholder="Password, 12+ chars" required>
      <input name="totpCode" placeholder="TOTP code" required>
      <textarea name="passkeyCredential" placeholder='Optional passkey JSON, e.g. {"id":"admin-device-1"}'></textarea>
      <button>Create Admin</button>
    </form>
  </section>`;
}

function loginForm(): string {
  return `<section><h1>Login</h1>
    <form method="post">
      <input name="email" type="email" placeholder="Email" required>
      <input name="password" type="password" placeholder="Password" required>
      <input name="totpCode" placeholder="TOTP code" required>
      <textarea name="passkeyCredential" placeholder='Passkey JSON, e.g. {"id":"admin-device-1"}'></textarea>
      <button>Login</button>
    </form>
  </section>`;
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
  <section><h2>Create Runtime Key</h2>${apiForm('/api/runtime-keys', ['name', 'applicationId', 'groupId', 'profileId', 'containerName', 'configPluginId'])}</section>`;
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
