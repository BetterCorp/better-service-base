import type { Observable } from '@bsb/base';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { decryptJson, encryptJson, hashSecret, newId, newToken, createTotpSecret, createTotpUri, verifySecret, verifyTotp, matchingTotpStep } from './crypto.js';
import { VaultStore } from './store.js';
import type {
  ApplicationRecord,
  AuthMethodRecord,
  ApplicationProfileRecord,
  FirstAdminInput,
  FirstAdminResult,
  LoginStartResult,
  GroupRecord,
  PluginCatalogRecord,
  PluginPublisherRecord,
  ProfileRecord,
  ResolvedRuntimeConfig,
  RuntimeKeyRecord,
  RuntimeConfigDefinition,
  RuntimePluginDefinition,
  VaultRuntimeConfig,
} from './types.js';

export interface VaultServiceOptions {
  store: VaultStore;
  masterKey: Buffer;
  setupCode: string;
  publicUrl: string;
}

type ConfigState = {
  state: 'empty' | 'draft-only' | 'published' | 'draft-pending';
  draftUpdatedAt: string | null;
  publishedAt: string | null;
};

type PluginUsageLocation = {
  label: string;
  href: string;
};

type PluginUsage = Record<string, { count: number; locations: PluginUsageLocation[] }>;

type PrivatePluginUploadInput = {
  org: string;
  packageName: string;
  schemaFileName: string;
  schema: Record<string, unknown>;
};

type PrivatePluginPublishInput = {
  org: string;
  pluginId: string;
  packageName: string;
  version: string;
  kind: PluginPublisherRecord['kind'];
  configSchema: Record<string, unknown> | null;
  eventSchema: Record<string, unknown>;
};

export class VaultService {
  private readonly store: VaultStore;
  private readonly masterKey: Buffer;
  private readonly setupCode: string;
  private readonly origin: string;
  private readonly rpId: string;
  private readonly pendingPasskeySetups = new Map<string, { userId: string; expiresAt: number }>();
  private readonly registrationChallenges = new Map<string, { userId: string; methodId: string; challenge: string; expiresAt: number }>();
  private readonly authenticationChallenges = new Map<string, { userId: string; challenge: string; expiresAt: number }>();
  private readonly pendingTotpLogins = new Map<string, { userId: string; methodId: string; expiresAt: number }>();
  private readonly verifiedEnrollments = new Map<string, number>();
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(options: VaultServiceOptions) {
    this.store = options.store;
    this.masterKey = options.masterKey;
    this.setupCode = options.setupCode;
    const publicUrl = new URL(options.publicUrl);
    this.origin = publicUrl.origin;
    this.rpId = publicUrl.hostname;
  }

  async setupRequired(): Promise<boolean> {
    return (await this.store.countAdmins()) === 0;
  }

  async migrateLegacyAuthentication(): Promise<void> {
    for (const user of await this.store.listUsers()) {
      if ((await this.store.listAuthMethods(user.id)).length > 0 || !user.totpSecret) continue;
      const passkeys = await this.store.listPasskeys(user.id);
      const encrypted = encryptJson(user.totpSecret, this.masterKey);
      if (passkeys.length === 0) {
        await this.store.createAuthMethod({
          id: newId(), userId: user.id, label: 'Migrated authenticator',
          encryptedTotp: encrypted.encryptedPayload, iv: encrypted.iv, authTag: encrypted.authTag, keyVersion: encrypted.keyVersion,
          credentialId: null, publicKey: null, signCount: 0, lastTotpStep: null, active: false, createdAt: new Date().toISOString(),
        });
      } else {
        for (const [index, passkey] of passkeys.entries()) {
          await this.store.createAuthMethod({
            id: passkey.id, userId: user.id, label: `Migrated passkey ${index + 1}`,
            encryptedTotp: encrypted.encryptedPayload, iv: encrypted.iv, authTag: encrypted.authTag, keyVersion: encrypted.keyVersion,
            credentialId: passkey.credentialId, publicKey: passkey.publicKey, signCount: passkey.signCount,
            lastTotpStep: null, active: true, createdAt: passkey.createdAt,
          });
        }
      }
      await this.store.clearLegacyTotp(user.id);
      await this.audit('system', 'authentication.legacy.migrated', user.id, { pairedMethods: Math.max(passkeys.length, 1) });
    }
  }

  async createFirstAdmin(input: FirstAdminInput): Promise<FirstAdminResult> {
    if (!(await this.setupRequired())) {
      throw new Error('Admin already exists');
    }
    if (input.setupCode !== this.setupCode) {
      throw new Error('Invalid setup code');
    }
    if (input.password.length < 12) {
      throw new Error('Password must be at least 12 characters');
    }
    if (input.password !== input.passwordConfirm) {
      throw new Error('Passwords do not match');
    }
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid email is required');

    const now = new Date().toISOString();
    const totpSecret = createTotpSecret();

    const userId = newId();
    await this.store.createUser({
      id: userId,
      email,
      passwordHash: await hashSecret(input.password),
      totpSecret,
      passkeyRequired: false,
      status: 'active',
      setupTokenHash: null,
      setupExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const encrypted = encryptJson(totpSecret, this.masterKey);
    await this.store.createAuthMethod({
      id: newId(), userId, label: 'Primary authenticator',
      encryptedTotp: encrypted.encryptedPayload, iv: encrypted.iv, authTag: encrypted.authTag, keyVersion: encrypted.keyVersion,
      credentialId: null, publicKey: null, signCount: 0, lastTotpStep: null, active: false, createdAt: now,
    });
    await this.store.clearLegacyTotp(userId);

    await this.audit('setup', 'admin.created', userId, { email });
    return {
      email,
      totpSecret,
      totpUri: createTotpUri(totpSecret, email),
    };
  }

  async login(email: string, password: string, totpCode: string): Promise<LoginStartResult> {
    this.checkRateLimit(`login:${email.toLowerCase()}`);
    const user = await this.store.getUserByEmail(email.trim().toLowerCase());
    if (!user || user.status !== 'active' || !user.passwordHash || !(await verifySecret(password, user.passwordHash))) {
      this.recordFailure(`login:${email.toLowerCase()}`);
      await this.audit('anonymous', 'admin.login.failed', email, {});
      throw new Error('Invalid login');
    }

    const methods = await this.store.listAuthMethods(user.id);
    const activeMethods = methods.filter((method) => method.active && method.credentialId);
    if (activeMethods.length === 0) {
      const pending = methods.find((method) => !method.active);
      if (pending && !totpCode) return { status: 'totp_setup_verification_required' };
      if (!pending || !this.verifyMethodTotp(pending, totpCode)) {
        this.recordFailure(`login:${email.toLowerCase()}`);
        await this.audit('anonymous', 'admin.login.failed', email, {});
        throw new Error('Invalid login');
      }
      this.verifiedEnrollments.set(pending.id, Date.now() + 10 * 60 * 1000);
      const setupToken = newToken();
      this.pendingPasskeySetups.set(setupToken, { userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 });
      await this.audit(user.id, 'admin.passkey.setup.required', user.id, {});
      return { status: 'passkey_setup_required', setupToken };
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: activeMethods.map((method) => ({ id: method.credentialId! })),
      userVerification: 'required',
    });
    const challengeId = newToken();
    this.authenticationChallenges.set(challengeId, {
      userId: user.id,
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return { status: 'passkey_required', challengeId, options: options as unknown as Record<string, unknown> };
  }

  async finishLogin(challengeId: string, credential: Record<string, unknown>): Promise<{ totpToken: string; methodLabel: string }> {
    const challenge = this.authenticationChallenges.get(challengeId);
    this.authenticationChallenges.delete(challengeId);
    if (!challenge || challenge.expiresAt < Date.now()) throw new Error('Passkey challenge expired');

    const responseId = typeof credential.id === 'string' ? credential.id : '';
    const method = await this.store.getAuthMethodByCredential(responseId);
    if (!method || method.userId !== challenge.userId) {
      await this.audit(challenge.userId, 'admin.passkey.failed', challenge.userId, {});
      throw new Error('Invalid passkey');
    }

    const verification = await verifyAuthenticationResponse({
      response: credential as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: toWebAuthnCredential(method),
      requireUserVerification: true,
    });
    if (!verification.verified) {
      await this.audit(challenge.userId, 'admin.passkey.failed', challenge.userId, {});
      throw new Error('Invalid passkey');
    }
    await this.store.updateAuthMethodCounter(method.id, verification.authenticationInfo.newCounter);
    await this.audit(challenge.userId, 'admin.passkey.verified', method.id, {});
    const totpToken = newToken();
    this.pendingTotpLogins.set(totpToken, { userId: challenge.userId, methodId: method.id, expiresAt: Date.now() + 5 * 60 * 1000 });
    return { totpToken, methodLabel: method.label };
  }

  async finishTotpLogin(totpToken: string, code: string): Promise<{ sessionId: string; csrfToken: string }> {
    const pending = this.pendingTotpLogins.get(totpToken);
    this.checkRateLimit(`totp:${pending?.userId ?? 'invalid'}`);
    this.pendingTotpLogins.delete(totpToken);
    if (!pending || pending.expiresAt < Date.now()) throw new Error('TOTP challenge expired');
    const method = await this.store.getAuthMethod(pending.methodId);
    if (!method || !method.active) throw new Error('Invalid authentication method');
    const step = matchingTotpStep(this.decryptMethodTotp(method), code);
    if (step === null || !(await this.store.useTotpStep(method.id, step))) {
      this.recordFailure(`totp:${pending.userId}`);
      await this.audit(pending.userId, 'admin.totp.failed', method.id, {});
      throw new Error('Invalid TOTP code');
    }
    const sessionId = newToken();
    const csrfToken = newToken();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await this.store.createSession({ id: sessionId, userId: pending.userId, csrfToken, expiresAt });
    await this.audit(pending.userId, 'admin.login', pending.userId, { authMethodId: method.id });
    return { sessionId, csrfToken };
  }

  async startAuthMethodEnrollment(userId: string, label: string): Promise<{ methodId: string; totpSecret: string; totpUri: string }> {
    const user = await this.store.getUser(userId);
    if (!user) throw new Error('User not found');
    if (!label.trim()) throw new Error('Authentication method name is required');
    const secret = createTotpSecret();
    const encrypted = encryptJson(secret, this.masterKey);
    const methodId = newId();
    await this.store.createAuthMethod({
      id: methodId, userId, label: label.trim(),
      encryptedTotp: encrypted.encryptedPayload, iv: encrypted.iv, authTag: encrypted.authTag, keyVersion: encrypted.keyVersion,
      credentialId: null, publicKey: null, signCount: 0, lastTotpStep: null, active: false, createdAt: new Date().toISOString(),
    });
    await this.audit(userId, 'admin.auth-method.enrollment.started', methodId, { label: label.trim() });
    return { methodId, totpSecret: secret, totpUri: createTotpUri(secret, user.email) };
  }

  async verifyAuthMethodEnrollmentTotp(userId: string, methodId: string, code: string): Promise<Record<string, unknown>> {
    const method = await this.store.getAuthMethod(methodId);
    if (!method || method.userId !== userId || method.active || !this.verifyMethodTotp(method, code)) {
      throw new Error('Invalid TOTP code');
    }
    this.verifiedEnrollments.set(method.id, Date.now() + 10 * 60 * 1000);
    return this.startPasskeyRegistration(userId, method.id);
  }

  async startPasskeyRegistration(userId: string, methodId?: string): Promise<Record<string, unknown>> {
    const user = await this.store.getUser(userId);
    if (!user) throw new Error('User not found');
    const methods = await this.store.listAuthMethods(user.id);
    const method = methodId ? methods.find((item) => item.id === methodId) : methods.find((item) => !item.active);
    if (!method || method.active || (this.verifiedEnrollments.get(method.id) ?? 0) < Date.now()) {
      throw new Error('Verify TOTP before registering the paired passkey');
    }
    const keys = methods.filter((item) => item.active && item.credentialId);
    const options = await generateRegistrationOptions({
      rpName: 'BSB Vault',
      rpID: this.rpId,
      userName: user.email,
      userDisplayName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      excludeCredentials: keys.map((key) => ({ id: key.credentialId! })),
    });
    this.registrationChallenges.set(user.id, {
      userId: user.id,
      methodId: method.id,
      challenge: options.challenge,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return options as unknown as Record<string, unknown>;
  }

  async finishPasskeyRegistration(userId: string, credential: Record<string, unknown>): Promise<void> {
    const challenge = this.registrationChallenges.get(userId);
    this.registrationChallenges.delete(userId);
    if (!challenge || challenge.expiresAt < Date.now()) throw new Error('Passkey registration challenge expired');

    const verification = await verifyRegistrationResponse({
      response: credential as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      requireUserVerification: true,
    });
    if (!verification.verified) throw new Error('Invalid passkey registration');

    const registered = verification.registrationInfo.credential;
    await this.store.completeAuthMethod(
      challenge.methodId,
      registered.id,
      {
        publicKey: isoBase64URL.fromBuffer(registered.publicKey),
        transports: registered.transports ?? [],
      },
      registered.counter,
    );
    this.verifiedEnrollments.delete(challenge.methodId);
    await this.store.setUserPasskeyRequired(userId, true);
    const user = await this.store.getUser(userId);
    if (user?.status === 'pending' && user.passwordHash) await this.store.activateUser(userId);
    await this.audit(userId, 'admin.auth-method.created', challenge.methodId, {});
  }

  consumePasskeySetupToken(token?: string): string {
    if (!token) throw new Error('Passkey setup token required');
    const setup = this.pendingPasskeySetups.get(token);
    if (!setup || setup.expiresAt < Date.now()) {
      this.pendingPasskeySetups.delete(token);
      throw new Error('Passkey setup token expired');
    }
    return setup.userId;
  }

  clearPasskeySetupToken(token?: string): void {
    if (token) this.pendingPasskeySetups.delete(token);
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.store.deleteSession(sessionId);
    await this.audit(userId, 'admin.logout', userId, {});
  }

  async requireSession(sessionId?: string): Promise<{ userId: string; csrfToken: string }> {
    if (!sessionId) throw new Error('Authentication required');
    const session = await this.store.getSession(sessionId);
    if (!session) throw new Error('Authentication required');
    return { userId: session.userId, csrfToken: session.csrfToken };
  }

  async createApplication(userId: string, name: string, description?: string): Promise<ApplicationRecord> {
    const record: ApplicationRecord = {
      id: newId(),
      name,
      description: description ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.store.createApplication(record);
    await this.ensureApplicationProfile(record.id, 'default', userId);
    await this.audit(userId, 'application.create', record.id, { name });
    return record;
  }

  async updateApplication(userId: string, id: string, name: string, description?: string): Promise<void> {
    await this.store.updateApplication(id, name, description ?? null);
    await this.audit(userId, 'application.update', id, { name });
  }

  async deleteApplication(userId: string, id: string): Promise<void> {
    await this.store.deleteApplication(id);
    await this.audit(userId, 'application.delete', id, {});
  }

  async createGroup(userId: string, applicationId: string, name: string): Promise<GroupRecord> {
    const record: GroupRecord = {
      id: newId(),
      applicationId,
      name,
      createdAt: new Date().toISOString(),
    };
    await this.store.createGroup(record);
    await this.audit(userId, 'group.create', record.id, { applicationId, name });
    return record;
  }

  async createDeployment(userId: string, applicationId: string, name: string): Promise<{ group: GroupRecord; profile: ProfileRecord }> {
    const group = await this.createGroup(userId, applicationId, name);
    const profile = await this.createProfile(userId, group.id, 'default');
    await this.audit(userId, 'deployment.create', group.id, { applicationId, name, defaultProfileId: profile.id });
    return { group, profile };
  }

  async updateGroup(userId: string, id: string, applicationId: string, name: string): Promise<void> {
    await this.store.updateGroup(id, applicationId, name);
    await this.audit(userId, 'group.update', id, { applicationId, name });
  }

  async deleteGroup(userId: string, id: string): Promise<void> {
    await this.store.deleteGroup(id);
    await this.audit(userId, 'group.delete', id, {});
  }

  async createProfile(userId: string, groupId: string, name: string): Promise<ProfileRecord> {
    const record: ProfileRecord = {
      id: newId(),
      groupId,
      name,
      activeVersionId: null,
      createdAt: new Date().toISOString(),
    };
    await this.store.createProfile(record);
    await this.audit(userId, 'profile.create', record.id, { groupId, name });
    return record;
  }

  async updateProfile(userId: string, id: string, groupId: string, name: string): Promise<void> {
    await this.store.updateProfile(id, groupId, name);
    await this.audit(userId, 'profile.update', id, { groupId, name });
  }

  async deleteProfile(userId: string, id: string): Promise<void> {
    await this.store.deleteProfile(id);
    await this.audit(userId, 'profile.delete', id, {});
  }

  async createPlugin(userId: string, input: Omit<PluginCatalogRecord, 'id' | 'createdAt'>): Promise<PluginCatalogRecord> {
    const normalizedInput = normalizePluginCatalogInput(input);
    if (!normalizedInput.name.trim()) throw new Error('Plugin name is required');
    if (!normalizedInput.pluginId.trim()) throw new Error('Plugin id is required');
    if (!normalizedInput.version.trim()) throw new Error('Plugin version is required');
    const existing = (await this.store.listPlugins()).find((plugin) =>
      plugin.pluginId === normalizedInput.pluginId &&
      plugin.version === normalizedInput.version &&
      plugin.packageName === normalizedInput.packageName &&
      plugin.kind === normalizedInput.kind
    );
    if (existing) {
      await this.audit(userId, 'plugin.import.existing', existing.id, {
        pluginId: existing.pluginId,
        version: existing.version,
        source: existing.source,
      });
      return existing;
    }
    const record: PluginCatalogRecord = {
      ...normalizedInput,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    const previousPlugins = await this.store.listPlugins();
    await this.store.createPlugin(record);
    await this.lockIncompatibleUnlockedConfigs(userId, record, previousPlugins);
    await this.audit(userId, 'plugin.create', record.id, { pluginId: record.pluginId, version: record.version, source: record.source });
    return record;
  }

  async createPrivatePlugin(userId: string, input: PrivatePluginUploadInput): Promise<{ plugin: PluginCatalogRecord; keyId: string; secret: string }> {
    const parsed = privatePluginFromSchema(input);
    if ((await this.store.listPlugins()).some((plugin) => plugin.pluginId === parsed.pluginId)) {
      throw new Error(`Plugin ${parsed.pluginId} already exists`);
    }
    const plugin: PluginCatalogRecord = {
      ...parsed,
      id: newId(),
      source: 'manual',
      createdAt: new Date().toISOString(),
    };
    const credential = await createPublisherCredential(plugin);
    await this.store.createPrivatePlugin(plugin, credential.publisher);
    await this.audit(userId, 'plugin.private.create', plugin.id, {
      pluginId: plugin.pluginId,
      version: plugin.version,
      packageName: plugin.packageName,
      tokenId: credential.publisher.tokenId,
    });
    return { plugin, keyId: credential.publisher.tokenId, secret: credential.secret };
  }

  async enablePluginPublisher(userId: string, pluginId: string): Promise<{ keyId: string; secret: string }> {
    if (await this.store.getPluginPublisher(pluginId)) throw new Error('Plugin publishing is already enabled');
    const versions = (await this.store.listPlugins()).filter((plugin) => plugin.pluginId === pluginId);
    if (versions.length === 0 || versions.some((plugin) => plugin.source === 'registry' || !plugin.packageName)) {
      throw new Error('Only private plugins with an npm package can enable publishing');
    }
    const latest = latestPlugin(versions)!;
    if (versions.some((plugin) => plugin.org !== latest.org || plugin.packageName !== latest.packageName || plugin.kind !== latest.kind)) {
      throw new Error('Private plugin versions have inconsistent identities');
    }
    const credential = await createPublisherCredential(latest);
    await this.store.createPluginPublisher(credential.publisher);
    await this.audit(userId, 'plugin.publisher.create', pluginId, { tokenId: credential.publisher.tokenId });
    return { keyId: credential.publisher.tokenId, secret: credential.secret };
  }

  async rotatePluginPublisher(userId: string, pluginId: string): Promise<{ keyId: string; secret: string }> {
    const existing = await this.store.getPluginPublisher(pluginId);
    if (!existing) throw new Error('Plugin publisher not found');
    const credential = await createPublisherCredential(existing);
    await this.store.rotatePluginPublisher(pluginId, credential.publisher.tokenId, credential.publisher.secretHash, credential.publisher.rotatedAt);
    await this.audit(userId, 'plugin.publisher.rotate', pluginId, {
      previousTokenId: existing.tokenId,
      tokenId: credential.publisher.tokenId,
    });
    return { keyId: credential.publisher.tokenId, secret: credential.secret };
  }

  async publishPrivatePlugin(token: string, rawInput: Record<string, unknown>): Promise<{ status: 'published' | 'unchanged'; plugin: PluginCatalogRecord }> {
    const tokenId = publisherTokenId(token);
    const publisher = tokenId ? await this.store.getPluginPublisherByTokenId(tokenId) : null;
    if (!publisher || !(await verifySecret(token, publisher.secretHash))) {
      await this.audit(`publisher:${tokenId ?? 'unknown'}`, 'plugin.publish.auth.failed', 'plugin', {}).catch(() => undefined);
      throw new Error('Invalid plugin publish token');
    }
    const input = privatePluginPublishInput(rawInput);
    if (input.pluginId !== publisher.pluginId || input.org !== publisher.org || input.packageName !== publisher.packageName || input.kind !== publisher.kind) {
      await this.audit(`publisher:${publisher.tokenId}`, 'plugin.publish.identity.rejected', publisher.pluginId, {
        requestedPluginId: input.pluginId,
      });
      throw new Error('Publish token is not authorized for this plugin');
    }

    const previousPlugins = await this.store.listPlugins();
    const versions = previousPlugins.filter((plugin) => plugin.pluginId === publisher.pluginId);
    const existing = versions.find((plugin) => plugin.version === input.version);
    if (existing) {
      if (isDeepStrictEqual(existing.configSchema, input.configSchema) && isDeepStrictEqual(existing.eventSchema, input.eventSchema)) {
        await this.audit(`publisher:${publisher.tokenId}`, 'plugin.publish.unchanged', existing.id, { version: existing.version });
        return { status: 'unchanged', plugin: existing };
      }
      await this.audit(`publisher:${publisher.tokenId}`, 'plugin.publish.conflict', existing.id, { version: existing.version });
      throw new Error(`Plugin version ${input.version} already exists and cannot be overwritten`);
    }
    const latest = latestPlugin(versions);
    if (latest && compareVersions(input.version, latest.version) <= 0) {
      await this.audit(`publisher:${publisher.tokenId}`, 'plugin.publish.conflict', publisher.pluginId, {
        requestedVersion: input.version,
        latestVersion: latest.version,
      });
      throw new Error(`Plugin version ${input.version} must be newer than ${latest.version}`);
    }

    const record: PluginCatalogRecord = {
      id: newId(),
      org: publisher.org,
      name: publisher.name,
      pluginId: publisher.pluginId,
      packageName: publisher.packageName,
      version: input.version,
      kind: publisher.kind,
      source: 'upload',
      configSchema: input.configSchema,
      eventSchema: input.eventSchema,
      createdAt: new Date().toISOString(),
    };
    if (!(await this.store.createPluginIfAbsent(record))) {
      const concurrent = (await this.store.listPlugins()).find((plugin) =>
        plugin.pluginId === record.pluginId && plugin.version === record.version
      );
      if (concurrent && isDeepStrictEqual(concurrent.configSchema, record.configSchema) && isDeepStrictEqual(concurrent.eventSchema, record.eventSchema)) {
        await this.audit(`publisher:${publisher.tokenId}`, 'plugin.publish.unchanged', concurrent.id, { version: concurrent.version });
        return { status: 'unchanged', plugin: concurrent };
      }
      await this.audit(`publisher:${publisher.tokenId}`, 'plugin.publish.conflict', concurrent?.id ?? publisher.pluginId, {
        version: record.version,
      });
      throw new Error(`Plugin version ${record.version} already exists and cannot be overwritten`);
    }
    await this.lockIncompatibleUnlockedConfigs(`publisher:${publisher.tokenId}`, record, previousPlugins);
    await this.audit(`publisher:${publisher.tokenId}`, 'plugin.publish', record.id, {
      pluginId: record.pluginId,
      version: record.version,
      packageName: record.packageName,
    });
    return { status: 'published', plugin: record };
  }

  async deletePlugin(userId: string, pluginId: string): Promise<void> {
    const plugins = await this.store.listPlugins();
    const plugin = plugins.find((candidate) => candidate.id === pluginId);
    if (!plugin) throw new Error('Plugin not found');
    const usage = await this.pluginUsage(plugins);
    const used = usage[plugin.id];
    if (used?.count) throw new Error(`Plugin version is used by ${used.count} config entries`);
    const publisherRemoved = await this.store.deletePlugin(plugin.id);
    await this.audit(userId, 'plugin.delete', plugin.id, { pluginId: plugin.pluginId, version: plugin.version, publisherRemoved });
  }

  async cleanupUnusedImportedPlugins(userId: string, olderThanMs = 12 * 60 * 60 * 1000): Promise<number> {
    const plugins = await this.store.listPlugins();
    const usage = await this.pluginUsage(plugins);
    const now = Date.now();
    let deleted = 0;
    for (const plugin of plugins) {
      if (plugin.source !== 'registry') continue;
      if (usage[plugin.id]?.count) continue;
      const createdAt = Date.parse(plugin.createdAt);
      if (!Number.isFinite(createdAt) || now - createdAt < olderThanMs) continue;
      await this.store.deletePlugin(plugin.id);
      deleted += 1;
      await this.audit(userId, 'plugin.cleanup.unused', plugin.id, { pluginId: plugin.pluginId, version: plugin.version });
    }
    return deleted;
  }

  async saveDraft(userId: string, profileId: string, config: VaultRuntimeConfig): Promise<void> {
    const encrypted = encryptJson(config, this.masterKey);
    await this.store.upsertDraft({
      id: newId(),
      profileId,
      ...encrypted,
      updatedAt: new Date().toISOString(),
    });
    await this.audit(userId, 'config.draft.save', profileId, {});
  }

  async saveProfileDraft(userId: string, profileId: string, config: RuntimeConfigDefinition): Promise<void> {
    const binding = await this.store.resolveProfileBinding(profileId);
    if (!binding) throw new Error('Deployment profile not found');
    await this.saveDraft(userId, profileId, { [binding.profile.name]: config });
  }

  async ensureApplicationProfile(applicationId: string, name: string, userId?: string): Promise<ApplicationProfileRecord> {
    const existing = await this.store.getApplicationProfile(applicationId, name);
    if (existing) return existing;
    const record: ApplicationProfileRecord = {
      id: newId(),
      applicationId,
      name,
      activeVersionId: null,
      createdAt: new Date().toISOString(),
    };
    await this.store.createApplicationProfile(record);
    const created = await this.store.getApplicationProfile(applicationId, name) ?? record;
    if (userId) await this.audit(userId, 'application-profile.create', created.id, { applicationId, name });
    return created;
  }

  async saveApplicationProfileDraft(userId: string, applicationProfileId: string, config: RuntimeConfigDefinition): Promise<void> {
    const profile = await this.store.getApplicationProfileById(applicationProfileId);
    if (!profile) throw new Error('Application profile not found');
    const encrypted = encryptJson({ [profile.name]: config }, this.masterKey);
    await this.store.upsertApplicationDraft({
      id: newId(),
      applicationProfileId,
      ...encrypted,
      updatedAt: new Date().toISOString(),
    });
    await this.audit(userId, 'application-config.draft.save', applicationProfileId, {});
  }

  async getApplicationProfileDraft(applicationProfileId: string): Promise<RuntimeConfigDefinition | null> {
    const profile = await this.store.getApplicationProfileById(applicationProfileId);
    if (!profile) throw new Error('Application profile not found');
    const draft = await this.store.getApplicationDraft(applicationProfileId);
    if (!draft) return null;
    const config = decryptJson<VaultRuntimeConfig>(draft, this.masterKey);
    return config[profile.name] ?? null;
  }

  async publishApplicationProfileDraft(userId: string, applicationProfileId: string): Promise<{ versionId: string; version: number }> {
    const draft = await this.store.getApplicationDraft(applicationProfileId);
    if (!draft) throw new Error('No application profile draft found');
    const version = await this.store.nextApplicationVersion(applicationProfileId);
    const versionId = newId();
    await this.store.createApplicationVersion({
      id: versionId,
      applicationProfileId,
      version,
      encryptedPayload: draft.encryptedPayload,
      iv: draft.iv,
      authTag: draft.authTag,
      keyVersion: draft.keyVersion,
      publishedAt: new Date().toISOString(),
      publishedBy: userId,
    });
    await this.audit(userId, 'application-config.publish', applicationProfileId, { version });
    return { versionId, version };
  }

  async upsertApplicationProfilePlugin(
    userId: string,
    input: {
      applicationProfileId: string;
      section: 'services' | 'events' | 'observable';
      name: string;
      plugin: string;
      packageName?: string | null;
      version?: string | null;
      enabled: boolean;
      config?: Record<string, unknown>;
      sensitiveClearPaths?: string[];
    },
  ): Promise<void> {
    validateConfigName(input.name);
    const draft = await this.getApplicationProfileDraft(input.applicationProfileId) ?? { observable: {}, events: {}, services: {} };
    const section = draft[input.section] ?? {};
    const catalog = await this.resolveCatalogPlugin(input);
    input.config = mergeSensitiveConfig(
      catalog.configSchema,
      input.config ?? {},
      section[input.name]?.config ?? {},
      input.sensitiveClearPaths ?? [],
    );
    const config = await this.validatePluginConfig(input, catalog);
    section[input.name] = {
      plugin: catalog.pluginId,
      package: catalog.packageName ?? undefined,
      version: input.version ? catalog.version : undefined,
      enabled: input.enabled,
      config,
    };
    draft[input.section] = section;
    await this.saveApplicationProfileDraft(userId, input.applicationProfileId, draft);
    await this.audit(userId, 'application-config.plugin.upsert', input.applicationProfileId, {
      section: input.section,
      name: input.name,
      plugin: input.plugin,
    });
  }

  async removeApplicationProfilePlugin(
    userId: string,
    input: { applicationProfileId: string; section: 'services' | 'events' | 'observable'; name: string },
  ): Promise<void> {
    const draft = await this.getApplicationProfileDraft(input.applicationProfileId) ?? { observable: {}, events: {}, services: {} };
    delete draft[input.section]?.[input.name];
    await this.saveApplicationProfileDraft(userId, input.applicationProfileId, draft);
    await this.audit(userId, 'application-config.plugin.remove', input.applicationProfileId, {
      section: input.section,
      name: input.name,
    });
  }

  async upsertProfilePlugin(
    userId: string,
    input: {
      profileId: string;
      section: 'services' | 'events' | 'observable';
      name: string;
      plugin: string;
      packageName?: string | null;
      version?: string | null;
      enabled?: boolean;
      config?: Record<string, unknown>;
      baseEnabled?: boolean;
      baseConfig?: Record<string, unknown>;
      overridePaths?: string[];
      sensitiveClearPaths?: string[];
    },
  ): Promise<void> {
    validateConfigName(input.name);
    const binding = await this.store.resolveProfileBinding(input.profileId);
    if (!binding) throw new Error('Deployment profile not found');
    const draft = await this.getProfileDraft(input.profileId) ?? { observable: {}, events: {}, services: {} };
    const section = draft[input.section] ?? {};
    const catalog = await this.resolveCatalogPlugin(input);
    input.config = mergeSensitiveConfig(
      catalog.configSchema,
      input.config ?? {},
      section[input.name]?.config ?? {},
      input.sensitiveClearPaths ?? [],
    );
    const config = input.overridePaths
      ? await this.validatePluginConfigPaths(input, catalog, input.overridePaths)
      : await this.validatePluginConfig(input, catalog) ?? {};
    const entry: RuntimePluginDefinition = {
      plugin: catalog.pluginId,
      package: catalog.packageName ?? undefined,
      version: input.version ? catalog.version : undefined,
    };
    if (input.overridePaths) entry.override = true;
    if (input.baseEnabled === undefined || input.enabled !== undefined) {
      entry.enabled = input.enabled ?? false;
    }
    if (Object.keys(config).length > 0) entry.config = config;
    section[input.name] = entry;
    draft[input.section] = section;
    await this.saveProfileDraft(userId, input.profileId, draft);
    await this.audit(userId, 'config.plugin.upsert', input.profileId, {
      section: input.section,
      name: input.name,
      plugin: input.plugin,
    });
    if (!input.baseConfig) await this.syncProfilePluginPlaceholders(userId, binding.group.id, {
      ...input,
      plugin: catalog.pluginId,
      packageName: catalog.packageName,
      version: input.version ? catalog.version : undefined,
    });
  }

  private async syncProfilePluginPlaceholders(
    userId: string,
    groupId: string,
    input: {
      profileId: string;
      section: 'services' | 'events' | 'observable';
      name: string;
      plugin: string;
      packageName?: string | null;
      version?: string | null;
    },
  ): Promise<void> {
    const profiles = await this.store.listProfiles(groupId);
    for (const profile of profiles) {
      if (profile.id === input.profileId) continue;
      const draft = await this.getProfileDraft(profile.id) ?? { observable: {}, events: {}, services: {} };
      const section = draft[input.section] ?? {};
      if (section[input.name]) continue;
      section[input.name] = {
        plugin: input.plugin,
        package: input.packageName ?? undefined,
        version: input.version ?? undefined,
        enabled: false,
      };
      draft[input.section] = section;
      await this.saveProfileDraft(userId, profile.id, draft);
      await this.audit(userId, 'config.plugin.sync', profile.id, {
        section: input.section,
        name: input.name,
        plugin: input.plugin,
      });
    }
  }

  async removeProfilePlugin(
    userId: string,
    input: { profileId: string; section: 'services' | 'events' | 'observable'; name: string },
  ): Promise<void> {
    const draft = await this.getProfileDraft(input.profileId) ?? { observable: {}, events: {}, services: {} };
    delete draft[input.section]?.[input.name];
    await this.saveProfileDraft(userId, input.profileId, draft);
    await this.audit(userId, 'config.plugin.remove', input.profileId, {
      section: input.section,
      name: input.name,
    });
  }

  async getProfileDraft(profileId: string): Promise<RuntimeConfigDefinition | null> {
    const binding = await this.store.resolveProfileBinding(profileId);
    if (!binding) throw new Error('Deployment profile not found');
    const draft = await this.store.getDraft(profileId);
    if (!draft) return null;
    const config = decryptJson<VaultRuntimeConfig>(draft, this.masterKey);
    return config[binding.profile.name] ?? null;
  }

  async publishDraft(userId: string, profileId: string): Promise<{ versionId: string; version: number }> {
    const draft = await this.store.getDraft(profileId);
    if (!draft) throw new Error('No draft found for profile');
    const version = await this.store.nextVersion(profileId);
    const versionId = newId();
    await this.store.createVersion({
      id: versionId,
      profileId,
      version,
      encryptedPayload: draft.encryptedPayload,
      iv: draft.iv,
      authTag: draft.authTag,
      keyVersion: draft.keyVersion,
      publishedAt: new Date().toISOString(),
      publishedBy: userId,
    });
    await this.audit(userId, 'config.publish', profileId, { version });
    return { versionId, version };
  }

  async copyProfilePlugin(
    userId: string,
    input: {
      sourceProfileId: string;
      targetProfileId: string;
      section: 'services' | 'events' | 'observable';
      name: string;
      overwrite: boolean;
    },
  ): Promise<void> {
    const sourceDraft = await this.getProfileDraft(input.sourceProfileId) ?? { observable: {}, events: {}, services: {} };
    const source = sourceDraft[input.section]?.[input.name];
    if (!source) throw new Error('Source plugin config not found');
    const targetDraft = await this.getProfileDraft(input.targetProfileId) ?? { observable: {}, events: {}, services: {} };
    const section = targetDraft[input.section] ?? {};
    if (section[input.name] && !input.overwrite) throw new Error('Target plugin config already exists');
    section[input.name] = cloneJson(source) as RuntimePluginDefinition;
    targetDraft[input.section] = section;
    await this.saveProfileDraft(userId, input.targetProfileId, targetDraft);
    await this.audit(userId, 'config.plugin.copy', input.targetProfileId, {
      sourceProfileId: input.sourceProfileId,
      section: input.section,
      name: input.name,
      overwrite: input.overwrite,
    });
  }

  async createRuntimeKey(
    userId: string,
    input: Pick<RuntimeKeyRecord, 'name' | 'applicationId' | 'groupId' | 'profileId' | 'containerName' | 'configPluginId'>,
  ): Promise<{ keyId: string; secret: string }> {
    const keyId = `vk_${newToken(18)}`;
    const secret = `vs_${newToken(32)}`;
    await this.store.createRuntimeKey({
      id: keyId,
      name: input.name,
      secretHash: await hashSecret(secret),
      applicationId: input.applicationId,
      groupId: input.groupId,
      profileId: input.profileId,
      containerName: input.containerName,
      configPluginId: input.configPluginId,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    });
    await this.audit(userId, 'runtime-key.create', keyId, { profileId: input.profileId, containerName: input.containerName });
    return { keyId, secret };
  }

  async createProfileRuntimeKey(
    userId: string,
    input: { profileId: string; name: string; containerName?: string | null },
  ): Promise<{ keyId: string; secret: string }> {
    const binding = await this.store.resolveProfileBinding(input.profileId);
    if (!binding) throw new Error('Deployment profile not found');
    return this.createRuntimeKey(userId, {
      name: input.name,
      applicationId: binding.application.id,
      groupId: binding.group.id,
      profileId: binding.profile.id,
      containerName: input.containerName ?? null,
      configPluginId: 'config-vault',
    });
  }

  async rotateProfileRuntimeKey(
    userId: string,
    input: { keyId: string; name?: string },
  ): Promise<{ keyId: string; secret: string }> {
    const existing = await this.store.getRuntimeKey(input.keyId);
    if (!existing) throw new Error('Runtime key not found');
    await this.store.revokeRuntimeKey(existing.id);
    const created = await this.createProfileRuntimeKey(userId, {
      profileId: existing.profileId,
      name: input.name || existing.name,
      containerName: existing.containerName,
    });
    await this.audit(userId, 'runtime-key.rotate', existing.id, { replacementKeyId: created.keyId });
    return created;
  }

  async resolveRuntimeConfig(keyId: string, secret: string, obs?: Observable): Promise<ResolvedRuntimeConfig> {
    const binding = await this.store.resolveRuntimeBinding(keyId);
    if (!binding || !(await verifySecret(secret, binding.key.secretHash))) {
      await this.audit(keyId, 'runtime-config.auth.failed', keyId, {}).catch(() => undefined);
      throw new Error('Invalid Vault API key');
    }

    if (binding.key.configPluginId !== 'config-vault') {
      throw new Error(`Runtime key is not allowed to use config plugin ${binding.key.configPluginId}`);
    }
    if (!binding.profile.activeVersionId) {
      throw new Error('No active config version for deployment profile');
    }

    const version = await this.store.getVersion(binding.profile.activeVersionId);
    if (!version) {
      throw new Error('Active config version was not found');
    }

    const config = decryptJson<VaultRuntimeConfig>({
      encryptedPayload: version.encryptedPayload,
      iv: version.iv,
      authTag: version.authTag,
      keyVersion: version.keyVersion,
    }, this.masterKey);
    const shared = await this.getPublishedApplicationConfig(binding.application.id, binding.profile.name);
    const mergedProfile = mergeRuntimeConfig(
      shared?.[binding.profile.name] ?? {},
      config[binding.profile.name] ?? {},
    );
    const mergedConfig = { [binding.profile.name]: normalizeRuntimeConfig(mergedProfile, await this.store.listPlugins()) };
    obs?.log.info('Vault runtime config resolved for {application}/{group}/{profile}', {
      application: binding.application.name,
      group: binding.group.name,
      profile: binding.profile.name,
    });
    await this.audit(keyId, 'runtime-config.read', binding.profile.id, { version: version.version }).catch((error: unknown) => {
      obs?.log.warn('Vault runtime config resolved but audit write failed: {error}', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return {
      application: binding.application.name,
      group: binding.group.name,
      profile: binding.profile.name,
      version: version.version,
      config: mergedConfig,
    };
  }

  private async getPublishedApplicationConfig(applicationId: string, profileName: string): Promise<VaultRuntimeConfig | null> {
    const profile = await this.store.getApplicationProfile(applicationId, profileName);
    if (!profile?.activeVersionId) return null;
    const version = await this.store.getApplicationVersion(profile.activeVersionId);
    if (!version) return null;
    return decryptJson<VaultRuntimeConfig>({
      encryptedPayload: version.encryptedPayload,
      iv: version.iv,
      authTag: version.authTag,
      keyVersion: version.keyVersion,
    }, this.masterKey);
  }

  async dashboard(): Promise<{
    setupRequired: boolean;
    applications: ApplicationRecord[];
    groups: GroupRecord[];
    profiles: ProfileRecord[];
    plugins: PluginCatalogRecord[];
    pluginPublishers: Array<Omit<PluginPublisherRecord, 'secretHash'>>;
    pluginUsage: PluginUsage;
    runtimeKeys: RuntimeKeyRecord[];
  }> {
    const plugins = await this.store.listPlugins();
    return {
      setupRequired: await this.setupRequired(),
      applications: await this.store.listApplications(),
      groups: await this.store.listAllGroups(),
      profiles: await this.store.listAllProfiles(),
      plugins,
      pluginPublishers: (await this.store.listPluginPublishers()).map(({ secretHash: _secretHash, ...publisher }) => publisher),
      pluginUsage: await this.pluginUsage(plugins),
      runtimeKeys: await this.store.listRuntimeKeys(),
    };
  }

  private async pluginUsage(plugins: PluginCatalogRecord[]): Promise<PluginUsage> {
    const usage: PluginUsage = {};
    const add = (plugin: PluginCatalogRecord | undefined, location: PluginUsageLocation) => {
      if (!plugin) return;
      usage[plugin.id] ??= { count: 0, locations: [] };
      usage[plugin.id].count += 1;
      usage[plugin.id].locations.push(location);
    };
    const scan = (config: RuntimeConfigDefinition | null | undefined, context: { prefix: string; href: string }) => {
      if (!config) return;
      for (const sectionName of ['services', 'events', 'observable'] as const) {
        const section = config[sectionName] ?? {};
        for (const [name, entry] of Object.entries(section)) {
          add(resolveCatalogForEntry(plugins, sectionName, entry), {
            label: `${context.prefix} / ${sectionName} / ${name}`,
            href: context.href,
          });
        }
      }
    };
    for (const profile of await this.store.listAllProfiles()) {
      scan(await this.getProfileDraft(profile.id), {
        prefix: `deployment draft ${profile.name}`,
        href: `/deployment?profileId=${encodeURIComponent(profile.id)}`,
      });
      if (profile.activeVersionId) {
        const version = await this.store.getVersion(profile.activeVersionId);
        if (version) {
          const decrypted = decryptJson<VaultRuntimeConfig>(version, this.masterKey);
          scan(decrypted[profile.name], {
            prefix: `deployment live ${profile.name}`,
            href: `/deployment?profileId=${encodeURIComponent(profile.id)}`,
          });
        }
      }
    }
    for (const profile of await this.store.listAllApplicationProfiles()) {
      scan(await this.getApplicationProfileDraft(profile.id), {
        prefix: `shared draft ${profile.name}`,
        href: `/application-config?applicationId=${encodeURIComponent(profile.applicationId)}&profile=${encodeURIComponent(profile.name)}`,
      });
      if (profile.activeVersionId) {
        const version = await this.store.getApplicationVersion(profile.activeVersionId);
        if (version) {
          const decrypted = decryptJson<VaultRuntimeConfig>(version, this.masterKey);
          scan(decrypted[profile.name], {
            prefix: `shared live ${profile.name}`,
            href: `/application-config?applicationId=${encodeURIComponent(profile.applicationId)}&profile=${encodeURIComponent(profile.name)}`,
          });
        }
      }
    }
    return usage;
  }

  private async lockIncompatibleUnlockedConfigs(
    userId: string,
    imported: PluginCatalogRecord,
    previousPlugins: PluginCatalogRecord[],
  ): Promise<void> {
    const sectionName = sectionForKind(imported.kind);
    if (!sectionName) return;
    const previous = latestPlugin(previousPlugins.filter((plugin) =>
      plugin.pluginId === imported.pluginId &&
      plugin.kind === imported.kind &&
      plugin.packageName === imported.packageName
    ));
    if (!previous || compareVersions(imported.version, previous.version) <= 0) return;

    const visit = async (config: RuntimeConfigDefinition | null, save: (next: RuntimeConfigDefinition) => Promise<void>) => {
      if (!config) return;
      let changed = false;
      const section = config[sectionName] ?? {};
      for (const entry of Object.values(section)) {
        if (entry.version) continue;
        if (entry.plugin !== imported.pluginId) continue;
        if ((entry.package ?? null) !== imported.packageName) continue;
        try {
          await this.validatePluginConfig({
            section: sectionName,
            plugin: entry.plugin,
            packageName: entry.package ?? null,
            config: entry.config ?? {},
          }, imported);
        } catch {
          entry.version = previous.version;
          changed = true;
        }
      }
      if (changed) await save(config);
    };

    for (const profile of await this.store.listAllProfiles()) {
      const draft = await this.getProfileDraft(profile.id);
      if (draft) {
        await visit(draft, (next) => this.saveProfileDraft(userId, profile.id, next));
        continue;
      }
      if (!profile.activeVersionId) continue;
      const version = await this.store.getVersion(profile.activeVersionId);
      if (!version) continue;
      const live = decryptJson<VaultRuntimeConfig>(version, this.masterKey)[profile.name] ?? null;
      await visit(live, (next) => this.saveProfileDraft(userId, profile.id, next));
    }

    for (const profile of await this.store.listAllApplicationProfiles()) {
      const draft = await this.getApplicationProfileDraft(profile.id);
      if (draft) {
        await visit(draft, (next) => this.saveApplicationProfileDraft(userId, profile.id, next));
        continue;
      }
      if (!profile.activeVersionId) continue;
      const version = await this.store.getApplicationVersion(profile.activeVersionId);
      if (!version) continue;
      const live = decryptJson<VaultRuntimeConfig>(version, this.masterKey)[profile.name] ?? null;
      await visit(live, (next) => this.saveApplicationProfileDraft(userId, profile.id, next));
    }
  }

  async deploymentProfile(profileId: string, userId?: string): Promise<{
    application: ApplicationRecord;
    group: GroupRecord;
    profile: ProfileRecord;
    profiles: ProfileRecord[];
    allProfiles: ProfileRecord[];
    groups: GroupRecord[];
    applications: ApplicationRecord[];
    applicationProfiles: ApplicationProfileRecord[];
    inheritedDraft: RuntimeConfigDefinition | null;
    configState: ConfigState;
    inheritedConfigState: ConfigState;
    plugins: PluginCatalogRecord[];
    draft: RuntimeConfigDefinition | null;
    runtimeKeys: RuntimeKeyRecord[];
  }> {
    const binding = await this.store.resolveProfileBinding(profileId);
    if (!binding) throw new Error('Deployment profile not found');
    const applicationProfile = await this.ensureApplicationProfile(binding.application.id, binding.profile.name, userId);
    return {
      application: binding.application,
      group: binding.group,
      profile: binding.profile,
      profiles: await this.store.listProfiles(binding.group.id),
      allProfiles: await this.store.listAllProfiles(),
      groups: await this.store.listAllGroups(),
      applications: await this.store.listApplications(),
      applicationProfiles: await this.store.listApplicationProfiles(binding.application.id),
      plugins: await this.store.listPlugins(),
      draft: await this.getProfileDraft(profileId),
      inheritedDraft: await this.getApplicationProfileDraft(applicationProfile.id),
      configState: await this.profileConfigState(binding.profile),
      inheritedConfigState: await this.applicationConfigState(applicationProfile),
      runtimeKeys: await this.store.listRuntimeKeys(profileId),
    };
  }

  async applicationProfile(applicationId: string, profileName: string, userId?: string): Promise<{
    application: ApplicationRecord;
    applicationProfile: ApplicationProfileRecord;
    applicationProfiles: ApplicationProfileRecord[];
    plugins: PluginCatalogRecord[];
    draft: RuntimeConfigDefinition | null;
    configState: ConfigState;
  }> {
    const application = await this.store.getApplication(applicationId);
    if (!application) throw new Error('Application not found');
    const applicationProfile = await this.ensureApplicationProfile(applicationId, profileName, userId);
    return {
      application,
      applicationProfile,
      applicationProfiles: await this.store.listApplicationProfiles(applicationId),
      plugins: await this.store.listPlugins(),
      draft: await this.getApplicationProfileDraft(applicationProfile.id),
      configState: await this.applicationConfigState(applicationProfile),
    };
  }

  private async profileConfigState(profile: ProfileRecord): Promise<ConfigState> {
    const draft = await this.store.getDraft(profile.id);
    const version = profile.activeVersionId ? await this.store.getVersion(profile.activeVersionId) : null;
    return configState(draft?.updatedAt ?? null, version?.publishedAt ?? null);
  }

  private async applicationConfigState(profile: ApplicationProfileRecord): Promise<ConfigState> {
    const draft = await this.store.getApplicationDraft(profile.id);
    const version = profile.activeVersionId ? await this.store.getApplicationVersion(profile.activeVersionId) : null;
    return configState(draft?.updatedAt ?? null, version?.publishedAt ?? null);
  }

  async users(): Promise<Array<{ id: string; email: string; status: string; createdAt: string; authMethodCount: number }>> {
    return Promise.all((await this.store.listUsers()).map(async (user) => ({
      id: user.id,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      authMethodCount: (await this.store.listAuthMethods(user.id, true)).length,
    })));
  }

  async inviteUser(actorId: string, email: string): Promise<{ setupUrl: string }> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Valid email is required');
    if (await this.store.getUserByEmail(normalized)) throw new Error('User already exists');
    const token = newToken(32);
    const now = new Date().toISOString();
    const userId = newId();
    await this.store.createUser({
      id: userId,
      email: normalized,
      passwordHash: null,
      totpSecret: null,
      passkeyRequired: true,
      status: 'pending',
      setupTokenHash: tokenHash(token),
      setupExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      updatedAt: now,
    });
    await this.audit(actorId, 'user.invited', userId, { email: normalized });
    return { setupUrl: `${this.origin}/user-setup#token=${encodeURIComponent(token)}` };
  }

  async beginInvitedUserSetup(token: string, password: string, passwordConfirm: string, label: string): Promise<{ userId: string; methodId: string; totpSecret: string; totpUri: string }> {
    const user = await this.store.getUserBySetupTokenHash(tokenHash(token));
    if (!user) throw new Error('Setup link is invalid or expired');
    if (password.length < 12) throw new Error('Password must be at least 12 characters');
    if (password !== passwordConfirm) throw new Error('Passwords do not match');
    if (user.passwordHash) {
      if (!(await verifySecret(password, user.passwordHash))) throw new Error('Setup has already started with a different password');
      const pending = (await this.store.listAuthMethods(user.id)).find((method) => !method.active);
      if (!pending) throw new Error('Setup has already been completed');
      const totpSecret = this.decryptMethodTotp(pending);
      return { userId: user.id, methodId: pending.id, totpSecret, totpUri: createTotpUri(totpSecret, user.email) };
    }
    await this.store.setPendingPassword(user.id, await hashSecret(password));
    const enrollment = await this.startAuthMethodEnrollment(user.id, label);
    return { userId: user.id, ...enrollment };
  }

  async setupUserId(token: string): Promise<string> {
    const user = await this.store.getUserBySetupTokenHash(tokenHash(token));
    if (!user) throw new Error('Setup link is invalid or expired');
    return user.id;
  }

  async exchangeUserSetupToken(token: string): Promise<string> {
    const currentHash = tokenHash(token);
    const user = await this.store.getUserBySetupTokenHash(currentHash);
    if (!user) throw new Error('Setup link is invalid or expired');
    const sessionToken = newToken(32);
    if (!(await this.store.rotateUserSetupToken(user.id, currentHash, tokenHash(sessionToken)))) {
      throw new Error('Setup link has already been used');
    }
    await this.audit(user.id, 'user.setup-link.exchanged', user.id, {});
    return sessionToken;
  }

  async deactivateUser(actorId: string, userId: string): Promise<void> {
    const target = await this.store.getUser(userId);
    if (!target) throw new Error('User not found');
    if (!(await this.store.suspendUser(userId, 'inactive'))) throw new Error('Cannot deactivate the last active admin');
    await this.audit(actorId, 'user.deactivated', userId, { email: target.email });
  }

  async resetUser(actorId: string, userId: string): Promise<{ setupUrl: string }> {
    const target = await this.store.getUser(userId);
    if (!target) throw new Error('User not found');
    const token = newToken(32);
    if (!(await this.store.suspendUser(userId, 'pending', {
      hash: tokenHash(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }))) throw new Error('Cannot reset the last active admin');
    await this.audit(actorId, 'user.reset', userId, { email: target.email });
    return { setupUrl: `${this.origin}/user-setup#token=${encodeURIComponent(token)}` };
  }

  async deleteOwnAuthMethod(userId: string, methodId: string): Promise<void> {
    if (!(await this.store.deleteAuthMethod(methodId, userId))) {
      throw new Error('At least one TOTP and passkey pair is required');
    }
    await this.audit(userId, 'admin.auth-method.deleted', methodId, {});
  }

  async auditLog(before?: number): Promise<{ valid: boolean; entries: Awaited<ReturnType<VaultStore['listAudit']>> }> {
    return { valid: await this.store.verifyAuditChain(), entries: await this.store.listAudit(100, before) };
  }

  async assertAuditWritable(): Promise<void> {
    await this.store.assertAuditWritable();
  }

  async userProfile(userId: string): Promise<{ user: { id: string; email: string; createdAt: string }; authMethods: AuthMethodRecord[] }> {
    const user = await this.store.getUser(userId);
    if (!user) throw new Error('User not found');
    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      authMethods: await this.store.listAuthMethods(user.id, true),
    };
  }

  async groups(applicationId: string): Promise<GroupRecord[]> {
    return this.store.listGroups(applicationId);
  }

  async profiles(groupId: string): Promise<ProfileRecord[]> {
    return this.store.listProfiles(groupId);
  }

  private async audit(actor: string, action: string, target: string, details: Record<string, unknown>): Promise<void> {
    const actorUser = await this.store.getUser(actor).catch(() => null);
    await this.store.audit({
      id: newId(),
      actor,
      actorEmail: actorUser?.email ?? null,
      action,
      target,
      details,
      createdAt: new Date().toISOString(),
    });
  }

  private decryptMethodTotp(method: AuthMethodRecord): string {
    return decryptJson<string>({
      encryptedPayload: method.encryptedTotp,
      iv: method.iv,
      authTag: method.authTag,
      keyVersion: method.keyVersion,
    }, this.masterKey);
  }

  private verifyMethodTotp(method: AuthMethodRecord, code: string): boolean {
    return verifyTotp(this.decryptMethodTotp(method), code);
  }

  private checkRateLimit(key: string): void {
    const attempt = this.attempts.get(key);
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= 5) {
      throw new Error('Too many authentication attempts; try again later');
    }
  }

  private recordFailure(key: string): void {
    const current = this.attempts.get(key);
    this.attempts.set(key, !current || current.resetAt <= Date.now()
      ? { count: 1, resetAt: Date.now() + 5 * 60 * 1000 }
      : { ...current, count: current.count + 1 });
  }

  private async validatePluginConfig(input: {
    section: 'services' | 'events' | 'observable';
    plugin: string;
    packageName?: string | null;
    version?: string | null;
    config?: Record<string, unknown>;
  }, catalog: PluginCatalogRecord): Promise<RuntimePluginDefinition['config']> {
    if (!catalog?.configSchema) return input.config ?? {};
    const root = objectField(objectField(catalog.configSchema.root) ?? catalog.configSchema);
    if (!root) return input.config ?? {};
    const value = validateSchemaNode(root, input.config ?? {}, 'config', true);
    if (!isPlainObject(value)) {
      throw new Error(`Invalid config for ${input.plugin}: config must be an object`);
    }
    return value;
  }

  private async validatePluginConfigPaths(
    input: {
      section: 'services' | 'events' | 'observable';
      plugin: string;
      packageName?: string | null;
      version?: string | null;
      config?: Record<string, unknown>;
    },
    catalog: PluginCatalogRecord,
    paths: string[],
  ): Promise<Record<string, unknown>> {
    if (!catalog.configSchema) return pickConfigPaths(input.config ?? {}, paths);
    const root = objectField(objectField(catalog.configSchema.root) ?? catalog.configSchema);
    if (!root) return pickConfigPaths(input.config ?? {}, paths);
    const output: Record<string, unknown> = {};
    for (const path of paths) {
      const node = schemaNodeAtPath(root, path);
      const value = valueAtPath(input.config ?? {}, path);
      if (!node || value === undefined) continue;
      const validated = validateSchemaNode(node, value, `config.${path}`, true);
      if (validated !== omitted) setValueAtPath(output, path, validated);
    }
    return output;
  }

  private async resolveCatalogPlugin(input: {
    section: 'services' | 'events' | 'observable';
    plugin: string;
    packageName?: string | null;
    version?: string | null;
  }): Promise<PluginCatalogRecord> {
    const expectedKind = input.section === 'services' ? 'service' : input.section;
    const plugins = (await this.store.listPlugins()).filter((plugin) =>
      (plugin.pluginId === input.plugin || `${plugin.org}/${plugin.pluginId}` === input.plugin) &&
      plugin.kind === expectedKind &&
      (input.packageName ? plugin.packageName === input.packageName : true)
    );
    if (plugins.length === 0) throw new Error(`Plugin ${input.plugin} (${expectedKind}) is not imported`);
    const catalog = input.version
      ? plugins.find((plugin) => plugin.version === input.version)
      : latestPlugin(plugins);
    if (!catalog) throw new Error(`Plugin ${input.plugin} version ${input.version ?? 'latest'} is not imported`);
    return catalog;
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function toWebAuthnCredential(passkey: AuthMethodRecord) {
  const stored = passkey.publicKey as { publicKey?: string; transports?: string[] } | null;
  if (!stored || typeof stored.publicKey !== 'string') throw new Error('Invalid stored passkey');
  return {
    id: passkey.credentialId!,
    publicKey: isoBase64URL.toBuffer(stored.publicKey),
    counter: passkey.signCount,
    transports: stored.transports as never,
  };
}

const omitted = Symbol('omitted');

type ValidationValue = unknown | typeof omitted;

function validateSchemaNode(node: Record<string, unknown>, value: unknown, path: string, required: boolean): ValidationValue {
  if (value === undefined) {
    if ('default' in node) return cloneDefault(node.default);
    if (!required || node.kind === 'optional') return omitted;
    if (node.kind === 'object') return validateObjectNode(node, {}, path);
  }

  if (node.kind === 'optional') {
    if (value === undefined) return omitted;
    return validateSchemaNode(requireObject(node.inner, path), value, path, false);
  }
  if (node.kind === 'nullable') {
    if (value === null) return null;
    return validateSchemaNode(requireObject(node.inner, path), value, path, required);
  }

  switch (String(node.kind)) {
    case 'object':
      return validateObjectNode(node, value, path);
    case 'string':
      return validateStringNode(node, value, path);
    case 'int':
    case 'int32':
    case 'int64':
      return validateNumberNode(node, value, path, true);
    case 'number':
    case 'float':
    case 'float32':
    case 'float64':
      return validateNumberNode(node, value, path, false);
    case 'bool':
    case 'boolean':
      return validateBoolNode(value, path);
    case 'enum':
      return validateEnumNode(node, value, path);
    case 'array':
      return validateArrayNode(node, value, path);
    case 'record':
      return validateRecordNode(node, value, path);
    case 'tuple':
      return validateTupleNode(node, value, path);
    case 'union':
      return validateUnionNode(node, value, path);
    case 'unknown':
    case 'any':
      return value;
    default:
      return value;
  }
}

function validateObjectNode(node: Record<string, unknown>, value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${path} must be an object`);
  const properties = objectField(node.properties) ?? {};
  const required = new Set(Array.isArray(node.required) ? node.required.map(String) : Object.keys(properties).filter((key) => !isOptional(properties[key])));
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(properties)) {
    const childNode = requireObject(child, `${path}.${key}`);
    const childValue = validateSchemaNode(childNode, value[key], `${path}.${key}`, required.has(key));
    if (childValue !== omitted) output[key] = childValue;
  }
  return output;
}

function validateStringNode(node: Record<string, unknown>, value: unknown, path: string): string {
  if (typeof value !== 'string') throw new Error(`${path} must be a string`);
  if (typeof node.minLength === 'number' && value.length < node.minLength) throw new Error(`${path} is too short`);
  if (typeof node.maxLength === 'number' && value.length > node.maxLength) throw new Error(`${path} is too long`);
  if (typeof node.pattern === 'string' && !(new RegExp(node.pattern).test(value))) throw new Error(`${path} is invalid`);
  return value;
}

function validateNumberNode(node: Record<string, unknown>, value: unknown, path: string, integer: boolean): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) throw new Error(`${path} must be a number`);
  if (integer && !Number.isInteger(number)) throw new Error(`${path} must be an integer`);
  if (typeof node.min === 'number' && number < node.min) throw new Error(`${path} must be at least ${node.min}`);
  if (typeof node.max === 'number' && number > node.max) throw new Error(`${path} must be at most ${node.max}`);
  return number;
}

function validateBoolNode(value: unknown, path: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${path} must be true or false`);
}

function validateEnumNode(node: Record<string, unknown>, value: unknown, path: string): unknown {
  const values = Array.isArray(node.values) ? node.values : [];
  if (!values.some((item) => item === value || String(item) === String(value))) {
    throw new Error(`${path} must be one of ${values.map(String).join(', ')}`);
  }
  return values.find((item) => item === value || String(item) === String(value)) ?? value;
}

function validateArrayNode(node: Record<string, unknown>, value: unknown, path: string): unknown[] {
  const array = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : null;
  if (!array) throw new Error(`${path} must be an array`);
  if (typeof node.minItems === 'number' && array.length < node.minItems) throw new Error(`${path} has too few items`);
  if (typeof node.maxItems === 'number' && array.length > node.maxItems) throw new Error(`${path} has too many items`);
  const itemNode = objectField(node.items) ?? objectField(node.item);
  if (!itemNode) return array;
  return array.map((item, index) => {
    const validated = validateSchemaNode(itemNode, item, `${path}[${index}]`, true);
    if (validated === omitted) throw new Error(`${path}[${index}] is required`);
    return validated;
  });
}

function validateRecordNode(node: Record<string, unknown>, value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${path} must be an object`);
  const valueNode = objectField(node.valueSchema) ?? objectField(node.values) ?? objectField(node.value);
  if (!valueNode) return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const validated = validateSchemaNode(valueNode, item, `${path}.${key}`, true);
    if (validated !== omitted) output[key] = validated;
  }
  return output;
}

function validateTupleNode(node: Record<string, unknown>, value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  const items = (Array.isArray(node.items) ? node.items : Array.isArray(node.elements) ? node.elements : []).map((item, index) => requireObject(item, `${path}[${index}]`));
  if (items.length > 0 && value.length !== items.length) throw new Error(`${path} must have ${items.length} items`);
  return items.length === 0 ? value : items.map((item, index) => {
    const validated = validateSchemaNode(item, value[index], `${path}[${index}]`, true);
    if (validated === omitted) throw new Error(`${path}[${index}] is required`);
    return validated;
  });
}

function validateUnionNode(node: Record<string, unknown>, value: unknown, path: string): unknown {
  const variants = (Array.isArray(node.variants) ? node.variants : Array.isArray(node.anyOf) ? node.anyOf : Array.isArray(node.oneOf) ? node.oneOf : [])
    .map((item, index) => requireObject(item, `${path}<${index}>`));
  const errors: string[] = [];
  for (const variant of variants) {
    try {
      const validated = validateSchemaNode(variant, value, path, true);
      if (validated !== omitted) return validated;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(errors[0] ?? `${path} does not match any allowed shape`);
}

function schemaNodeAtPath(root: Record<string, unknown>, path: string): Record<string, unknown> | null {
  let current: Record<string, unknown> | null = root;
  for (const part of path.split('.')) {
    current = unwrapSchemaNode(current);
    if (!current) return null;
    if (current.kind === 'object') {
      const properties = objectField(current.properties);
      current = properties ? objectField(properties[part]) : null;
      continue;
    }
    return null;
  }
  return unwrapSchemaNode(current);
}

function unwrapSchemaNode(node: Record<string, unknown> | null): Record<string, unknown> | null {
  let current = node;
  while (current && (current.kind === 'optional' || current.kind === 'nullable')) {
    current = objectField(current.inner);
  }
  return current;
}

function isOptional(value: unknown): boolean {
  return isPlainObject(value) && (value.kind === 'optional' || ('default' in value));
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  const object = objectField(value);
  if (!object) throw new Error(`${path} schema is invalid`);
  return object;
}

function objectField(value: unknown): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneDefault(value: unknown): unknown {
  return isPlainObject(value) || Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : value;
}

function cloneJson(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function validateConfigName(name: string): void {
  if (!name.trim()) throw new Error('Config name is required');
}

function privatePluginFromSchema(input: PrivatePluginUploadInput): Omit<PluginCatalogRecord, 'id' | 'source' | 'createdAt'> {
  const fileName = input.schemaFileName.trim();
  if (!/^[a-z0-9][a-z0-9._-]*\.json$/i.test(fileName)) throw new Error('Schema file must be named {plugin-id}.json');
  const pluginId = fileName.slice(0, -5);
  const org = input.org.trim();
  const packageName = input.packageName.trim();
  if (!/^(_|@?[a-z0-9][a-z0-9._-]*)$/i.test(org)) throw new Error('Plugin org is invalid');
  if (!packageName || /\s/.test(packageName)) throw new Error('Plugin npm package is required');
  const version = requiredVersion(input.schema.version, 'Schema version');
  const rawKind = requiredString(input.schema.pluginType, 'Schema pluginType');
  if (rawKind !== 'service' && rawKind !== 'events' && rawKind !== 'observable') {
    throw new Error('Private plugin type must be service, events, or observable');
  }
  const events = objectField(input.schema.events);
  if (!events) throw new Error('Schema events must be an object');
  const name = typeof input.schema.pluginName === 'string' && input.schema.pluginName.trim()
    ? input.schema.pluginName.trim()
    : pluginId;
  const eventSchema: Record<string, unknown> = { pluginName: name, version, events };
  if (objectField(input.schema.capabilities)) eventSchema.capabilities = input.schema.capabilities;
  if (Array.isArray(input.schema.dependencies)) eventSchema.dependencies = input.schema.dependencies;
  return {
    org,
    name,
    pluginId,
    packageName,
    version,
    kind: rawKind,
    configSchema: objectField(input.schema.configSchema),
    eventSchema,
  };
}

function privatePluginPublishInput(input: Record<string, unknown>): PrivatePluginPublishInput {
  const metadata = objectField(input.metadata) ?? {};
  const packages = objectField(input.package) ?? {};
  const eventSchema = objectField(input.eventSchema);
  if (!eventSchema) throw new Error('eventSchema must be an object');
  if (!objectField(eventSchema.events)) throw new Error('eventSchema.events must be an object');
  const version = requiredVersion(input.version, 'Plugin version');
  if (typeof eventSchema.version === 'string' && eventSchema.version !== version) {
    throw new Error('Plugin version must match eventSchema.version');
  }
  const rawKind = requiredString(input.kind ?? metadata.category, 'Plugin kind');
  if (rawKind !== 'service' && rawKind !== 'events' && rawKind !== 'observable') {
    throw new Error('Plugin kind must be service, events, or observable');
  }
  if (input.language !== undefined && input.language !== 'nodejs') throw new Error('Only Node.js plugins can be published to Vault');
  return {
    org: requiredString(input.org, 'Plugin org'),
    pluginId: requiredString(input.pluginId ?? input.name, 'Plugin id'),
    packageName: requiredString(input.packageName ?? packages.nodejs, 'Plugin npm package'),
    version,
    kind: rawKind,
    configSchema: input.configSchema === undefined || input.configSchema === null ? null : requireObject(input.configSchema, 'configSchema'),
    eventSchema,
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function requiredVersion(value: unknown, label: string): string {
  const version = requiredString(value, label);
  if (!/^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i.test(version)) {
    throw new Error(`${label} must use semantic versioning`);
  }
  return version;
}

async function createPublisherCredential(
  plugin: Pick<PluginCatalogRecord, 'pluginId' | 'org' | 'name' | 'packageName' | 'kind'> | PluginPublisherRecord,
): Promise<{ publisher: PluginPublisherRecord; secret: string }> {
  if (!plugin.packageName || plugin.kind === 'config') throw new Error('Private plugin requires a configurable Node.js package');
  const tokenId = newToken(9);
  const slug = plugin.pluginId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'plugin';
  const secret = `bv_p_${slug}_${tokenId}_${newToken(32)}`;
  const now = new Date().toISOString();
  return {
    secret,
    publisher: {
      pluginId: plugin.pluginId,
      org: plugin.org,
      name: plugin.name,
      packageName: plugin.packageName,
      kind: plugin.kind,
      tokenId,
      secretHash: await hashSecret(secret),
      createdAt: 'createdAt' in plugin ? plugin.createdAt : now,
      rotatedAt: now,
    },
  };
}

function publisherTokenId(token: string): string | null {
  return /^bv_p_[a-z0-9-]{1,48}_([A-Za-z0-9_-]{12})_[A-Za-z0-9_-]{43}$/.exec(token)?.[1] ?? null;
}

function sectionForKind(kind: PluginCatalogRecord['kind']): 'services' | 'events' | 'observable' | null {
  if (kind === 'service') return 'services';
  if (kind === 'events') return 'events';
  if (kind === 'observable') return 'observable';
  return null;
}

function latestPlugin(plugins: PluginCatalogRecord[]): PluginCatalogRecord | undefined {
  return [...plugins].sort((left, right) => compareVersions(right.version, left.version))[0];
}

function compareVersions(left: string, right: string): number {
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

function normalizePluginCatalogInput(input: Omit<PluginCatalogRecord, 'id' | 'createdAt'>): Omit<PluginCatalogRecord, 'id' | 'createdAt'> {
  const slashIndex = input.pluginId.indexOf('/');
  const orgFromPluginId = slashIndex > 0 ? input.pluginId.slice(0, slashIndex) : null;
  const pluginId = slashIndex > 0 ? input.pluginId.slice(slashIndex + 1) : input.pluginId;
  const org = orgFromPluginId ?? input.org;
  if (input.source === 'registry' && org !== '_' && !input.packageName) {
    throw new Error(`Package name is required for registry plugin ${org}/${pluginId}`);
  }
  if (!input.packageName && input.pluginId.includes('/')) {
    throw new Error(`Package name is required for plugin ${input.pluginId}`);
  }
  return {
    ...input,
    org,
    pluginId,
  };
}

function normalizeRuntimeConfig(config: RuntimeConfigDefinition, plugins: PluginCatalogRecord[]): RuntimeConfigDefinition {
  return {
    observable: normalizeRuntimeSection(config.observable, 'observable', plugins),
    events: normalizeRuntimeSection(config.events, 'events', plugins),
    services: normalizeRuntimeSection(config.services, 'services', plugins),
  };
}

function normalizeRuntimeSection(
  section: Record<string, RuntimePluginDefinition> | undefined,
  sectionName: 'services' | 'events' | 'observable',
  plugins: PluginCatalogRecord[],
): Record<string, RuntimePluginDefinition> | undefined {
  if (!section) return undefined;
  return Object.fromEntries(Object.entries(section).map(([name, entry]) => {
    const catalog = resolveCatalogForEntry(plugins, sectionName, entry);
    const normalized: RuntimePluginDefinition = {
      ...entry,
      plugin: catalog?.pluginId ?? entry.plugin,
      package: entry.package ?? catalog?.packageName ?? undefined,
    };
    delete normalized.override;
    if (!normalized.package) delete normalized.package;
    return [name, normalized];
  }));
}

function mergeRuntimeConfig(shared: RuntimeConfigDefinition, local: RuntimeConfigDefinition): RuntimeConfigDefinition {
  return {
    observable: mergePluginSection(shared.observable, local.observable),
    events: mergePluginSection(shared.events, local.events),
    services: mergePluginSection(shared.services, local.services),
  };
}

function mergePluginSection(
  shared: Record<string, RuntimePluginDefinition> | undefined,
  local: Record<string, RuntimePluginDefinition> | undefined,
): Record<string, RuntimePluginDefinition> {
  const output: Record<string, RuntimePluginDefinition> = {};
  for (const [name, plugin] of Object.entries(shared ?? {})) {
    output[name] = cloneJson(plugin) as RuntimePluginDefinition;
  }
  for (const [name, plugin] of Object.entries(local ?? {})) {
    const base = output[name];
    output[name] = base ? {
      ...base,
      ...plugin,
      config: deepMergeObjects(base.config ?? {}, plugin.config ?? {}),
    } : cloneJson(plugin) as RuntimePluginDefinition;
    if (output[name].override) delete output[name].override;
  }
  return output;
}

function resolveCatalogForEntry(
  plugins: PluginCatalogRecord[],
  section: 'services' | 'events' | 'observable',
  entry: RuntimePluginDefinition,
): PluginCatalogRecord | undefined {
  const expectedKind = section === 'services' ? 'service' : section;
  const matches = plugins.filter((plugin) =>
    (plugin.pluginId === entry.plugin || `${plugin.org}/${plugin.pluginId}` === entry.plugin) &&
    plugin.kind === expectedKind &&
    (entry.package ? plugin.packageName === entry.package : true)
  );
  return entry.version
    ? matches.find((plugin) => plugin.version === entry.version)
    : latestPlugin(matches);
}

function deepMergeObjects(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const output = cloneJson(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    const existing = output[key];
    output[key] = isPlainObject(existing) && isPlainObject(value)
      ? deepMergeObjects(existing, value)
      : cloneJson(value);
  }
  return output;
}

function pickConfigPaths(source: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const path of paths) {
    if (!path) continue;
    const value = valueAtPath(source, path);
    if (value === undefined) continue;
    setValueAtPath(output, path, value);
  }
  return output;
}

function valueAtPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => isPlainObject(acc) ? acc[part] : undefined, source);
}

function setValueAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    const existing = current[part];
    if (!isPlainObject(existing)) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1] ?? path] = cloneJson(value);
}

function mergeSensitiveConfig(
  schema: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
  clearPaths: string[],
): Record<string, unknown> {
  const output = cloneJson(incoming) as Record<string, unknown>;
  const root = objectField(objectField(schema?.root) ?? schema);
  if (!root) return output;
  const clear = new Set(clearPaths);
  for (const path of sensitiveSchemaPaths(root)) {
    if (clear.has(path)) {
      deleteValueAtPath(output, path);
      continue;
    }
    const prior = valueAtPath(existing, path);
    if (valueAtPath(output, path) === undefined && prior !== undefined) setValueAtPath(output, path, prior);
  }
  return output;
}

function sensitiveSchemaPaths(node: Record<string, unknown>, prefix = ''): string[] {
  const unwrapped = unwrapSchemaNode(node);
  const rawMetadata = objectField(node.metadata);
  const metadata = objectField(unwrapped?.metadata);
  if (prefix && (rawMetadata?.sensitive === true || rawMetadata?.writeonly === true ||
      metadata?.sensitive === true || metadata?.writeonly === true)) return [prefix];
  if (!unwrapped || unwrapped.kind !== 'object') return [];
  return Object.entries(objectField(unwrapped.properties) ?? {}).flatMap(([key, value]) => {
    const child = objectField(value);
    return child ? sensitiveSchemaPaths(child, prefix ? `${prefix}.${key}` : key) : [];
  });
}

function deleteValueAtPath(target: Record<string, unknown>, path: string): void {
  const parts = path.split('.');
  let current: Record<string, unknown> | null = target;
  for (const part of parts.slice(0, -1)) current = objectField(current?.[part]);
  if (current) delete current[parts[parts.length - 1] ?? path];
}

function configState(draftUpdatedAt: string | null, publishedAt: string | null): ConfigState {
  if (!draftUpdatedAt && !publishedAt) return { state: 'empty', draftUpdatedAt, publishedAt };
  if (draftUpdatedAt && !publishedAt) return { state: 'draft-only', draftUpdatedAt, publishedAt };
  if (draftUpdatedAt && publishedAt && Date.parse(draftUpdatedAt) > Date.parse(publishedAt)) {
    return { state: 'draft-pending', draftUpdatedAt, publishedAt };
  }
  return { state: 'published', draftUpdatedAt, publishedAt };
}
