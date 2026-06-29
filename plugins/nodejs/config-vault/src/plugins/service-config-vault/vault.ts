import type { Observable } from '@bsb/base';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { decryptJson, encryptJson, hashSecret, newId, newToken, createTotpSecret, createTotpUri, verifySecret, verifyTotp } from './crypto.js';
import { VaultStore } from './store.js';
import type {
  ApplicationRecord,
  ApplicationProfileRecord,
  FirstAdminInput,
  FirstAdminResult,
  LoginStartResult,
  PasskeyRecord,
  GroupRecord,
  PluginCatalogRecord,
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

type PluginUsage = Record<string, { count: number; locations: string[] }>;

export class VaultService {
  private readonly store: VaultStore;
  private readonly masterKey: Buffer;
  private readonly setupCode: string;
  private readonly origin: string;
  private readonly rpId: string;
  private readonly pendingPasskeySetups = new Map<string, { userId: string; expiresAt: number }>();
  private readonly registrationChallenges = new Map<string, { userId: string; challenge: string; expiresAt: number }>();
  private readonly authenticationChallenges = new Map<string, { userId: string; challenge: string; expiresAt: number }>();

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

    const now = new Date().toISOString();
    const totpSecret = createTotpSecret();

    const userId = newId();
    await this.store.createUser({
      id: userId,
      email: input.email,
      passwordHash: await hashSecret(input.password),
      totpSecret,
      passkeyRequired: false,
      createdAt: now,
      updatedAt: now,
    });

    await this.audit('setup', 'admin.created', userId, { email: input.email });
    return {
      email: input.email,
      totpSecret,
      totpUri: createTotpUri(totpSecret, input.email),
    };
  }

  async login(email: string, password: string, totpCode: string): Promise<LoginStartResult> {
    const user = await this.store.getUserByEmail(email);
    if (!user || !(await verifySecret(password, user.passwordHash)) || !verifyTotp(user.totpSecret, totpCode)) {
      await this.audit('anonymous', 'admin.login.failed', email, {});
      throw new Error('Invalid login');
    }

    const keys = await this.store.listPasskeys(user.id);
    if (keys.length === 0) {
      const setupToken = newToken();
      this.pendingPasskeySetups.set(setupToken, { userId: user.id, expiresAt: Date.now() + 10 * 60 * 1000 });
      await this.audit(user.id, 'admin.passkey.setup.required', user.id, {});
      return { status: 'passkey_setup_required', setupToken };
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpId,
      allowCredentials: keys.map((key) => ({ id: key.credentialId })),
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

  async finishLogin(challengeId: string, credential: Record<string, unknown>): Promise<{ sessionId: string; csrfToken: string }> {
    const challenge = this.authenticationChallenges.get(challengeId);
    this.authenticationChallenges.delete(challengeId);
    if (!challenge || challenge.expiresAt < Date.now()) throw new Error('Passkey challenge expired');

    const keys = await this.store.listPasskeys(challenge.userId);
    const responseId = typeof credential.id === 'string' ? credential.id : '';
    const key = keys.find((candidate) => candidate.credentialId === responseId);
    if (!key) {
      await this.audit(challenge.userId, 'admin.passkey.failed', challenge.userId, {});
      throw new Error('Invalid passkey');
    }

    const verification = await verifyAuthenticationResponse({
      response: credential as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpId,
      credential: toWebAuthnCredential(key),
      requireUserVerification: true,
    });
    if (!verification.verified) {
      await this.audit(challenge.userId, 'admin.passkey.failed', challenge.userId, {});
      throw new Error('Invalid passkey');
    }
    await this.store.updatePasskeyCounter(key.id, verification.authenticationInfo.newCounter);

    const sessionId = newToken();
    const csrfToken = newToken();
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    await this.store.createSession({ id: sessionId, userId: challenge.userId, csrfToken, expiresAt });
    await this.audit(challenge.userId, 'admin.login', challenge.userId, {});
    return { sessionId, csrfToken };
  }

  async startPasskeyRegistration(userId: string): Promise<Record<string, unknown>> {
    const user = await this.store.getUser(userId);
    if (!user) throw new Error('User not found');
    const keys = await this.store.listPasskeys(user.id);
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
      excludeCredentials: keys.map((key) => ({ id: key.credentialId })),
    });
    this.registrationChallenges.set(user.id, {
      userId: user.id,
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
    await this.store.createPasskey({
      id: newId(),
      userId,
      credentialId: registered.id,
      publicKey: {
        publicKey: isoBase64URL.fromBuffer(registered.publicKey),
        transports: registered.transports ?? [],
      },
      signCount: registered.counter,
      createdAt: new Date().toISOString(),
    });
    await this.store.setUserPasskeyRequired(userId, true);
    await this.audit(userId, 'admin.passkey.created', userId, {});
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

  async logout(sessionId: string): Promise<void> {
    await this.store.deleteSession(sessionId);
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
    await this.ensureApplicationProfile(record.id, 'default');
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
    if (!input.name.trim()) throw new Error('Plugin name is required');
    if (!input.pluginId.trim()) throw new Error('Plugin id is required');
    if (!input.version.trim()) throw new Error('Plugin version is required');
    const existing = (await this.store.listPlugins()).find((plugin) =>
      plugin.pluginId === input.pluginId &&
      plugin.version === input.version &&
      plugin.packageName === input.packageName &&
      plugin.kind === input.kind
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
      ...input,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    const previousPlugins = await this.store.listPlugins();
    await this.store.createPlugin(record);
    await this.lockIncompatibleUnlockedConfigs(userId, record, previousPlugins);
    await this.audit(userId, 'plugin.create', record.id, { pluginId: record.pluginId, version: record.version, source: record.source });
    return record;
  }

  async deletePlugin(userId: string, pluginId: string): Promise<void> {
    const plugins = await this.store.listPlugins();
    const plugin = plugins.find((candidate) => candidate.id === pluginId);
    if (!plugin) throw new Error('Plugin not found');
    const usage = await this.pluginUsage(plugins);
    const used = usage[plugin.id];
    if (used?.count) throw new Error(`Plugin version is used by ${used.count} config entries`);
    await this.store.deletePlugin(plugin.id);
    await this.audit(userId, 'plugin.delete', plugin.id, { pluginId: plugin.pluginId, version: plugin.version });
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

  async ensureApplicationProfile(applicationId: string, name: string): Promise<ApplicationProfileRecord> {
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
    return await this.store.getApplicationProfile(applicationId, name) ?? record;
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
    },
  ): Promise<void> {
    validateConfigName(input.name);
    const draft = await this.getApplicationProfileDraft(input.applicationProfileId) ?? { observable: {}, events: {}, services: {} };
    const section = draft[input.section] ?? {};
    const catalog = await this.resolveCatalogPlugin(input);
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
    },
  ): Promise<void> {
    validateConfigName(input.name);
    const binding = await this.store.resolveProfileBinding(input.profileId);
    if (!binding) throw new Error('Deployment profile not found');
    const draft = await this.getProfileDraft(input.profileId) ?? { observable: {}, events: {}, services: {} };
    const section = draft[input.section] ?? {};
    const catalog = await this.resolveCatalogPlugin(input);
    const config = input.overridePaths
      ? await this.validatePluginConfigPaths(input, catalog, input.overridePaths)
      : await this.validatePluginConfig(input, catalog) ?? {};
    const entry: RuntimePluginDefinition = {
      plugin: catalog.pluginId,
      package: catalog.packageName ?? undefined,
      version: input.version ? catalog.version : undefined,
    };
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
    if (!input.baseConfig) await this.syncProfilePluginPlaceholders(userId, binding.group.id, input);
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
      await this.audit(keyId, 'runtime-config.auth.failed', keyId, {});
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
    const mergedConfig = { [binding.profile.name]: mergedProfile };
    obs?.log.info('Vault runtime config resolved for {application}/{group}/{profile}', {
      application: binding.application.name,
      group: binding.group.name,
      profile: binding.profile.name,
    });
    await this.audit(keyId, 'runtime-config.read', binding.profile.id, { version: version.version });
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
      pluginUsage: await this.pluginUsage(plugins),
      runtimeKeys: await this.store.listRuntimeKeys(),
    };
  }

  private async pluginUsage(plugins: PluginCatalogRecord[]): Promise<PluginUsage> {
    const usage: PluginUsage = {};
    const add = (plugin: PluginCatalogRecord | undefined, location: string) => {
      if (!plugin) return;
      usage[plugin.id] ??= { count: 0, locations: [] };
      usage[plugin.id].count += 1;
      usage[plugin.id].locations.push(location);
    };
    const scan = (config: RuntimeConfigDefinition | null | undefined, location: string) => {
      if (!config) return;
      for (const sectionName of ['services', 'events', 'observable'] as const) {
        const section = config[sectionName] ?? {};
        for (const [name, entry] of Object.entries(section)) {
          add(resolveCatalogForEntry(plugins, sectionName, entry), `${location}/${sectionName}/${name}`);
        }
      }
    };
    for (const profile of await this.store.listAllProfiles()) {
      scan(await this.getProfileDraft(profile.id), `draft:${profile.id}`);
      if (profile.activeVersionId) {
        const version = await this.store.getVersion(profile.activeVersionId);
        if (version) {
          const decrypted = decryptJson<VaultRuntimeConfig>(version, this.masterKey);
          scan(decrypted[profile.name], `live:${profile.id}`);
        }
      }
    }
    for (const profile of await this.store.listAllApplicationProfiles()) {
      scan(await this.getApplicationProfileDraft(profile.id), `app-draft:${profile.id}`);
      if (profile.activeVersionId) {
        const version = await this.store.getApplicationVersion(profile.activeVersionId);
        if (version) {
          const decrypted = decryptJson<VaultRuntimeConfig>(version, this.masterKey);
          scan(decrypted[profile.name], `app-live:${profile.id}`);
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

  async deploymentProfile(profileId: string): Promise<{
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
    const applicationProfile = await this.ensureApplicationProfile(binding.application.id, binding.profile.name);
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

  async applicationProfile(applicationId: string, profileName: string): Promise<{
    application: ApplicationRecord;
    applicationProfile: ApplicationProfileRecord;
    applicationProfiles: ApplicationProfileRecord[];
    plugins: PluginCatalogRecord[];
    draft: RuntimeConfigDefinition | null;
    configState: ConfigState;
  }> {
    const application = await this.store.getApplication(applicationId);
    if (!application) throw new Error('Application not found');
    const applicationProfile = await this.ensureApplicationProfile(applicationId, profileName);
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

  async userProfile(userId: string): Promise<{ user: { id: string; email: string; createdAt: string }; passkeys: PasskeyRecord[] }> {
    const user = await this.store.getUser(userId);
    if (!user) throw new Error('User not found');
    return {
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
      passkeys: await this.store.listPasskeys(user.id),
    };
  }

  async groups(applicationId: string): Promise<GroupRecord[]> {
    return this.store.listGroups(applicationId);
  }

  async profiles(groupId: string): Promise<ProfileRecord[]> {
    return this.store.listProfiles(groupId);
  }

  private async audit(actor: string, action: string, target: string, details: Record<string, unknown>): Promise<void> {
    await this.store.audit({
      id: newId(),
      actor,
      action,
      target,
      details,
      createdAt: new Date().toISOString(),
    });
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
      plugin.pluginId === input.plugin &&
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

function toWebAuthnCredential(passkey: PasskeyRecord) {
  const stored = passkey.publicKey as { publicKey?: string; transports?: string[] };
  if (typeof stored.publicKey !== 'string') throw new Error('Invalid stored passkey');
  return {
    id: passkey.credentialId,
    publicKey: isoBase64URL.toBuffer(stored.publicKey),
    counter: passkey.signCount,
    transports: stored.transports as never,
  };
}

const omitted = Symbol('omitted');

type ValidationValue = unknown | typeof omitted;

function validateSchemaNode(node: Record<string, unknown>, value: unknown, path: string, required: boolean): ValidationValue {
  if (value === undefined || value === '') {
    if ('default' in node) return cloneDefault(node.default);
    if (!required || node.kind === 'optional') return omitted;
    if (node.kind === 'object') return validateObjectNode(node, {}, path);
  }

  if (node.kind === 'optional') {
    if (value === undefined || value === '') return omitted;
    return validateSchemaNode(requireObject(node.inner, path), value, path, false);
  }
  if (node.kind === 'nullable') {
    if (value === null || value === '') return null;
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
    plugin.pluginId === entry.plugin &&
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

function configState(draftUpdatedAt: string | null, publishedAt: string | null): ConfigState {
  if (!draftUpdatedAt && !publishedAt) return { state: 'empty', draftUpdatedAt, publishedAt };
  if (draftUpdatedAt && !publishedAt) return { state: 'draft-only', draftUpdatedAt, publishedAt };
  if (draftUpdatedAt && publishedAt && Date.parse(draftUpdatedAt) > Date.parse(publishedAt)) {
    return { state: 'draft-pending', draftUpdatedAt, publishedAt };
  }
  return { state: 'published', draftUpdatedAt, publishedAt };
}
