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
    plugins: PluginCatalogRecord[];
    runtimeKeys: RuntimeKeyRecord[];
  }> {
    return {
      setupRequired: await this.setupRequired(),
      applications: await this.store.listApplications(),
      plugins: await this.store.listPlugins(),
      runtimeKeys: await this.store.listRuntimeKeys(),
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
