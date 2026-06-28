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
    const record: PluginCatalogRecord = {
      ...input,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    await this.store.createPlugin(record);
    await this.audit(userId, 'plugin.create', record.id, { pluginId: record.pluginId, version: record.version, source: record.source });
    return record;
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

  async upsertProfilePlugin(
    userId: string,
    input: {
      profileId: string;
      section: 'services' | 'events' | 'observable';
      name: string;
      plugin: string;
      packageName?: string | null;
      version?: string | null;
      enabled: boolean;
      config?: Record<string, unknown>;
    },
  ): Promise<void> {
    const draft = await this.getProfileDraft(input.profileId) ?? { observable: {}, events: {}, services: {} };
    const section = draft[input.section] ?? {};
    const config = await this.validatePluginConfig(input);
    section[input.name] = {
      plugin: input.plugin,
      package: input.packageName ?? undefined,
      version: input.version ?? undefined,
      enabled: input.enabled,
      config,
    };
    draft[input.section] = section;
    await this.saveProfileDraft(userId, input.profileId, draft);
    await this.audit(userId, 'config.plugin.upsert', input.profileId, {
      section: input.section,
      name: input.name,
      plugin: input.plugin,
    });
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
      config,
    };
  }

  async dashboard(): Promise<{
    setupRequired: boolean;
    applications: ApplicationRecord[];
    groups: GroupRecord[];
    profiles: ProfileRecord[];
    plugins: PluginCatalogRecord[];
    runtimeKeys: RuntimeKeyRecord[];
  }> {
    return {
      setupRequired: await this.setupRequired(),
      applications: await this.store.listApplications(),
      groups: await this.store.listAllGroups(),
      profiles: await this.store.listAllProfiles(),
      plugins: await this.store.listPlugins(),
      runtimeKeys: await this.store.listRuntimeKeys(),
    };
  }

  async deploymentProfile(profileId: string): Promise<{
    application: ApplicationRecord;
    group: GroupRecord;
    profile: ProfileRecord;
    profiles: ProfileRecord[];
    plugins: PluginCatalogRecord[];
    draft: RuntimeConfigDefinition | null;
    runtimeKeys: RuntimeKeyRecord[];
  }> {
    const binding = await this.store.resolveProfileBinding(profileId);
    if (!binding) throw new Error('Deployment profile not found');
    return {
      application: binding.application,
      group: binding.group,
      profile: binding.profile,
      profiles: await this.store.listProfiles(binding.group.id),
      plugins: await this.store.listPlugins(),
      draft: await this.getProfileDraft(profileId),
      runtimeKeys: await this.store.listRuntimeKeys(profileId),
    };
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
  }): Promise<RuntimePluginDefinition['config']> {
    const plugins = await this.store.listPlugins();
    const catalog = plugins.find((plugin) =>
      plugin.pluginId === input.plugin &&
      plugin.kind === (input.section === 'services' ? 'service' : input.section) &&
      (input.version ? plugin.version === input.version : true) &&
      (input.packageName ? plugin.packageName === input.packageName : true)
    ) ?? plugins.find((plugin) => plugin.pluginId === input.plugin);
    if (!catalog?.configSchema) return input.config ?? {};
    const root = objectField(objectField(catalog.configSchema.root) ?? catalog.configSchema);
    if (!root) return input.config ?? {};
    const value = validateSchemaNode(root, input.config ?? {}, 'config', true);
    if (!isPlainObject(value)) {
      throw new Error(`Invalid config for ${input.plugin}: config must be an object`);
    }
    return value;
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
