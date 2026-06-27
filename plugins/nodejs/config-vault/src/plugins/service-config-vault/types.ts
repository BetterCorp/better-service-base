export type PluginKind = 'service' | 'events' | 'observable' | 'config';
export type PluginSource = 'registry' | 'manual' | 'upload';

export interface RuntimeConfigDefinition {
  observable?: Record<string, RuntimePluginDefinition>;
  events?: Record<string, RuntimePluginDefinition>;
  services?: Record<string, RuntimePluginDefinition>;
}

export interface RuntimePluginDefinition {
  plugin: string;
  package?: string;
  version?: string;
  enabled: boolean;
  filter?: string[];
  config?: Record<string, unknown>;
}

export type VaultRuntimeConfig = Record<string, RuntimeConfigDefinition>;

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  totpSecret: string;
  passkeyRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  csrfToken: string;
  expiresAt: string;
}

export interface PasskeyRecord {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: Record<string, unknown>;
  signCount: number;
  createdAt: string;
}

export interface ApplicationRecord {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface GroupRecord {
  id: string;
  applicationId: string;
  name: string;
  createdAt: string;
}

export interface ProfileRecord {
  id: string;
  groupId: string;
  name: string;
  activeVersionId: string | null;
  createdAt: string;
}

export interface PluginCatalogRecord {
  id: string;
  org: string;
  name: string;
  pluginId: string;
  packageName: string | null;
  version: string;
  kind: PluginKind;
  source: PluginSource;
  configSchema: Record<string, unknown> | null;
  eventSchema: Record<string, unknown> | null;
  createdAt: string;
}

export interface ConfigDraftRecord {
  id: string;
  profileId: string;
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  updatedAt: string;
}

export interface ConfigVersionRecord {
  id: string;
  profileId: string;
  version: number;
  encryptedPayload: string;
  iv: string;
  authTag: string;
  keyVersion: string;
  publishedAt: string;
  publishedBy: string;
}

export interface RuntimeKeyRecord {
  id: string;
  name: string;
  secretHash: string;
  applicationId: string;
  groupId: string;
  profileId: string;
  containerName: string | null;
  configPluginId: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  target: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ResolvedRuntimeConfig {
  application: string;
  group: string;
  profile: string;
  version: number;
  config: VaultRuntimeConfig;
}

export interface FirstAdminInput {
  setupCode: string;
  email: string;
  password: string;
  passwordConfirm: string;
}

export interface FirstAdminResult {
  email: string;
  totpSecret: string;
  totpUri: string;
}

export type LoginStartResult =
  | { status: 'passkey_setup_required'; setupToken: string }
  | { status: 'passkey_required'; challengeId: string; options: Record<string, unknown> };
