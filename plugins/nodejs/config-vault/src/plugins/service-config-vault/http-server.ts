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
import type { RuntimeConfigDefinition, RuntimePluginDefinition } from './types.js';

export interface VaultHttpOptions {
  host: string;
  port: number;
  publicUrl: string;
  registryUrl: string;
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
      return this.options.vault.createDeployment(user.userId, String(body.applicationId ?? ''), String(body.name ?? ''));
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

    app.use('/api/plugins/import', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createPlugin(user.userId, {
        org: String(body.org ?? '_'),
        name: String(body.name ?? ''),
        pluginId: String(body.pluginId ?? body.name ?? ''),
        packageName: body.packageName === undefined || body.packageName === '' ? null : String(body.packageName),
        version: String(body.version ?? '0.0.0'),
        kind: parseKind(body.kind),
        source: 'registry',
        configSchema: parseJsonObject(body.configSchema) ?? null,
        eventSchema: parseJsonObject(body.eventSchema) ?? null,
      });
    }));

    app.use('/api/plugins/delete', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.deletePlugin(user.userId, String(body.id ?? ''));
      return { success: true };
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
      const config = parseJsonObject(body.config) as RuntimeConfigDefinition | undefined;
      if (!config) throw new Error('Config must be a JSON object');
      await this.options.vault.saveProfileDraft(user.userId, String(body.profileId ?? ''), config);
      return { success: true };
    }));

    app.use('/api/publish', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.publishDraft(user.userId, String(body.profileId ?? ''));
    }));

    app.use('/api/application-profile-plugins/delete', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.removeApplicationProfilePlugin(user.userId, {
        applicationProfileId: String(body.applicationProfileId ?? ''),
        section: parseConfigSection(body.section),
        name: String(body.name ?? ''),
      });
      return { success: true };
    }));

    app.use('/api/application-profile-plugins', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.upsertApplicationProfilePlugin(user.userId, {
        applicationProfileId: String(body.applicationProfileId ?? ''),
        section: parseConfigSection(body.section),
        name: String(body.name ?? ''),
        plugin: String(body.plugin ?? ''),
        packageName: stringOrUndefined(body.packageName) ?? null,
        version: stringOrUndefined(body.version) ?? null,
        enabled: body.enabled === true || body.enabled === 'true' || body.enabled === 'on',
        config: parseJsonObject(body.config) ?? {},
      });
      return { success: true };
    }));

    app.use('/api/application-profile-publish', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.publishApplicationProfileDraft(user.userId, String(body.applicationProfileId ?? ''));
    }));

    app.use('/api/profile-plugins/delete', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.removeProfilePlugin(user.userId, {
        profileId: String(body.profileId ?? ''),
        section: parseConfigSection(body.section),
        name: String(body.name ?? ''),
      });
      return { success: true };
    }));

    app.use('/api/profile-plugins/copy', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.copyProfilePlugin(user.userId, {
        sourceProfileId: String(body.sourceProfileId ?? ''),
        targetProfileId: String(body.targetProfileId ?? ''),
        section: parseConfigSection(body.section),
        name: String(body.name ?? ''),
        overwrite: body.overwrite === true || body.overwrite === 'true' || body.overwrite === 'on',
      });
      return { success: true };
    }));

    app.use('/api/profile-plugins', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      await this.options.vault.upsertProfilePlugin(user.userId, {
        profileId: String(body.profileId ?? ''),
        section: parseConfigSection(body.section),
        name: String(body.name ?? ''),
        plugin: String(body.plugin ?? ''),
        packageName: stringOrUndefined(body.packageName) ?? null,
        version: stringOrUndefined(body.version) ?? null,
        enabled: parseOptionalBoolean(body.enabled),
        config: parseJsonObject(body.config) ?? {},
        baseEnabled: parseOptionalBoolean(body.baseEnabled),
        baseConfig: parseJsonObject(body.baseConfig),
        overridePaths: parseStringArray(body.overridePaths),
      });
      return { success: true };
    }));

    app.use('/api/runtime-keys/rotate', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.rotateProfileRuntimeKey(user.userId, {
        keyId: String(body.keyId ?? ''),
        name: stringOrUndefined(body.name),
      });
    }));

    app.use('/api/runtime-keys', defineEventHandler(async (event) => {
      const user = await this.requireUser(event);
      const body = await readBody<Record<string, unknown>>(event);
      return this.options.vault.createProfileRuntimeKey(user.userId, {
        name: String(body.name ?? ''),
        profileId: String(body.profileId ?? ''),
        containerName: body.containerName === undefined ? null : String(body.containerName),
      });
    }));

    app.use('/applications', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Applications', applicationsPage(dashboard), 'applications');
    }));

    app.use('/application-config', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const query = getQuery(event);
      const applicationId = String(query.applicationId ?? '');
      const profile = String(query.profile ?? 'default');
      if (!applicationId) return sendRedirect(event, '/applications');
      const data = await this.options.vault.applicationProfile(applicationId, profile);
      return this.page('Application Config', applicationConfigPage(data), 'applications');
    }));

    app.use('/deployments', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const dashboard = await this.options.vault.dashboard();
      return this.page('Deployments', deploymentsPage(dashboard), 'deployments');
    }));

    app.use('/deployment', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const query = getQuery(event);
      const profileId = String(query.profileId ?? '');
      if (!profileId) return sendRedirect(event, '/deployments');
      const profile = await this.options.vault.deploymentProfile(profileId);
      return this.page(
        'Deployment',
        deploymentDetailPage(profile, {
          publicUrl: this.options.publicUrl,
          keyId: String(query.keyId ?? ''),
          secret: String(query.secret ?? ''),
        }),
        'deployments',
      );
    }));

    app.use('/configs', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const dashboard = await this.options.vault.dashboard();
      const firstProfile = dashboard.profiles[0];
      return firstProfile ? sendRedirect(event, `/deployment?profileId=${encodeURIComponent(firstProfile.id)}`) : sendRedirect(event, '/deployments');
    }));

    app.use('/runtime-keys', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const query = getQuery(event);
      const dashboard = await this.options.vault.dashboard();
      const firstProfile = dashboard.profiles[0];
      if (!String(query.secret ?? '') && firstProfile) {
        return sendRedirect(event, `/deployment?profileId=${encodeURIComponent(firstProfile.id)}`);
      }
      return this.page(
        'Container Key',
        runtimeKeysPage(dashboard, {
          publicUrl: this.options.publicUrl,
          keyId: String(query.keyId ?? ''),
          secret: String(query.secret ?? ''),
        }),
        'runtime-keys',
      );
    }));

    app.use('/plugins', defineEventHandler(async (event) => {
      await this.requireUser(event);
      const query = getQuery(event);
      const dashboard = await this.options.vault.dashboard();
      const registry = await registrySearch(this.options.registryUrl, String(query.query ?? ''));
      return this.page('Plugins', pluginsPage(dashboard, registry, String(query.query ?? '')), 'plugins');
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

type NavItem = 'overview' | 'applications' | 'deployments' | 'runtime-keys' | 'plugins' | 'profile';
type DashboardData = Awaited<ReturnType<VaultService['dashboard']>>;
type UserProfileData = Awaited<ReturnType<VaultService['userProfile']>>;
type DeploymentProfileData = Awaited<ReturnType<VaultService['deploymentProfile']>>;
type ApplicationProfileData = Awaited<ReturnType<VaultService['applicationProfile']>>;
type RegistryCandidate = {
  org: string;
  name: string;
  pluginId: string;
  packageName: string | null;
  version: string;
  kind: 'service' | 'events' | 'observable' | 'config';
  configSchema: Record<string, unknown> | null;
  eventSchema: Record<string, unknown> | null;
};

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
    .tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.tabs a{padding:8px 10px;border:1px solid var(--line);border-radius:6px;text-decoration:none;color:#344054;background:#fff;font-weight:650}.tabs a.active{background:#eaf1ff;color:#155eef;border-color:#b8cdfd}
    .muted{color:var(--muted)}.danger{color:var(--danger)}.ok{color:var(--ok)}
    .auth{max-width:480px;margin:32px auto}.stack{display:flex;flex-direction:column;gap:12px}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .status{margin-top:12px;color:var(--muted);font-size:14px}.code{word-break:break-all;background:#f2f4f7;border:1px solid var(--line);border-radius:6px;padding:10px}
    .schema-box{border:1px solid var(--line);border-radius:6px;margin:12px 0;padding:10px}.schema-box legend{font-weight:750;color:#344054}
    .schema-help{display:block;color:var(--muted);font-size:12px;font-weight:500;margin:-6px 0 10px}.schema-meta{color:var(--muted);font-size:12px;font-weight:500}
    .schema-optional,.schema-override{border-left:3px solid #d0d5dd;margin:12px 0;padding-left:10px}.schema-override{border-left-color:#84c5a8}.schema-toggle{display:flex;gap:8px;align-items:center;margin:0 0 8px}.schema-toggle input{width:auto;margin:0}
    .schema-repeat{border:1px solid #edf0f5;border-radius:6px;margin:12px 0;padding:10px;background:#fbfcfe}.repeat-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:start}.schema-repeat[data-array-path] .repeat-row{grid-template-columns:minmax(0,1fr) auto}
    .schema-union{border:1px solid var(--line);border-radius:6px;margin:12px 0;padding:10px;background:#fbfcfe}.schema-union-panel[hidden]{display:none}
    details.plugin-card{border:1px solid var(--line);border-radius:6px;margin:10px 0;background:#fff}details.plugin-card>summary{display:flex;justify-content:space-between;gap:12px;align-items:center;cursor:pointer;padding:12px 14px;font-weight:750;color:#344054}.plugin-card-body{border-top:1px solid var(--line);padding:14px}.chip{display:inline-flex;align-items:center;border:1px solid #d0d5dd;border-radius:999px;padding:2px 8px;font-size:12px;font-weight:650;color:#344054;background:#f9fafb}
    .state-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:750;border:1px solid #d0d5dd;background:#f9fafb;color:#344054}.state-badge.live{border-color:#abefc6;background:#ecfdf3;color:#067647}.state-badge.pending,.state-badge.draft{border-color:#fedf89;background:#fffaeb;color:#b54708}.state-badge.empty{border-color:#d0d5dd;background:#f9fafb;color:#637083}
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
    ${metric('Deployments', data.groups.length)}
    ${metric('Deployment Profiles', data.profiles.length)}
    ${metric('Container Keys', data.runtimeKeys.length)}
  </div>
  <section><h2>Recent Container Keys</h2>${runtimeKeyTable(data.runtimeKeys.slice(0, 8), data)}</section>`;
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
  return `<div class="page-head"><div><h1>Deployments</h1><p class="muted">A deployment represents the container group that will receive one selected profile.</p></div></div>
  <section><h2>Create Deployment</h2>
      <form data-api="/api/groups" data-redirect="/deployments">
        ${select('applicationId', 'Application', data.applications.map((x) => [x.id, x.name]))}
        ${input('name', 'Deployment Name', true)}
        <button>Create Deployment</button><p class="status"></p>
      </form>
    </section>
  <section><h2>Deployments</h2>${groupsTable(data)}</section>
  <section><h2>Profiles</h2>${profilesTable(data)}</section>
  ${formScript()}`;
}

function runtimeKeysPage(
  data: DashboardData,
  credential: { publicUrl: string; keyId: string; secret: string },
): string {
  return `<div class="page-head"><div><h1>Container Key</h1><p class="muted">Use these env vars in the target BSB container.</p></div></div>
  ${credential.secret ? runtimeEnvBlock(credential) : ''}
  <section><h2>Container Keys</h2>${runtimeKeyTable(data.runtimeKeys, data)}</section>`;
}

function deploymentDetailPage(
  data: DeploymentProfileData,
  credential: { publicUrl: string; keyId: string; secret: string },
): string {
  const draft: RuntimeConfigDefinition = data.draft ?? { observable: {}, events: {}, services: {} };
  const inherited: RuntimeConfigDefinition = data.inheritedDraft ?? { observable: {}, events: {}, services: {} };
  const redirect = `/deployment?profileId=${encodeURIComponent(data.profile.id)}`;
  return `<div class="page-head"><div><h1>${escapeHtml(data.group.name)}</h1><p class="muted">${escapeHtml(data.application.name)} / ${escapeHtml(data.profile.name)}</p></div><a class="button secondary" href="/deployments">Back</a></div>
  <div class="tabs">${data.profiles.map((profile) => `<a class="${profile.id === data.profile.id ? 'active' : ''}" href="/deployment?profileId=${encodeURIComponent(profile.id)}">${escapeHtml(profile.name)}</a>`).join('')}</div>
  ${credential.secret ? runtimeEnvBlock(credential) : ''}
  <div class="grid">
    <section><h2>Shared App Config</h2>
      <p>${configStateBadge(data.inheritedConfigState)} <span class="muted">Inherited from ${escapeHtml(data.application.name)} / ${escapeHtml(data.profile.name)}</span></p>
      <p><a class="button secondary" href="/application-config?applicationId=${encodeURIComponent(data.application.id)}&profile=${encodeURIComponent(data.profile.name)}">Edit Shared Config</a></p>
    </section>
    <section><h2>Deployment Config</h2>
      <p>${configStateBadge(data.configState)} <span class="muted">Local overrides for this container group.</span></p>
    </section>
  </div>
  <div class="grid">
    <section><h2>Create Profile</h2>
      <form data-api="/api/profiles" data-redirect="${escapeHtml(redirect)}">
        <input type="hidden" name="groupId" value="${escapeHtml(data.group.id)}">
        ${input('name', 'Profile Name', true)}
        <button>Create Profile</button><p class="status"></p>
      </form>
    </section>
    <section><h2>Container Key</h2>
      <form data-api="/api/runtime-keys" data-secret-redirect="${escapeHtml(redirect)}">
        <input type="hidden" name="profileId" value="${escapeHtml(data.profile.id)}">
        ${input('name', 'Key Name', true, `${data.group.name}-${data.profile.name}`)}
        ${input('containerName', 'Container Name')}
        <button>Create Key</button><p class="status"></p>
      </form>
    </section>
  </div>
  ${hasConfigEntries(inherited) ? `<section><h2>Inherited Config</h2>
    <p class="muted">These values come from the shared application config. Save an override here to customize any field for this deployment profile.</p>
    ${inheritedOverrideEditor(data, inherited, draft, redirect)}
  </section>` : ''}
  <section><h2>Profile Config</h2>
    <p>${configStateBadge(data.configState)}</p>
    ${profileConfigEditor(data, draft, redirect)}
    <form data-api="/api/publish" data-redirect="${escapeHtml(redirect)}">
      <input type="hidden" name="profileId" value="${escapeHtml(data.profile.id)}">
      <button class="secondary">Publish Draft</button><p class="status"></p>
    </form>
  </section>
  <section><h2>Container Keys</h2>${profileRuntimeKeyTable(data.runtimeKeys, data)}</section>
  ${pluginEditorScript(data.plugins)}
  ${formScript()}`;
}

function applicationConfigPage(data: ApplicationProfileData): string {
  const draft: RuntimeConfigDefinition = data.draft ?? { observable: {}, events: {}, services: {} };
  const redirect = `/application-config?applicationId=${encodeURIComponent(data.application.id)}&profile=${encodeURIComponent(data.applicationProfile.name)}`;
  return `<div class="page-head"><div><h1>${escapeHtml(data.application.name)}</h1><p class="muted">Shared config for deployment profile ${escapeHtml(data.applicationProfile.name)}.</p></div><a class="button secondary" href="/applications">Back</a></div>
  <div class="tabs">${data.applicationProfiles.map((profile) => `<a class="${profile.id === data.applicationProfile.id ? 'active' : ''}" href="/application-config?applicationId=${encodeURIComponent(data.application.id)}&profile=${encodeURIComponent(profile.name)}">${escapeHtml(profile.name)}</a>`).join('')}</div>
  <section><h2>Shared Config</h2>
    <p>${configStateBadge(data.configState)} <span class="muted">Published values are inherited by deployments with the same profile name.</span></p>
    ${applicationProfileConfigEditor(data, draft, redirect)}
    <form data-api="/api/application-profile-publish" data-redirect="${escapeHtml(redirect)}">
      <input type="hidden" name="applicationProfileId" value="${escapeHtml(data.applicationProfile.id)}">
      <button class="secondary">Publish Shared Draft</button><p class="status"></p>
    </form>
  </section>
  ${pluginEditorScript(data.plugins)}
  ${formScript()}`;
}

function pluginsPage(data: DashboardData, registry: RegistryCandidate[], query: string): string {
  const visiblePlugins = data.plugins.filter((plugin) => plugin.kind !== 'config');
  const visibleRegistry = registry.filter((plugin) => plugin.kind !== 'config');
  return `<div class="page-head"><div><h1>Plugin Catalog</h1><p class="muted">Import registry plugins for config authoring, or create private plugin entries manually.</p></div></div>
  <section><h2>Registry Search</h2>
    <form method="get" action="/plugins" class="inline-form">
      ${input('query', 'Search', false, query)}
      <button>Search Registry</button>
    </form>
    ${visibleRegistry.length === 0 ? '<p class="muted">No configurable registry results loaded.</p>' : registryTable(visibleRegistry, visiblePlugins)}
  </section>
  <section><h2>Private Plugin</h2>
    <form data-api="/api/plugins" data-redirect="/plugins">
      <div class="form-grid">
        ${input('org', 'Org', true, '_')}
        ${input('name', 'Name', true)}
        ${input('pluginId', 'Plugin ID', true)}
        ${input('packageName', 'Package')}
        ${input('version', 'Version', true, '0.0.0')}
        ${select('kind', 'Kind', [['service', 'service'], ['events', 'events'], ['observable', 'observable']])}
      </div>
      <label>Config Schema JSON</label><textarea name="configSchema" placeholder='{"type":"object"}'></textarea>
      <button>Create Plugin</button><p class="status"></p>
    </form>
  </section>
  <section><h2>Catalog</h2>${pluginCatalogTable(visiblePlugins, data.pluginUsage)}</section>
  ${formScript()}`;
}

function pluginCatalogTable(plugins: DashboardData['plugins'], usage: DashboardData['pluginUsage']): string {
  if (plugins.length === 0) return '<p class="muted">No plugins imported.</p>';
  return `<table>${plugins.map((plugin) => {
    const used = usage[plugin.id]?.count ?? 0;
    return `<tr>
      <td>${escapeHtml(pluginDisplayName(plugin))}</td>
      <td>${escapeHtml(plugin.version)}</td>
      <td>${escapeHtml(plugin.kind)}</td>
      <td>${escapeHtml(plugin.source)}</td>
      <td>${escapeHtml(plugin.packageName ?? '')}</td>
      <td>${used}</td>
      <td>${used === 0 ? `<form data-api="/api/plugins/delete" data-redirect="/plugins" data-confirm="Delete this unused plugin version?"><input type="hidden" name="id" value="${escapeHtml(plugin.id)}"><button class="secondary">Delete</button><p class="status"></p></form>` : '<span class="muted">In use</span>'}</td>
    </tr>`;
  }).join('')}</table>`;
}

function registryTable(items: RegistryCandidate[], importedPlugins: DashboardData['plugins']): string {
  return `<table>${items.map((item) => {
    const imported = registryPluginImported(item, importedPlugins);
    return `<tr>
    <td>${escapeHtml(pluginDisplayName(item))}</td>
    <td>${escapeHtml(item.version)}</td>
    <td>${escapeHtml(item.kind)}</td>
    <td>${escapeHtml(item.packageName ?? '')}</td>
    <td>${imported ? '<span class="state-badge live">Imported</span>' : '<span class="muted">Not imported</span>'}</td>
    <td>
      ${imported ? '<button class="secondary" disabled>Imported</button>' : `<form data-api="/api/plugins/import" data-redirect="/plugins">
        <input type="hidden" name="org" value="${escapeHtml(item.org)}">
        <input type="hidden" name="name" value="${escapeHtml(item.name)}">
        <input type="hidden" name="pluginId" value="${escapeHtml(item.pluginId)}">
        <input type="hidden" name="packageName" value="${escapeHtml(item.packageName ?? '')}">
        <input type="hidden" name="version" value="${escapeHtml(item.version)}">
        <input type="hidden" name="kind" value="${escapeHtml(item.kind)}">
        <input type="hidden" name="configSchema" value="${escapeHtml(JSON.stringify(item.configSchema ?? {}))}">
        <input type="hidden" name="eventSchema" value="${escapeHtml(JSON.stringify(item.eventSchema ?? {}))}">
        <button class="secondary">Import</button><p class="status"></p>
      </form>`}
    </td>
  </tr>`;
  }).join('')}</table>`;
}

function registryPluginImported(item: RegistryCandidate, importedPlugins: DashboardData['plugins']): boolean {
  return importedPlugins.some((plugin) =>
    plugin.pluginId === item.pluginId &&
    plugin.version === item.version &&
    (item.packageName ? plugin.packageName === item.packageName : true)
  );
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
  </td><td class="actions">
    <a class="button secondary" href="/application-config?applicationId=${encodeURIComponent(app.id)}&profile=default">Shared Config</a>
    <a class="button secondary" href="/deployments">Deployments</a>
    ${deleteForm('/api/applications/delete', app.id, '/applications', 'Delete application and related deployments, profiles, configs, and keys?')}
  </td></tr>`).join('')}</table>`;
}

function groupsTable(data: DashboardData): string {
  if (data.groups.length === 0) return '<p class="muted">None</p>';
  const defaultProfileFor = (groupId: string) => data.profiles.find((profile) => profile.groupId === groupId && profile.name === 'default') ?? data.profiles.find((profile) => profile.groupId === groupId);
  return `<table>${data.groups.map((group) => `<tr><td>
    <form data-api="/api/groups/update" data-redirect="/deployments" class="inline-form">
      <input type="hidden" name="id" value="${escapeHtml(group.id)}">
      ${select('applicationId', 'Application', selectedOptions(data.applications.map((x) => [x.id, x.name]), group.applicationId))}
      ${input('name', 'Name', true, group.name)}
      <button>Save</button><p class="status"></p>
    </form>
  </td><td class="actions">
    ${defaultProfileFor(group.id) ? `<a class="button secondary" href="/deployment?profileId=${encodeURIComponent(defaultProfileFor(group.id)!.id)}">Open</a>` : ''}
    ${deleteForm('/api/groups/delete', group.id, '/deployments', 'Delete deployment and related profiles, configs, and keys?')}
  </td></tr>`).join('')}</table>`;
}

function profilesTable(data: DashboardData): string {
  if (data.profiles.length === 0) return '<p class="muted">None</p>';
  return `<table>${data.profiles.map((profile) => `<tr><td>
    <form data-api="/api/profiles/update" data-redirect="/deployments" class="inline-form">
      <input type="hidden" name="id" value="${escapeHtml(profile.id)}">
      ${select('groupId', 'Deployment', selectedOptions(data.groups.map((x) => [x.id, groupLabel(x, data)]), profile.groupId))}
      ${input('name', 'Name', true, profile.name)}
      <span class="muted">${profile.activeVersionId ? 'published' : 'no published config'}</span>
      <button>Save</button><p class="status"></p>
    </form>
  </td><td class="actions">
    <a class="button secondary" href="/deployment?profileId=${encodeURIComponent(profile.id)}">Open</a>
    ${deleteForm('/api/profiles/delete', profile.id, '/deployments', 'Delete deployment profile and related configs and keys?')}
  </td></tr>`).join('')}</table>`;
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

function groupLabel(group: { id: string; applicationId: string; name: string }, data: Pick<DashboardData, 'applications'>): string {
  const app = data.applications.find((candidate) => candidate.id === group.applicationId);
  return `${app?.name ?? 'Unknown'} / ${group.name}`;
}

function profileLabel(profile: { id: string; groupId: string; name: string }, data: Pick<DashboardData, 'applications' | 'groups'>): string {
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

function configStateBadge(configState?: { state: string; draftUpdatedAt: string | null; publishedAt: string | null }): string {
  configState ??= { state: 'empty', draftUpdatedAt: null, publishedAt: null };
  const labels: Record<string, string> = {
    empty: 'No config',
    'draft-only': 'Draft only',
    published: 'Live',
    'draft-pending': 'Unpublished changes',
  };
  const css = configState.state === 'published'
    ? 'live'
    : configState.state === 'draft-pending'
      ? 'pending'
      : configState.state === 'draft-only'
        ? 'draft'
        : 'empty';
  const detail = configState.state === 'draft-pending'
    ? `Draft saved ${configState.draftUpdatedAt ?? ''}; live ${configState.publishedAt ?? ''}`
    : configState.state === 'published'
      ? `Live since ${configState.publishedAt ?? ''}`
      : configState.state === 'draft-only'
        ? `Draft saved ${configState.draftUpdatedAt ?? ''}`
        : 'No draft or live config';
  return `<span class="state-badge ${css}" title="${escapeHtml(detail)}">${escapeHtml(labels[configState.state] ?? configState.state)}</span>`;
}

function hasConfigEntries(config: RuntimeConfigDefinition): boolean {
  return ['services', 'events', 'observable'].some((section) =>
    Object.keys(config[section as keyof RuntimeConfigDefinition] ?? {}).length > 0
  );
}

function profileConfigEditor(data: DeploymentProfileData, draft: RuntimeConfigDefinition, redirect: string): string {
  return `
    ${addPluginForm(data, redirect)}
    ${configSectionEditor(data, draft, 'services', 'Services', redirect)}
    ${configSectionEditor(data, draft, 'events', 'Events', redirect)}
    ${configSectionEditor(data, draft, 'observable', 'Observable', redirect)}
  `;
}

function applicationProfileConfigEditor(data: ApplicationProfileData, draft: RuntimeConfigDefinition, redirect: string): string {
  return `
    ${addApplicationPluginForm(data, redirect)}
    ${applicationConfigSectionEditor(data, draft, 'services', 'Services', redirect)}
    ${applicationConfigSectionEditor(data, draft, 'events', 'Events', redirect)}
    ${applicationConfigSectionEditor(data, draft, 'observable', 'Observable', redirect)}
  `;
}

function addPluginForm(data: DeploymentProfileData, redirect: string): string {
  const configurablePlugins = data.plugins.filter((plugin) => plugin.kind !== 'config');
  if (configurablePlugins.length === 0) {
    return '<p class="muted">Import or create plugins in the Plugin Catalog before adding profile config.</p>';
  }
  return `<section><h3>Add Plugin</h3>
    <form data-api="/api/profile-plugins" data-redirect="${escapeHtml(redirect)}" data-config-form>
      <input type="hidden" name="profileId" value="${escapeHtml(data.profile.id)}">
      <input type="hidden" name="plugin">
      <input type="hidden" name="packageName">
      <input type="hidden" name="version">
      <input type="hidden" name="section">
      <input type="hidden" name="config">
      <div class="form-grid">
        <label>Plugin<select name="catalogId" data-plugin-picker required>${configurablePlugins.map((plugin) => `<option value="${escapeHtml(plugin.id)}">${escapeHtml(pluginDisplayName(plugin))} ${escapeHtml(plugin.version)}</option>`).join('')}</select></label>
        <label>Type<input name="typeDisplay" disabled></label>
        ${input('name', 'Config Name', true)}
        <label>Enabled<select name="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label class="schema-toggle"><input type="checkbox" name="lockVersion" data-version-lock>Lock Version</label>
      </div>
      <div data-config-fields></div>
      <button>Add Plugin</button><p class="status"></p>
    </form>
  </section>`;
}

function addApplicationPluginForm(data: ApplicationProfileData, redirect: string): string {
  const configurablePlugins = data.plugins.filter((plugin) => plugin.kind !== 'config');
  if (configurablePlugins.length === 0) {
    return '<p class="muted">Import or create plugins in the Plugin Catalog before adding shared config.</p>';
  }
  return `<section><h3>Add Shared Plugin</h3>
    <form data-api="/api/application-profile-plugins" data-redirect="${escapeHtml(redirect)}" data-config-form>
      <input type="hidden" name="applicationProfileId" value="${escapeHtml(data.applicationProfile.id)}">
      <input type="hidden" name="plugin">
      <input type="hidden" name="packageName">
      <input type="hidden" name="version">
      <input type="hidden" name="section">
      <input type="hidden" name="config">
      <div class="form-grid">
        <label>Plugin<select name="catalogId" data-plugin-picker required>${configurablePlugins.map((plugin) => `<option value="${escapeHtml(plugin.id)}">${escapeHtml(pluginDisplayName(plugin))} ${escapeHtml(plugin.version)}</option>`).join('')}</select></label>
        <label>Type<input name="typeDisplay" disabled></label>
        ${input('name', 'Config Name', true)}
        <label>Enabled<select name="enabled"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label class="schema-toggle"><input type="checkbox" name="lockVersion" data-version-lock>Lock Version</label>
      </div>
      <div data-config-fields></div>
      <button>Add Shared Plugin</button><p class="status"></p>
    </form>
  </section>`;
}

function configSectionEditor(
  data: DeploymentProfileData,
  draft: RuntimeConfigDefinition,
  section: 'services' | 'events' | 'observable',
  title: string,
  redirect: string,
): string {
  const entries = Object.entries(draft[section] ?? {}).filter(([, entry]) => !entry.override);
  return `<section><h3>${escapeHtml(title)}</h3>
    ${entries.length === 0 ? '<p class="muted">No plugins configured.</p>' : entries.map(([name, entry]) => {
      const catalog = findCatalogPlugin(data, entry.plugin, entry.version, entry.package);
      const pluginLabel = catalog ? pluginDisplayName(catalog) : entry.plugin;
      return `<details class="plugin-card">
        <summary><span>${escapeHtml(name)}</span><span class="chip">${escapeHtml(pluginLabel)} ${escapeHtml(entry.version ?? catalog?.version ?? '')} / ${entry.enabled ? 'enabled' : 'disabled'}</span></summary>
        <div class="plugin-card-body">
        <form data-api="/api/profile-plugins" data-redirect="${escapeHtml(redirect)}" data-config-form>
          <input type="hidden" name="profileId" value="${escapeHtml(data.profile.id)}">
          <input type="hidden" name="section" value="${escapeHtml(section)}">
          <input type="hidden" name="name" value="${escapeHtml(name)}">
          <input type="hidden" name="plugin" value="${escapeHtml(entry.plugin)}">
          <input type="hidden" name="packageName" value="${escapeHtml(entry.package ?? '')}">
          <input type="hidden" name="version" value="${escapeHtml(entry.version ?? '')}">
          <input type="hidden" name="config">
          <div class="form-grid">
            ${input('displayName', 'Config Name', false, name).replace('name="displayName"', 'name="displayName" disabled')}
            ${input('pluginDisplay', 'Plugin', false, pluginLabel).replace('name="pluginDisplay"', 'name="pluginDisplay" disabled')}
            <label>Enabled<select name="enabled">${entry.enabled ? '<option value="true" selected>Enabled</option><option value="false">Disabled</option>' : '<option value="true">Enabled</option><option value="false" selected>Disabled</option>'}</select></label>
            <label class="schema-toggle"><input type="checkbox" name="lockVersion" data-version-lock ${entry.version ? 'checked' : ''}>Lock Version ${escapeHtml(entry.version ?? catalog?.version ?? 'latest')}</label>
          </div>
          <div data-config-fields>${renderSchemaFields(catalog?.configSchema, entry.config ?? {})}</div>
          <button>Save</button><p class="status"></p>
        </form>
        ${copyPluginForm(data, section, name, redirect)}
        <form data-api="/api/profile-plugins/delete" data-redirect="${escapeHtml(redirect)}" data-confirm="Remove this plugin from the profile?">
          <input type="hidden" name="profileId" value="${escapeHtml(data.profile.id)}">
          <input type="hidden" name="section" value="${escapeHtml(section)}">
          <input type="hidden" name="name" value="${escapeHtml(name)}">
          <button class="secondary">Remove</button><p class="status"></p>
        </form>
        </div>
      </details>`;
    }).join('')}
  </section>`;
}

function applicationConfigSectionEditor(
  data: ApplicationProfileData,
  draft: RuntimeConfigDefinition,
  section: 'services' | 'events' | 'observable',
  title: string,
  redirect: string,
): string {
  const entries = Object.entries(draft[section] ?? {});
  return `<section><h3>${escapeHtml(title)}</h3>
    ${entries.length === 0 ? '<p class="muted">No shared plugins configured.</p>' : entries.map(([name, entry]) => {
      const catalog = findCatalogPlugin(data, entry.plugin, entry.version, entry.package);
      const pluginLabel = catalog ? pluginDisplayName(catalog) : entry.plugin;
      return `<details class="plugin-card">
        <summary><span>${escapeHtml(name)}</span><span class="chip">${escapeHtml(pluginLabel)} ${escapeHtml(entry.version ?? catalog?.version ?? '')} / ${entry.enabled ? 'enabled' : 'disabled'}</span></summary>
        <div class="plugin-card-body">
        <form data-api="/api/application-profile-plugins" data-redirect="${escapeHtml(redirect)}" data-config-form>
          <input type="hidden" name="applicationProfileId" value="${escapeHtml(data.applicationProfile.id)}">
          <input type="hidden" name="section" value="${escapeHtml(section)}">
          <input type="hidden" name="name" value="${escapeHtml(name)}">
          <input type="hidden" name="plugin" value="${escapeHtml(entry.plugin)}">
          <input type="hidden" name="packageName" value="${escapeHtml(entry.package ?? '')}">
          <input type="hidden" name="version" value="${escapeHtml(entry.version ?? '')}">
          <input type="hidden" name="config">
          <div class="form-grid">
            ${input('displayName', 'Config Name', false, name).replace('name="displayName"', 'name="displayName" disabled')}
            ${input('pluginDisplay', 'Plugin', false, pluginLabel).replace('name="pluginDisplay"', 'name="pluginDisplay" disabled')}
            <label>Enabled<select name="enabled">${entry.enabled ? '<option value="true" selected>Enabled</option><option value="false">Disabled</option>' : '<option value="true">Enabled</option><option value="false" selected>Disabled</option>'}</select></label>
            <label class="schema-toggle"><input type="checkbox" name="lockVersion" data-version-lock ${entry.version ? 'checked' : ''}>Lock Version ${escapeHtml(entry.version ?? catalog?.version ?? 'latest')}</label>
          </div>
          <div data-config-fields>${renderSchemaFields(catalog?.configSchema, entry.config ?? {})}</div>
          <button>Save</button><p class="status"></p>
        </form>
        <form data-api="/api/application-profile-plugins/delete" data-redirect="${escapeHtml(redirect)}" data-confirm="Remove this shared plugin from the application profile?">
          <input type="hidden" name="applicationProfileId" value="${escapeHtml(data.applicationProfile.id)}">
          <input type="hidden" name="section" value="${escapeHtml(section)}">
          <input type="hidden" name="name" value="${escapeHtml(name)}">
          <button class="secondary">Remove</button><p class="status"></p>
        </form>
        </div>
      </details>`;
    }).join('')}
  </section>`;
}

function inheritedOverrideEditor(
  data: DeploymentProfileData,
  inherited: RuntimeConfigDefinition,
  local: RuntimeConfigDefinition,
  redirect: string,
): string {
  return `
    ${inheritedOverrideSection(data, inherited, local, 'services', 'Services', redirect)}
    ${inheritedOverrideSection(data, inherited, local, 'events', 'Events', redirect)}
    ${inheritedOverrideSection(data, inherited, local, 'observable', 'Observable', redirect)}
  `;
}

function inheritedOverrideSection(
  data: DeploymentProfileData,
  inherited: RuntimeConfigDefinition,
  local: RuntimeConfigDefinition,
  section: 'services' | 'events' | 'observable',
  title: string,
  redirect: string,
): string {
  const entries = Object.entries(inherited[section] ?? {});
  if (entries.length === 0) return '';
  return `<section><h3>${escapeHtml(title)}</h3>${entries.map(([name, entry]) => {
    const localEntry = local[section]?.[name];
    const effective = localEntry ? mergePluginEntry(entry, localEntry) : entry;
    const catalog = findCatalogPlugin(data, entry.plugin, entry.version, entry.package);
    const pluginLabel = catalog ? pluginDisplayName(catalog) : entry.plugin;
    const enabledOverridden = localEntry?.enabled !== undefined;
    return `<details class="plugin-card">
      <summary><span>${escapeHtml(name)}</span><span class="chip">${escapeHtml(pluginLabel)} / ${localEntry ? 'overridden' : 'inherited'} ${effective.enabled ? 'enabled' : 'disabled'}</span></summary>
      <div class="plugin-card-body">
        <form data-api="/api/profile-plugins" data-redirect="${escapeHtml(redirect)}" data-config-form data-inherited-override-form>
          <input type="hidden" name="profileId" value="${escapeHtml(data.profile.id)}">
          <input type="hidden" name="section" value="${escapeHtml(section)}">
          <input type="hidden" name="name" value="${escapeHtml(name)}">
          <input type="hidden" name="plugin" value="${escapeHtml(entry.plugin)}">
          <input type="hidden" name="packageName" value="${escapeHtml(entry.package ?? '')}">
          <input type="hidden" name="version" value="${escapeHtml(entry.version ?? '')}">
          <input type="hidden" name="config">
          <input type="hidden" name="baseConfig" value="${escapeHtml(JSON.stringify(entry.config ?? {}))}">
          <input type="hidden" name="baseEnabled" value="${entry.enabled ? 'true' : 'false'}">
          <input type="hidden" name="overridePaths">
          <div class="form-grid">
            ${input('displayName', 'Config Name', false, name).replace('name="displayName"', 'name="displayName" disabled')}
            ${input('pluginDisplay', 'Plugin', false, pluginLabel).replace('name="pluginDisplay"', 'name="pluginDisplay" disabled')}
            <div class="schema-optional" data-enabled-override>
              <label class="schema-toggle"><input type="checkbox" data-enabled-override-toggle ${enabledOverridden ? 'checked' : ''}>Override enabled</label>
              <label>Enabled<select name="enabled">${effective.enabled ? '<option value="true" selected>Enabled</option><option value="false">Disabled</option>' : '<option value="true">Enabled</option><option value="false" selected>Disabled</option>'}</select></label>
            </div>
          </div>
          <div data-config-fields>${renderSchemaFields(catalog?.configSchema, effective.config ?? {}, { overrideMode: true, overrideConfig: localEntry?.config ?? {} })}</div>
          <button>${localEntry ? 'Save Override' : 'Create Override'}</button><p class="status"></p>
        </form>
        ${localEntry ? `<form data-api="/api/profile-plugins/delete" data-redirect="${escapeHtml(redirect)}" data-confirm="Remove the local override and inherit the shared config again?">
          <input type="hidden" name="profileId" value="${escapeHtml(data.profile.id)}">
          <input type="hidden" name="section" value="${escapeHtml(section)}">
          <input type="hidden" name="name" value="${escapeHtml(name)}">
          <button class="secondary">Remove Override</button><p class="status"></p>
        </form>` : ''}
      </div>
    </details>`;
  }).join('')}</section>`;
}

function mergePluginEntry(base: RuntimePluginDefinition, override: RuntimePluginDefinition): RuntimePluginDefinition {
  return {
    ...base,
    ...override,
    config: mergeConfigObjects(base.config ?? {}, override.config ?? {}),
  };
}

function mergeConfigObjects(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const output = cloneConfig(base);
  for (const [key, value] of Object.entries(override)) {
    const existing = output[key];
    output[key] = isRecord(existing) && isRecord(value) ? mergeConfigObjects(existing, value) : cloneConfig(value);
  }
  return output;
}

function cloneConfig<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function copyPluginForm(data: DeploymentProfileData, section: 'services' | 'events' | 'observable', name: string, redirect: string): string {
  const targets = data.allProfiles.filter((profile) => profile.id !== data.profile.id);
  if (targets.length === 0) return '';
  return `<form data-api="/api/profile-plugins/copy" data-redirect="${escapeHtml(redirect)}" data-confirm="Copy this config to the selected deployment profile? Existing config is only overwritten when selected.">
    <input type="hidden" name="sourceProfileId" value="${escapeHtml(data.profile.id)}">
    <input type="hidden" name="section" value="${escapeHtml(section)}">
    <input type="hidden" name="name" value="${escapeHtml(name)}">
    ${select('targetProfileId', 'Copy To', targets.map((profile) => [profile.id, profileLabel(profile, data)]))}
    <label class="schema-toggle"><input type="checkbox" name="overwrite">Overwrite existing config</label>
    <button class="secondary">Copy</button><p class="status"></p>
  </form>`;
}

function findCatalogPlugin(
  data: Pick<DeploymentProfileData, 'plugins'>,
  pluginId: string,
  version?: string,
  packageName?: string,
): DeploymentProfileData['plugins'][number] | undefined {
  const matches = data.plugins.filter((plugin) =>
    (plugin.pluginId === pluginId || `${plugin.org}/${plugin.pluginId}` === pluginId) &&
    plugin.kind !== 'config' &&
    (packageName ? plugin.packageName === packageName : true)
  );
  return version
    ? matches.find((plugin) => plugin.version === version)
    : latestCatalogPlugin(matches);
}

function latestCatalogPlugin(plugins: DeploymentProfileData['plugins']): DeploymentProfileData['plugins'][number] | undefined {
  return [...plugins].sort((left, right) => compareVersionStrings(right.version, left.version))[0];
}

function compareVersionStrings(left: string, right: string): number {
  const leftParts = left.split(/[.-]/).map(versionPart);
  const rightParts = right.split(/[.-]/).map(versionPart);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParts[index] ?? 0;
    const b = rightParts[index] ?? 0;
    if (typeof a === 'number' && typeof b === 'number' && a !== b) return a - b;
    const textA = String(a);
    const textB = String(b);
    if (textA !== textB) return textA.localeCompare(textB);
  }
  return 0;
}

function versionPart(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value;
}

function pluginDisplayName(plugin: { org?: string; pluginId: string; name?: string }): string {
  if (!plugin.org || plugin.org === '_') return plugin.pluginId;
  return plugin.pluginId.startsWith(`${plugin.org}/`) ? plugin.pluginId : `${plugin.org}/${plugin.pluginId}`;
}

function pluginKindLabel(kind: string): string {
  if (kind === 'service') return 'Service';
  if (kind === 'events') return 'Events';
  if (kind === 'observable') return 'Observable';
  return kind;
}

type RenderSchemaOptions = {
  overrideMode?: boolean;
  overrideConfig?: Record<string, unknown>;
};

function renderSchemaFields(schema: Record<string, unknown> | null | undefined, config: Record<string, unknown>, options: RenderSchemaOptions = {}): string {
  const root = objectField(objectField(schema)?.root);
  if (!root || root.kind !== 'object' || !objectField(root.properties)) {
    return '<p class="muted">No config schema available for this plugin.</p>';
  }
  return renderProperties(root.properties as Record<string, unknown>, config, '', requiredSet(root), false, options);
}

function renderProperties(
  properties: Record<string, unknown>,
  config: Record<string, unknown>,
  prefix: string,
  required: Set<string>,
  hideLiteralFields = false,
  options: RenderSchemaOptions = {},
): string {
  return Object.entries(properties).map(([key, schema]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = prefix ? objectField(config)?.[key] : valueAtPath(config, path);
    return renderSchemaControl(key, objectField(schema), path, value, required.has(key), hideLiteralFields, options);
  }).join('');
}

function renderSchemaControl(
  key: string,
  rawNode: Record<string, unknown> | null,
  path: string,
  rawValue: unknown,
  required: boolean,
  hideLiteralField = false,
  options: RenderSchemaOptions = {},
): string {
  const node = unwrapSchema(rawNode);
  if (!node) return '';
  const value = rawValue ?? node.default ?? '';
  const help = schemaHelp(rawNode, node, required);
  let control = '';
  if (node.kind === 'object' && objectField(node.properties)) {
    control = `<fieldset class="schema-box"><legend>${fieldLabel(key, rawNode, node, required)}</legend>${help}${renderProperties(node.properties as Record<string, unknown>, isRecord(value) ? value : {}, path, requiredSet(node), false, options)}</fieldset>`;
  } else if (node.kind === 'bool' || node.kind === 'boolean') {
    control = `<label>${fieldLabel(key, rawNode, node, required)}<select data-config-path="${escapeHtml(path)}" data-kind="bool" ${required ? 'required' : ''}><option value="true" ${value === true ? 'selected' : ''}>true</option><option value="false" ${value === false ? 'selected' : ''}>false</option></select>${help}</label>`;
  } else if (node.kind === 'enum' && Array.isArray(node.values)) {
    control = `<label>${fieldLabel(key, rawNode, node, required)}<select data-config-path="${escapeHtml(path)}" data-kind="string" ${required ? 'required' : ''}>${node.values.map((item) => `<option value="${escapeHtml(String(item))}" ${String(value) === String(item) ? 'selected' : ''}>${escapeHtml(String(item))}</option>`).join('')}</select>${help}</label>`;
  } else if (node.kind === 'literal') {
    control = hideLiteralField
      ? `<input type="hidden" data-config-path="${escapeHtml(path)}" data-kind="string" value="${escapeHtml(String(node.value ?? ''))}">`
      : `<label>${fieldLabel(key, rawNode, node, required)}<input data-config-path="${escapeHtml(path)}" data-kind="string" value="${escapeHtml(String(node.value ?? ''))}" readonly ${required ? 'required' : ''}>${help}</label>`;
  } else if (node.kind === 'array') {
    const itemNode = unwrapSchema(objectField(node.items) ?? objectField(node.item));
    const kind = inputKind(itemNode);
    const values = Array.isArray(value) ? value : [];
    const rows = (values.length ? values : ['']).map((item) => `<div class="repeat-row"><input data-array-item data-kind="${escapeHtml(kind)}" ${kind === 'number' ? 'type="number"' : ''} value="${escapeHtml(String(item ?? ''))}"><button type="button" class="secondary" data-remove-row>Remove</button></div>`).join('');
    control = `<div class="schema-repeat" data-array-path="${escapeHtml(path)}" data-item-kind="${escapeHtml(kind)}"><label>${fieldLabel(key, rawNode, node, required)}</label>${help}<div data-repeat-rows>${rows}</div><button type="button" class="secondary" data-add-array-item>Add Item</button></div>`;
  } else if (node.kind === 'record') {
    const valueNode = unwrapSchema(objectField(node.valueSchema) ?? objectField(node.values) ?? objectField(node.value));
    const kind = inputKind(valueNode);
    const entries = isRecord(value) ? Object.entries(value) : [];
    const rows = (entries.length ? entries : [['', '']]).map(([recordKey, recordValue]) => `<div class="repeat-row"><input data-record-key placeholder="Key" value="${escapeHtml(String(recordKey))}"><input data-record-value data-kind="${escapeHtml(kind)}" ${kind === 'number' ? 'type="number"' : ''} placeholder="Value" value="${escapeHtml(String(recordValue ?? ''))}"><button type="button" class="secondary" data-remove-row>Remove</button></div>`).join('');
    control = `<div class="schema-repeat" data-record-path="${escapeHtml(path)}" data-value-kind="${escapeHtml(kind)}"><label>${fieldLabel(key, rawNode, node, required)}</label>${help}<div data-repeat-rows>${rows}</div><button type="button" class="secondary" data-add-record-row>Add Entry</button></div>`;
  } else if (node.kind === 'tuple') {
    const items = (Array.isArray(node.items) ? node.items : Array.isArray(node.elements) ? node.elements : []).map((item) => objectField(item));
    const values = Array.isArray(value) ? value : [];
    control = `<fieldset class="schema-box" data-tuple-path="${escapeHtml(path)}"><legend>${fieldLabel(key, rawNode, node, required)}</legend>${help}${items.map((item, index) => {
      const child = unwrapSchema(item);
      const kind = inputKind(child);
      return `<label>Item ${index + 1}<input data-tuple-index="${index}" data-kind="${escapeHtml(kind)}" ${kind === 'number' ? 'type="number"' : ''} value="${escapeHtml(String(values[index] ?? child?.default ?? ''))}"></label>`;
    }).join('')}</fieldset>`;
  } else if (node.kind === 'union' && Array.isArray(node.variants)) {
    control = renderUnionControl(key, rawNode, node, path, value, required, help, options);
  } else {
    const kind = inputKind(node);
    control = `<label>${fieldLabel(key, rawNode, node, required)}<input data-config-path="${escapeHtml(path)}" data-kind="${escapeHtml(kind)}" ${inputAttrs(node, required, kind)} value="${escapeHtml(String(value ?? ''))}">${help}</label>`;
  }
  if (rawNode?.kind === 'optional') control = optionalShell(key, path, control, rawValue !== undefined);
  if (options.overrideMode && node.kind !== 'object' && !(node.kind === 'literal' && hideLiteralField)) {
    control = overrideShell(path, control, valueAtPath(options.overrideConfig ?? {}, path) !== undefined);
  }
  return control;
}

function renderUnionControl(
  key: string,
  rawNode: Record<string, unknown> | null,
  node: Record<string, unknown>,
  path: string,
  value: unknown,
  required: boolean,
  help: string,
  options: RenderSchemaOptions = {},
): string {
  const variants = (node.variants as unknown[])
    .map((variant) => unwrapSchema(objectField(variant)))
    .filter((variant): variant is Record<string, unknown> => variant !== null);
  if (variants.length === 0) return '';
  const selectedIndex = selectUnionVariant(variants, value);
  const optionHtml = variants.map((variant, index) => {
    const label = unionVariantLabel(variant, index);
    return `<option value="${index}" ${index === selectedIndex ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
  const panels = variants.map((variant, index) => {
    const variantValue = index === selectedIndex && isRecord(value) ? value : {};
    const childOptions = { ...options, overrideMode: false };
    const fields = variant.kind === 'object' && objectField(variant.properties)
      ? renderProperties(variant.properties as Record<string, unknown>, variantValue, path, requiredSet(variant), true, childOptions)
      : renderSchemaControl(key, variant, path, variantValue, required, false, childOptions);
    return `<div class="schema-union-panel" data-union-variant="${index}" ${index === selectedIndex ? '' : 'hidden'}>${fields}</div>`;
  }).join('');
  return `<div class="schema-union" data-union-path="${escapeHtml(path)}">
    <label>${fieldLabel(key, rawNode, node, required)}<select data-union-picker ${required ? 'required' : ''}>${optionHtml}</select>${help}</label>
    ${panels}
  </div>`;
}

function selectUnionVariant(variants: Record<string, unknown>[], value: unknown): number {
  if (!isRecord(value)) return 0;
  const matched = variants.findIndex((variant) => {
    if (variant.kind !== 'object' || !objectField(variant.properties)) return false;
    return Object.values(variant.properties as Record<string, unknown>).some((raw) => {
      const property = unwrapSchema(objectField(raw));
      return property?.kind === 'literal' && Object.values(value).includes(property.value);
    });
  });
  return matched >= 0 ? matched : 0;
}

function unionVariantLabel(variant: Record<string, unknown>, index: number): string {
  if (variant.kind === 'object' && objectField(variant.properties)) {
    for (const [name, raw] of Object.entries(variant.properties as Record<string, unknown>)) {
      const property = unwrapSchema(objectField(raw));
      if (property?.kind === 'literal') return `${name}: ${String(property.value)}`;
    }
  }
  return `Option ${index + 1}`;
}

function inputAttrs(node: Record<string, unknown>, required: boolean, kind: 'number' | 'bool' | 'string'): string {
  const attrs = [];
  if (kind === 'number') attrs.push('type="number"');
  if (required) attrs.push('required');
  if (typeof node.minLength === 'number') attrs.push(`minlength="${node.minLength}"`);
  if (typeof node.maxLength === 'number') attrs.push(`maxlength="${node.maxLength}"`);
  if (typeof node.min === 'number') attrs.push(`min="${node.min}"`);
  if (typeof node.max === 'number') attrs.push(`max="${node.max}"`);
  return attrs.join(' ');
}

function fieldLabel(key: string, rawNode: Record<string, unknown> | null, node: Record<string, unknown>, required: boolean): string {
  const meta = fieldMeta(rawNode, node, required);
  return `${escapeHtml(key)}${meta ? ` <span class="schema-meta">${escapeHtml(meta)}</span>` : ''}`;
}

function schemaHelp(rawNode: Record<string, unknown> | null, node: Record<string, unknown>, required: boolean): string {
  const description = node.metadata && typeof node.metadata === 'object' && 'description' in node.metadata
    ? String((node.metadata as Record<string, unknown>).description)
    : '';
  const notes = [
    description,
    rawNode?.kind === 'optional' ? 'Enable this field to send it; disable it to omit it.' : required ? 'Required.' : '',
    'default' in node ? `Default: ${formatDefault(node.default)}.` : '',
  ].filter(Boolean).join(' ');
  return notes ? `<span class="schema-help">${escapeHtml(notes)}</span>` : '';
}

function fieldMeta(rawNode: Record<string, unknown> | null, node: Record<string, unknown>, required: boolean): string {
  if (rawNode?.kind === 'optional') return 'optional';
  if ('default' in node) return `default: ${formatDefault(node.default)}`;
  return required ? 'required' : 'optional';
}

function optionalShell(key: string, path: string, control: string, enabled: boolean): string {
  return `<div class="schema-optional" data-optional-field="${escapeHtml(path)}">
    <label class="schema-toggle"><input type="checkbox" data-optional-toggle ${enabled ? 'checked' : ''}>Enable ${escapeHtml(key)}</label>
    <div data-optional-content>${control}</div>
  </div>`;
}

function overrideShell(path: string, control: string, enabled: boolean): string {
  return `<div class="schema-override" data-override-field="${escapeHtml(path)}">
    <label class="schema-toggle"><input type="checkbox" data-override-toggle data-override-path="${escapeHtml(path)}" ${enabled ? 'checked' : ''}>Override this value</label>
    <div data-override-content>${control}</div>
  </div>`;
}

function requiredSet(node: Record<string, unknown>): Set<string> {
  if (Array.isArray(node.required)) return new Set(node.required.map(String));
  const properties = objectField(node.properties) ?? {};
  return new Set(Object.entries(properties)
    .filter(([, value]) => objectField(value)?.kind !== 'optional')
    .map(([key]) => key));
}

function formatDefault(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function inputKind(node: Record<string, unknown> | null): 'number' | 'bool' | 'string' {
  if (!node) return 'string';
  if (node.kind === 'bool' || node.kind === 'boolean') return 'bool';
  return ['int', 'int32', 'int64', 'number', 'float', 'float32', 'float64'].includes(String(node.kind)) ? 'number' : 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapSchema(node: Record<string, unknown> | null): Record<string, unknown> | null {
  let current = node;
  while (current && (current.kind === 'optional' || current.kind === 'nullable')) {
    current = objectField(current.inner);
  }
  return current;
}

function valueAtPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => objectField(acc)?.[part], source);
}

function profileRuntimeKeyTable(keys: DeploymentProfileData['runtimeKeys'], data: DeploymentProfileData): string {
  if (keys.length === 0) return '<p class="muted">No container keys created for this profile.</p>';
  return `<table>${keys.map((key) => `<tr>
    <td>${escapeHtml(key.name)}</td>
    <td>${escapeHtml(key.id)}</td>
    <td>${escapeHtml(data.profile.name)}</td>
    <td>${escapeHtml(key.containerName ?? '')}</td>
    <td>${escapeHtml(key.revokedAt ?? 'active')}</td>
    <td>${key.revokedAt ? '' : `<form data-api="/api/runtime-keys/rotate" data-secret-redirect="/deployment?profileId=${escapeHtml(data.profile.id)}"><input type="hidden" name="keyId" value="${escapeHtml(key.id)}"><button class="secondary">Rotate</button><p class="status"></p></form>`}</td>
  </tr>`).join('')}</table>`;
}

function runtimeEnvBlock(credential: { publicUrl: string; keyId: string; secret: string }): string {
  const env = [
    'BSB_CONFIG_PLUGIN=config-vault',
    'BSB_CONFIG_PLUGIN_PACKAGE=@bsb/config-vault',
    `vaultUrl=${credential.publicUrl}`,
    `apiKeyId=${credential.keyId}`,
    `apiSecret=${credential.secret}`,
  ].join('\n');
  return `<section><h2>Container Environment</h2>
    <p class="muted">Shown once. Add these env vars to the BSB container that should load this deployment profile.</p>
    <pre class="code"><code>${escapeHtml(env)}</code></pre>
  </section>`;
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
          const joiner = form.dataset.secretRedirect.includes('?') ? '&' : '?';
          location.href = form.dataset.secretRedirect
            + joiner + 'keyId=' + encodeURIComponent(result.keyId || result.id || '')
            + '&secret=' + encodeURIComponent(result.secret);
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

function pluginEditorScript(plugins: DeploymentProfileData['plugins']): string {
  const catalog = plugins.reduce((acc, plugin) => {
    acc[plugin.id] = {
      plugin: plugin.pluginId,
      packageName: plugin.packageName ?? '',
      version: plugin.version,
      kind: plugin.kind,
      kindLabel: pluginKindLabel(plugin.kind),
      schema: plugin.configSchema ?? null,
    };
    return acc;
  }, {} as Record<string, unknown>);
  return `<script>
  const vaultPluginCatalog = ${jsonForScript(catalog)};
  function setPath(target, path, value) {
    const parts = path.split('.');
    let current = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      current[parts[i]] = current[parts[i]] || {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  function readConfigForm(form) {
    const config = {};
    form.querySelectorAll('[data-array-path]').forEach((group) => {
      if (!fieldEnabled(group)) return;
      const values = Array.from(group.querySelectorAll('[data-array-item]'))
        .map((field) => parseFieldValue(field))
        .filter((value) => value !== undefined);
      if (values.length > 0) setPath(config, group.dataset.arrayPath, values);
    });
    form.querySelectorAll('[data-record-path]').forEach((group) => {
      if (!fieldEnabled(group)) return;
      const record = {};
      group.querySelectorAll('.repeat-row').forEach((row) => {
        const key = row.querySelector('[data-record-key]')?.value?.trim();
        const valueField = row.querySelector('[data-record-value]');
        const value = valueField ? parseFieldValue(valueField) : undefined;
        if (key && value !== undefined) record[key] = value;
      });
      if (Object.keys(record).length > 0) setPath(config, group.dataset.recordPath, record);
    });
    form.querySelectorAll('[data-tuple-path]').forEach((group) => {
      if (!fieldEnabled(group)) return;
      const values = [];
      group.querySelectorAll('[data-tuple-index]').forEach((field) => {
        const value = parseFieldValue(field);
        if (value !== undefined) values[Number(field.dataset.tupleIndex)] = value;
      });
      if (values.length > 0) setPath(config, group.dataset.tuplePath, values);
    });
    form.querySelectorAll('[data-config-path]').forEach((field) => {
      if (!fieldEnabled(field)) return;
      if (field.closest('[data-array-path],[data-record-path],[data-tuple-path]')) return;
      const value = parseFieldValue(field);
      if (value !== undefined) setPath(config, field.dataset.configPath, value);
    });
    return config;
  }
  function optionalEnabled(element) {
    const group = element.closest('[data-optional-field]');
    if (!group) return true;
    return Boolean(group.querySelector('[data-optional-toggle]')?.checked);
  }
  function fieldEnabled(element) {
    if (element.closest('[data-union-variant][hidden]')) return false;
    if (element.disabled) return false;
    const overrideGroup = element.closest('[data-override-field]');
    if (overrideGroup && element.closest('form[data-inherited-override-form]')) {
      return Boolean(overrideGroup.querySelector('[data-override-toggle]')?.checked);
    }
    return optionalEnabled(element);
  }
  function parseFieldValue(field) {
    if (field.disabled) return undefined;
    const raw = field.value;
    if (raw === '') return undefined;
    if (field.dataset.kind === 'number') return Number(raw);
    if (field.dataset.kind === 'bool') return raw === 'true';
    return raw;
  }
  function schemaRoot(schema) {
    return schema && schema.root && schema.root.kind === 'object' ? schema.root : null;
  }
  function escapeClient(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function unwrapNode(node) {
    while (node && (node.kind === 'optional' || node.kind === 'nullable')) node = node.inner;
    return node;
  }
  function inputKind(node) {
    node = unwrapNode(node);
    if (!node) return 'string';
    if (node.kind === 'bool' || node.kind === 'boolean') return 'bool';
    return ['int','int32','int64','number','float','float32','float64'].includes(String(node.kind)) ? 'number' : 'string';
  }
  function formatDefaultClient(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  function fieldMetaClient(rawNode, node, required) {
    if (rawNode && rawNode.kind === 'optional') return 'optional';
    if (Object.prototype.hasOwnProperty.call(node, 'default')) return 'default: ' + formatDefaultClient(node.default);
    return required ? 'required' : 'optional';
  }
  function fieldLabelClient(key, rawNode, node, required) {
    const meta = fieldMetaClient(rawNode, node, required);
    return escapeClient(key) + (meta ? ' <span class="schema-meta">' + escapeClient(meta) + '</span>' : '');
  }
  function schemaHelpClient(rawNode, node, required) {
    const description = node && node.metadata && node.metadata.description ? String(node.metadata.description) : '';
    const notes = [
      description,
      rawNode && rawNode.kind === 'optional' ? 'Enable this field to send it; disable it to omit it.' : required ? 'Required.' : '',
      node && Object.prototype.hasOwnProperty.call(node, 'default') ? 'Default: ' + formatDefaultClient(node.default) + '.' : '',
    ].filter(Boolean).join(' ');
    return notes ? '<span class="schema-help">' + escapeClient(notes) + '</span>' : '';
  }
  function optionalShellClient(key, path, control) {
    return '<div class="schema-optional" data-optional-field="' + escapeClient(path) + '">'
      + '<label class="schema-toggle"><input type="checkbox" data-optional-toggle>Enable ' + escapeClient(key) + '</label>'
      + '<div data-optional-content>' + control + '</div></div>';
  }
  function requiredKeysClient(node, properties) {
    if (node && Array.isArray(node.required)) return node.required;
    return Object.entries(properties || {})
      .filter(([, value]) => !(value && value.kind === 'optional'))
      .map(([key]) => key);
  }
  function primitiveInput(attrs, kind, value) {
    return '<input ' + attrs + ' data-kind="' + kind + '"' + (kind === 'number' ? ' type="number"' : '') + ' value="' + escapeClient(value || '') + '">';
  }
  function inputAttrsClient(node, required, kind) {
    const attrs = [];
    if (required) attrs.push('required');
    if (typeof node.minLength === 'number') attrs.push('minlength="' + node.minLength + '"');
    if (typeof node.maxLength === 'number') attrs.push('maxlength="' + node.maxLength + '"');
    if (typeof node.min === 'number') attrs.push('min="' + node.min + '"');
    if (typeof node.max === 'number') attrs.push('max="' + node.max + '"');
    return attrs.join(' ');
  }
  function repeatRow(kind, key, value) {
    return '<div class="repeat-row">'
      + (key === null ? '' : '<input data-record-key placeholder="Key" value="' + escapeClient(key || '') + '">')
      + primitiveInput(key === null ? 'data-array-item' : 'data-record-value', kind, value)
      + '<button type="button" class="secondary" data-remove-row>Remove</button></div>';
  }
  function renderFields(properties, prefix, requiredKeys, hideLiteralFields) {
    const requiredSet = new Set(requiredKeys || []);
    return Object.entries(properties || {}).map(([key, rawNode]) => {
      let node = unwrapNode(rawNode);
      if (!node) return '';
      const path = prefix ? prefix + '.' + key : key;
      const required = requiredSet.has(key) && !(rawNode && rawNode.kind === 'optional') && !Object.prototype.hasOwnProperty.call(node, 'default');
      const help = schemaHelpClient(rawNode, node, required);
      let control = '';
      if (node.kind === 'object' && node.properties) {
        control = '<fieldset class="schema-box"><legend>' + fieldLabelClient(key, rawNode, node, required) + '</legend>' + help + renderFields(node.properties, path, requiredKeysClient(node, node.properties), hideLiteralFields) + '</fieldset>';
      } else if (node.kind === 'bool' || node.kind === 'boolean') {
        control = '<label>' + fieldLabelClient(key, rawNode, node, required) + '<select data-config-path="' + escapeClient(path) + '" data-kind="bool"' + (required ? ' required' : '') + '><option value="true"' + (node.default === true ? ' selected' : '') + '>true</option><option value="false"' + (node.default === false ? ' selected' : '') + '>false</option></select>' + help + '</label>';
      } else if (node.kind === 'enum' && Array.isArray(node.values)) {
        control = '<label>' + fieldLabelClient(key, rawNode, node, required) + '<select data-config-path="' + escapeClient(path) + '" data-kind="string"' + (required ? ' required' : '') + '>' + node.values.map((item) => '<option value="' + escapeClient(item) + '"' + (String(node.default) === String(item) ? ' selected' : '') + '>' + escapeClient(item) + '</option>').join('') + '</select>' + help + '</label>';
      } else if (node.kind === 'literal') {
        control = hideLiteralFields
          ? '<input type="hidden" data-config-path="' + escapeClient(path) + '" data-kind="string" value="' + escapeClient(node.value || '') + '">'
          : '<label>' + fieldLabelClient(key, rawNode, node, required) + '<input data-config-path="' + escapeClient(path) + '" data-kind="string" value="' + escapeClient(node.value || '') + '" readonly' + (required ? ' required' : '') + '>' + help + '</label>';
      } else if (node.kind === 'array') {
        const kind = inputKind(node.items || node.item);
        control = '<div class="schema-repeat" data-array-path="' + escapeClient(path) + '" data-item-kind="' + kind + '"><label>' + fieldLabelClient(key, rawNode, node, required) + '</label>' + help + '<div data-repeat-rows>' + repeatRow(kind, null, '') + '</div><button type="button" class="secondary" data-add-array-item>Add Item</button></div>';
      } else if (node.kind === 'record') {
        const kind = inputKind(node.valueSchema || node.values || node.value);
        control = '<div class="schema-repeat" data-record-path="' + escapeClient(path) + '" data-value-kind="' + kind + '"><label>' + fieldLabelClient(key, rawNode, node, required) + '</label>' + help + '<div data-repeat-rows>' + repeatRow(kind, '', '') + '</div><button type="button" class="secondary" data-add-record-row>Add Entry</button></div>';
      } else if (node.kind === 'tuple') {
        const items = Array.isArray(node.items) ? node.items : Array.isArray(node.elements) ? node.elements : [];
        control = '<fieldset class="schema-box" data-tuple-path="' + escapeClient(path) + '"><legend>' + fieldLabelClient(key, rawNode, node, required) + '</legend>' + help + items.map((item, index) => '<label>Item ' + (index + 1) + primitiveInput('data-tuple-index="' + index + '"', inputKind(item), '') + '</label>').join('') + '</fieldset>';
      } else if (node.kind === 'union' && Array.isArray(node.variants) && node.variants[0]) {
        control = renderUnionClient(key, rawNode, node, path, required, help);
      } else {
        const kind = inputKind(node);
        control = '<label>' + fieldLabelClient(key, rawNode, node, required) + primitiveInput('data-config-path="' + escapeClient(path) + '" ' + inputAttrsClient(node, required, kind), kind, node.default || '') + help + '</label>';
      }
      return rawNode && rawNode.kind === 'optional' ? optionalShellClient(key, path, control) : control;
    }).join('');
  }
  function unionVariantLabelClient(variant, index) {
    variant = unwrapNode(variant);
    if (variant && variant.kind === 'object' && variant.properties) {
      for (const [name, raw] of Object.entries(variant.properties)) {
        const property = unwrapNode(raw);
        if (property && property.kind === 'literal') return name + ': ' + property.value;
      }
    }
    return 'Option ' + (index + 1);
  }
  function renderUnionClient(key, rawNode, node, path, required, help) {
    const variants = (node.variants || []).map(unwrapNode).filter(Boolean);
    const options = variants.map((variant, index) => '<option value="' + index + '">' + escapeClient(unionVariantLabelClient(variant, index)) + '</option>').join('');
    const panels = variants.map((variant, index) => {
      const fields = variant.kind === 'object' && variant.properties
        ? renderFields(variant.properties, path, requiredKeysClient(variant, variant.properties), true)
        : renderFields({ [key]: variant }, '', [key]);
      return '<div class="schema-union-panel" data-union-variant="' + index + '"' + (index === 0 ? '' : ' hidden') + '>' + fields + '</div>';
    }).join('');
    return '<div class="schema-union" data-union-path="' + escapeClient(path) + '"><label>'
      + fieldLabelClient(key, rawNode, node, required)
      + '<select data-union-picker' + (required ? ' required' : '') + '>' + options + '</select>'
      + help + '</label>' + panels + '</div>';
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-array-item],[data-add-record-row],[data-remove-row]');
    if (!button) return;
    if (button.matches('[data-remove-row]')) {
      button.closest('.repeat-row')?.remove();
      return;
    }
    const group = button.closest('.schema-repeat');
    const rows = group?.querySelector('[data-repeat-rows]');
    if (!group || !rows) return;
    if (button.matches('[data-add-array-item]')) rows.insertAdjacentHTML('beforeend', repeatRow(group.dataset.itemKind || 'string', null, ''));
    if (button.matches('[data-add-record-row]')) rows.insertAdjacentHTML('beforeend', repeatRow(group.dataset.valueKind || 'string', '', ''));
  });
  document.querySelectorAll('[data-plugin-picker]').forEach((select) => {
    const form = select.closest('form');
    const sync = () => {
      const item = vaultPluginCatalog[select.value];
      if (!item || !form) return;
      form.elements.plugin.value = item.plugin || '';
      form.elements.packageName.value = item.packageName || '';
      form.elements.version.value = form.querySelector('[data-version-lock]')?.checked ? item.version || '' : '';
      if (form.elements.section && item.kind) form.elements.section.value = item.kind === 'service' ? 'services' : item.kind;
      if (form.elements.typeDisplay && item.kindLabel) form.elements.typeDisplay.value = item.kindLabel;
      if (form.elements.name) form.elements.name.value = item.plugin || '';
      const root = schemaRoot(item.schema);
      const fields = form.querySelector('[data-config-fields]');
      if (fields) {
        fields.innerHTML = root ? renderFields(root.properties, '', requiredKeysClient(root, root.properties)) : '<p class="muted">No config schema available for this plugin.</p>';
        fields.querySelectorAll('[data-optional-field]').forEach(syncOptionalGroup);
        fields.querySelectorAll('[data-union-path]').forEach(syncUnionGroup);
      }
    };
    select.addEventListener('change', sync);
    form?.querySelector('[data-version-lock]')?.addEventListener('change', sync);
    sync();
  });
  function syncOptionalGroup(group) {
    const enabled = Boolean(group.querySelector('[data-optional-toggle]')?.checked);
    group.querySelectorAll('[data-optional-content] input,[data-optional-content] select,[data-optional-content] textarea,[data-optional-content] button').forEach((field) => {
      field.disabled = !enabled;
    });
  }
  function syncOverrideGroup(group) {
    const enabled = Boolean(group.querySelector('[data-override-toggle]')?.checked);
    group.querySelectorAll('[data-override-content] input,[data-override-content] select,[data-override-content] textarea,[data-override-content] button').forEach((field) => {
      field.disabled = !enabled;
    });
    group.querySelectorAll('[data-optional-field]').forEach(syncOptionalGroup);
    group.querySelectorAll('[data-union-path]').forEach(syncUnionGroup);
  }
  function syncEnabledOverrideGroup(group) {
    const enabled = Boolean(group.querySelector('[data-enabled-override-toggle]')?.checked);
    group.querySelectorAll('select[name="enabled"]').forEach((field) => {
      field.disabled = !enabled;
    });
  }
  document.addEventListener('change', (event) => {
    const toggle = event.target.closest('[data-optional-toggle]');
    if (toggle) syncOptionalGroup(toggle.closest('[data-optional-field]'));
    const overrideToggle = event.target.closest('[data-override-toggle]');
    if (overrideToggle) syncOverrideGroup(overrideToggle.closest('[data-override-field]'));
    const enabledOverrideToggle = event.target.closest('[data-enabled-override-toggle]');
    if (enabledOverrideToggle) syncEnabledOverrideGroup(enabledOverrideToggle.closest('[data-enabled-override]'));
    const unionPicker = event.target.closest('[data-union-picker]');
    if (unionPicker) {
      const unionGroup = unionPicker.closest('[data-union-path]');
      syncUnionGroup(unionGroup);
      const overrideGroup = unionGroup?.closest('[data-override-field]');
      if (overrideGroup) syncOverrideGroup(overrideGroup);
    }
  });
  function syncUnionGroup(group) {
    if (!group) return;
    const selected = group.querySelector('[data-union-picker]')?.value || '0';
    group.querySelectorAll('[data-union-variant]').forEach((panel) => {
      const active = panel.dataset.unionVariant === selected;
      panel.hidden = !active;
      panel.querySelectorAll('input,select,textarea,button').forEach((field) => {
        field.disabled = !active;
      });
    });
  }
  document.querySelectorAll('[data-union-path]').forEach(syncUnionGroup);
  document.querySelectorAll('[data-optional-field]').forEach(syncOptionalGroup);
  document.querySelectorAll('[data-override-field]').forEach(syncOverrideGroup);
  document.querySelectorAll('[data-enabled-override]').forEach(syncEnabledOverrideGroup);
  document.querySelectorAll('form[data-config-form]').forEach((form) => {
    form.addEventListener('submit', () => {
      const lock = form.querySelector('[data-version-lock]');
      if (lock && !lock.checked && form.elements.version) form.elements.version.value = '';
      if (form.elements.config) form.elements.config.value = JSON.stringify(readConfigForm(form));
      if (form.elements.overridePaths) {
        form.elements.overridePaths.value = JSON.stringify(Array.from(form.querySelectorAll('[data-override-toggle]:checked')).map((toggle) => toggle.dataset.overridePath).filter(Boolean));
      }
    }, { capture: true });
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

function table(rows: string[][]): string {
  if (rows.length === 0) return '<p class="muted">None</p>';
  return `<table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</table>`;
}

async function registrySearch(registryUrl: string, query: string): Promise<RegistryCandidate[]> {
  const url = new URL('/plugins', registryUrl);
  url.searchParams.set('language', 'nodejs');
  url.searchParams.set('limit', '20');
  if (query.trim()) url.searchParams.set('query', query.trim());
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return [];
    const parsed = await response.json() as { plugins?: unknown[] };
    return (Array.isArray(parsed.plugins) ? parsed.plugins : [])
      .map(normalizeRegistryCandidate)
      .filter((item): item is RegistryCandidate => item !== null);
  } catch {
    return [];
  }
}

function normalizeRegistryCandidate(input: unknown): RegistryCandidate | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const rawPluginId = stringField(value.pluginId) ?? stringField(value.id) ?? stringField(value.name);
  const split = splitPluginId(rawPluginId);
  const org = stringField(value.org) ?? split.org ?? orgFromPackage(value.packageName ?? value.package) ?? '_';
  const pluginId = split.pluginId ?? rawPluginId;
  const name = stringField(value.name) ?? pluginId;
  if (!name || !pluginId) return null;
  const packageName = stringField(value.packageName) ?? packageNameFromRegistry(value.package, 'nodejs') ?? null;
  return {
    org,
    name,
    pluginId,
    packageName,
    version: stringField(value.version) ?? '0.0.0',
    kind: parseKind(value.kind ?? value.category ?? value.type),
    configSchema: objectField(value.configSchema) ?? objectField(value.schema) ?? objectField(value.validationSchema) ?? null,
    eventSchema: objectField(value.eventSchema) ?? objectField(value.events) ?? null,
  };
}

function splitPluginId(value: string | undefined): { org: string | null; pluginId: string | null } {
  if (!value) return { org: null, pluginId: null };
  const slashIndex = value.indexOf('/');
  if (slashIndex <= 0) return { org: null, pluginId: value };
  return { org: value.slice(0, slashIndex), pluginId: value.slice(slashIndex + 1) };
}

function packageNameFromRegistry(value: unknown, language: string): string | undefined {
  const direct = stringField(value);
  if (direct) return direct;
  const packages = objectField(value);
  return packages ? stringField(packages[language]) : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function objectField(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function orgFromPackage(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('@')) return undefined;
  const [org] = value.split('/');
  return org || undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('Expected JSON object');
  return parsed as Record<string, unknown>;
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
  return parsed.filter((item): item is string => typeof item === 'string');
}

function parseKind(value: unknown): 'service' | 'events' | 'observable' | 'config' {
  return value === 'events' || value === 'observable' || value === 'config' ? value : 'service';
}

function parseConfigSection(value: unknown): 'services' | 'events' | 'observable' {
  return value === 'events' || value === 'observable' ? value : 'services';
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true' || value === 'on';
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

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}
