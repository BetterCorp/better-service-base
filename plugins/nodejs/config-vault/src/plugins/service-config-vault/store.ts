import { Pool } from 'pg';
import type {
  ApplicationRecord,
  ApplicationConfigDraftRecord,
  ApplicationConfigVersionRecord,
  ApplicationProfileRecord,
  AuditRecord,
  ConfigDraftRecord,
  ConfigVersionRecord,
  GroupRecord,
  PasskeyRecord,
  PluginCatalogRecord,
  ProfileRecord,
  RuntimeKeyRecord,
  SessionRecord,
  UserRecord,
} from './types.js';

export class VaultStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async init(): Promise<void> {
    await this.pool.query(`
      create table if not exists vault_users (
        id text primary key,
        email text not null unique,
        password_hash text not null,
        totp_secret text not null,
        passkey_required boolean not null default true,
        created_at timestamptz not null,
        updated_at timestamptz not null
      );
      create table if not exists vault_passkeys (
        id text primary key,
        user_id text not null references vault_users(id) on delete cascade,
        credential_id text not null unique,
        public_key jsonb not null,
        sign_count integer not null default 0,
        created_at timestamptz not null
      );
      create table if not exists vault_sessions (
        id text primary key,
        user_id text not null references vault_users(id) on delete cascade,
        csrf_token text not null,
        expires_at timestamptz not null
      );
      create table if not exists vault_applications (
        id text primary key,
        name text not null unique,
        description text,
        created_at timestamptz not null
      );
      create table if not exists vault_groups (
        id text primary key,
        application_id text not null references vault_applications(id) on delete cascade,
        name text not null,
        created_at timestamptz not null,
        unique(application_id, name)
      );
      create table if not exists vault_profiles (
        id text primary key,
        group_id text not null references vault_groups(id) on delete cascade,
        name text not null,
        active_version_id text,
        created_at timestamptz not null,
        unique(group_id, name)
      );
      create table if not exists vault_application_profiles (
        id text primary key,
        application_id text not null references vault_applications(id) on delete cascade,
        name text not null,
        active_version_id text,
        created_at timestamptz not null,
        unique(application_id, name)
      );
      create table if not exists vault_plugin_catalog (
        id text primary key,
        org text not null,
        name text not null,
        plugin_id text not null,
        package_name text,
        version text not null,
        kind text not null,
        source text not null,
        config_schema jsonb,
        event_schema jsonb,
        created_at timestamptz not null,
        unique(plugin_id, version)
      );
      create table if not exists vault_config_drafts (
        id text primary key,
        profile_id text not null references vault_profiles(id) on delete cascade,
        encrypted_payload text not null,
        iv text not null,
        auth_tag text not null,
        key_version text not null,
        updated_at timestamptz not null,
        unique(profile_id)
      );
      create table if not exists vault_config_versions (
        id text primary key,
        profile_id text not null references vault_profiles(id) on delete cascade,
        version integer not null,
        encrypted_payload text not null,
        iv text not null,
        auth_tag text not null,
        key_version text not null,
        published_at timestamptz not null,
        published_by text not null,
        unique(profile_id, version)
      );
      create table if not exists vault_application_config_drafts (
        id text primary key,
        application_profile_id text not null references vault_application_profiles(id) on delete cascade,
        encrypted_payload text not null,
        iv text not null,
        auth_tag text not null,
        key_version text not null,
        updated_at timestamptz not null,
        unique(application_profile_id)
      );
      create table if not exists vault_application_config_versions (
        id text primary key,
        application_profile_id text not null references vault_application_profiles(id) on delete cascade,
        version integer not null,
        encrypted_payload text not null,
        iv text not null,
        auth_tag text not null,
        key_version text not null,
        published_at timestamptz not null,
        published_by text not null,
        unique(application_profile_id, version)
      );
      create table if not exists vault_runtime_keys (
        id text primary key,
        name text not null,
        secret_hash text not null,
        application_id text not null references vault_applications(id) on delete cascade,
        group_id text not null references vault_groups(id) on delete cascade,
        profile_id text not null references vault_profiles(id) on delete cascade,
        container_name text,
        config_plugin_id text not null,
        revoked_at timestamptz,
        created_at timestamptz not null
      );
      create table if not exists vault_audit_log (
        id text primary key,
        actor text not null,
        action text not null,
        target text not null,
        details jsonb not null,
        created_at timestamptz not null
      );
    `);
  }

  async countAdmins(): Promise<number> {
    const result = await this.pool.query<{ count: string }>('select count(*)::text as count from vault_users');
    return Number(result.rows[0]?.count ?? '0');
  }

  async createUser(user: UserRecord): Promise<void> {
    const result = await this.pool.query(
      `insert into vault_users (id, email, password_hash, totp_secret, passkey_required, created_at, updated_at)
       select $1, $2, $3, $4, $5, $6, $7
       where not exists (select 1 from vault_users)`,
      [user.id, user.email, user.passwordHash, user.totpSecret, user.passkeyRequired, user.createdAt, user.updatedAt],
    );
    if (result.rowCount !== 1) {
      throw new Error('Vault supports exactly one admin user');
    }
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query('select * from vault_users where email = $1', [email]);
    return result.rows[0] ? mapUser(result.rows[0] as DbRow) : null;
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const result = await this.pool.query('select * from vault_users where id = $1', [id]);
    return result.rows[0] ? mapUser(result.rows[0] as DbRow) : null;
  }

  async createPasskey(passkey: PasskeyRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_passkeys (id, user_id, credential_id, public_key, sign_count, created_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [passkey.id, passkey.userId, passkey.credentialId, passkey.publicKey, passkey.signCount, passkey.createdAt],
    );
  }

  async updatePasskeyCounter(id: string, signCount: number): Promise<void> {
    await this.pool.query('update vault_passkeys set sign_count = $1 where id = $2', [signCount, id]);
  }

  async setUserPasskeyRequired(userId: string, required: boolean): Promise<void> {
    await this.pool.query('update vault_users set passkey_required = $1, updated_at = now() where id = $2', [required, userId]);
  }

  async listPasskeys(userId: string): Promise<PasskeyRecord[]> {
    const result = await this.pool.query('select * from vault_passkeys where user_id = $1 order by created_at', [userId]);
    return result.rows.map((row) => mapPasskey(row as DbRow));
  }

  async createSession(session: SessionRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_sessions (id, user_id, csrf_token, expires_at) values ($1, $2, $3, $4)`,
      [session.id, session.userId, session.csrfToken, session.expiresAt],
    );
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const result = await this.pool.query('select * from vault_sessions where id = $1 and expires_at > now()', [id]);
    return result.rows[0] ? mapSession(result.rows[0] as DbRow) : null;
  }

  async deleteSession(id: string): Promise<void> {
    await this.pool.query('delete from vault_sessions where id = $1', [id]);
  }

  async createApplication(record: ApplicationRecord): Promise<void> {
    await this.pool.query(
      'insert into vault_applications (id, name, description, created_at) values ($1, $2, $3, $4)',
      [record.id, record.name, record.description, record.createdAt],
    );
  }

  async updateApplication(id: string, name: string, description: string | null): Promise<void> {
    await this.pool.query('update vault_applications set name = $1, description = $2 where id = $3', [name, description, id]);
  }

  async deleteApplication(id: string): Promise<void> {
    await this.pool.query('delete from vault_applications where id = $1', [id]);
  }

  async listApplications(): Promise<ApplicationRecord[]> {
    const result = await this.pool.query('select * from vault_applications order by name');
    return result.rows.map((row) => mapApplication(row as DbRow));
  }

  async getApplication(id: string): Promise<ApplicationRecord | null> {
    const result = await this.pool.query('select * from vault_applications where id = $1', [id]);
    return result.rows[0] ? mapApplication(result.rows[0] as DbRow) : null;
  }

  async createApplicationProfile(record: ApplicationProfileRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_application_profiles (id, application_id, name, active_version_id, created_at)
       values ($1, $2, $3, $4, $5)
       on conflict (application_id, name) do nothing`,
      [record.id, record.applicationId, record.name, record.activeVersionId, record.createdAt],
    );
  }

  async getApplicationProfile(applicationId: string, name: string): Promise<ApplicationProfileRecord | null> {
    const result = await this.pool.query(
      'select * from vault_application_profiles where application_id = $1 and name = $2',
      [applicationId, name],
    );
    return result.rows[0] ? mapApplicationProfile(result.rows[0] as DbRow) : null;
  }

  async getApplicationProfileById(id: string): Promise<ApplicationProfileRecord | null> {
    const result = await this.pool.query('select * from vault_application_profiles where id = $1', [id]);
    return result.rows[0] ? mapApplicationProfile(result.rows[0] as DbRow) : null;
  }

  async listApplicationProfiles(applicationId: string): Promise<ApplicationProfileRecord[]> {
    const result = await this.pool.query('select * from vault_application_profiles where application_id = $1 order by name', [applicationId]);
    return result.rows.map((row) => mapApplicationProfile(row as DbRow));
  }

  async createGroup(record: GroupRecord): Promise<void> {
    await this.pool.query(
      'insert into vault_groups (id, application_id, name, created_at) values ($1, $2, $3, $4)',
      [record.id, record.applicationId, record.name, record.createdAt],
    );
  }

  async updateGroup(id: string, applicationId: string, name: string): Promise<void> {
    await this.pool.query('update vault_groups set application_id = $1, name = $2 where id = $3', [applicationId, name, id]);
  }

  async deleteGroup(id: string): Promise<void> {
    await this.pool.query('delete from vault_groups where id = $1', [id]);
  }

  async listGroups(applicationId: string): Promise<GroupRecord[]> {
    const result = await this.pool.query('select * from vault_groups where application_id = $1 order by name', [applicationId]);
    return result.rows.map((row) => mapGroup(row as DbRow));
  }

  async listAllGroups(): Promise<GroupRecord[]> {
    const result = await this.pool.query('select * from vault_groups order by name');
    return result.rows.map((row) => mapGroup(row as DbRow));
  }

  async getGroup(id: string): Promise<GroupRecord | null> {
    const result = await this.pool.query('select * from vault_groups where id = $1', [id]);
    return result.rows[0] ? mapGroup(result.rows[0] as DbRow) : null;
  }

  async createProfile(record: ProfileRecord): Promise<void> {
    await this.pool.query(
      'insert into vault_profiles (id, group_id, name, active_version_id, created_at) values ($1, $2, $3, $4, $5)',
      [record.id, record.groupId, record.name, record.activeVersionId, record.createdAt],
    );
  }

  async updateProfile(id: string, groupId: string, name: string): Promise<void> {
    await this.pool.query('update vault_profiles set group_id = $1, name = $2 where id = $3', [groupId, name, id]);
  }

  async deleteProfile(id: string): Promise<void> {
    await this.pool.query('delete from vault_profiles where id = $1', [id]);
  }

  async getProfile(id: string): Promise<ProfileRecord | null> {
    const result = await this.pool.query('select * from vault_profiles where id = $1', [id]);
    return result.rows[0] ? mapProfile(result.rows[0] as DbRow) : null;
  }

  async listProfiles(groupId: string): Promise<ProfileRecord[]> {
    const result = await this.pool.query('select * from vault_profiles where group_id = $1 order by name', [groupId]);
    return result.rows.map((row) => mapProfile(row as DbRow));
  }

  async listAllProfiles(): Promise<ProfileRecord[]> {
    const result = await this.pool.query('select * from vault_profiles order by name');
    return result.rows.map((row) => mapProfile(row as DbRow));
  }

  async createPlugin(record: PluginCatalogRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_plugin_catalog
       (id, org, name, plugin_id, package_name, version, kind, source, config_schema, event_schema, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        record.id,
        record.org,
        record.name,
        record.pluginId,
        record.packageName,
        record.version,
        record.kind,
        record.source,
        record.configSchema,
        record.eventSchema,
        record.createdAt,
      ],
    );
  }

  async listPlugins(): Promise<PluginCatalogRecord[]> {
    const result = await this.pool.query('select * from vault_plugin_catalog order by org, name, version');
    return result.rows.map((row) => mapPlugin(row as DbRow));
  }

  async upsertDraft(record: ConfigDraftRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_config_drafts (id, profile_id, encrypted_payload, iv, auth_tag, key_version, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (profile_id) do update set
         encrypted_payload = excluded.encrypted_payload,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         key_version = excluded.key_version,
         updated_at = excluded.updated_at`,
      [record.id, record.profileId, record.encryptedPayload, record.iv, record.authTag, record.keyVersion, record.updatedAt],
    );
  }

  async getDraft(profileId: string): Promise<ConfigDraftRecord | null> {
    const result = await this.pool.query('select * from vault_config_drafts where profile_id = $1', [profileId]);
    return result.rows[0] ? mapDraft(result.rows[0] as DbRow) : null;
  }

  async createVersion(record: ConfigVersionRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_config_versions
       (id, profile_id, version, encrypted_payload, iv, auth_tag, key_version, published_at, published_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.profileId,
        record.version,
        record.encryptedPayload,
        record.iv,
        record.authTag,
        record.keyVersion,
        record.publishedAt,
        record.publishedBy,
      ],
    );
    await this.pool.query('update vault_profiles set active_version_id = $1 where id = $2', [record.id, record.profileId]);
  }

  async nextVersion(profileId: string): Promise<number> {
    const result = await this.pool.query<{ next: string }>(
      'select (coalesce(max(version), 0) + 1)::text as next from vault_config_versions where profile_id = $1',
      [profileId],
    );
    return Number(result.rows[0]?.next ?? '1');
  }

  async getVersion(id: string): Promise<ConfigVersionRecord | null> {
    const result = await this.pool.query('select * from vault_config_versions where id = $1', [id]);
    return result.rows[0] ? mapVersion(result.rows[0] as DbRow) : null;
  }

  async upsertApplicationDraft(record: ApplicationConfigDraftRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_application_config_drafts (id, application_profile_id, encrypted_payload, iv, auth_tag, key_version, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (application_profile_id) do update set
         encrypted_payload = excluded.encrypted_payload,
         iv = excluded.iv,
         auth_tag = excluded.auth_tag,
         key_version = excluded.key_version,
         updated_at = excluded.updated_at`,
      [record.id, record.applicationProfileId, record.encryptedPayload, record.iv, record.authTag, record.keyVersion, record.updatedAt],
    );
  }

  async getApplicationDraft(applicationProfileId: string): Promise<ApplicationConfigDraftRecord | null> {
    const result = await this.pool.query('select * from vault_application_config_drafts where application_profile_id = $1', [applicationProfileId]);
    return result.rows[0] ? mapApplicationDraft(result.rows[0] as DbRow) : null;
  }

  async createApplicationVersion(record: ApplicationConfigVersionRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_application_config_versions
       (id, application_profile_id, version, encrypted_payload, iv, auth_tag, key_version, published_at, published_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.applicationProfileId,
        record.version,
        record.encryptedPayload,
        record.iv,
        record.authTag,
        record.keyVersion,
        record.publishedAt,
        record.publishedBy,
      ],
    );
    await this.pool.query('update vault_application_profiles set active_version_id = $1 where id = $2', [record.id, record.applicationProfileId]);
  }

  async nextApplicationVersion(applicationProfileId: string): Promise<number> {
    const result = await this.pool.query<{ next: string }>(
      'select (coalesce(max(version), 0) + 1)::text as next from vault_application_config_versions where application_profile_id = $1',
      [applicationProfileId],
    );
    return Number(result.rows[0]?.next ?? '1');
  }

  async getApplicationVersion(id: string): Promise<ApplicationConfigVersionRecord | null> {
    const result = await this.pool.query('select * from vault_application_config_versions where id = $1', [id]);
    return result.rows[0] ? mapApplicationVersion(result.rows[0] as DbRow) : null;
  }

  async createRuntimeKey(record: RuntimeKeyRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_runtime_keys
       (id, name, secret_hash, application_id, group_id, profile_id, container_name, config_plugin_id, revoked_at, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.id,
        record.name,
        record.secretHash,
        record.applicationId,
        record.groupId,
        record.profileId,
        record.containerName,
        record.configPluginId,
        record.revokedAt,
        record.createdAt,
      ],
    );
  }

  async getRuntimeKey(id: string): Promise<RuntimeKeyRecord | null> {
    const result = await this.pool.query('select * from vault_runtime_keys where id = $1 and revoked_at is null', [id]);
    return result.rows[0] ? mapRuntimeKey(result.rows[0] as DbRow) : null;
  }

  async listRuntimeKeys(profileId?: string): Promise<RuntimeKeyRecord[]> {
    const result = profileId
      ? await this.pool.query('select * from vault_runtime_keys where profile_id = $1 order by created_at desc', [profileId])
      : await this.pool.query('select * from vault_runtime_keys order by created_at desc');
    return result.rows.map((row) => mapRuntimeKey(row as DbRow));
  }

  async revokeRuntimeKey(id: string): Promise<void> {
    await this.pool.query('update vault_runtime_keys set revoked_at = now() where id = $1', [id]);
  }

  async resolveRuntimeBinding(keyId: string): Promise<{
    key: RuntimeKeyRecord;
    application: ApplicationRecord;
    group: GroupRecord;
    profile: ProfileRecord;
  } | null> {
    const result = await this.pool.query(
      `select
         rk.*,
         row_to_json(a.*) as application,
         row_to_json(g.*) as service_group,
         row_to_json(p.*) as profile
       from vault_runtime_keys rk
       join vault_applications a on a.id = rk.application_id
       join vault_groups g on g.id = rk.group_id
       join vault_profiles p on p.id = rk.profile_id
       where rk.id = $1 and rk.revoked_at is null`,
      [keyId],
    );
    const row = result.rows[0] as DbRow | undefined;
    if (!row) return null;
    return {
      key: mapRuntimeKey(row),
      application: mapApplication(row.application as DbRow),
      group: mapGroup(row.service_group as DbRow),
      profile: mapProfile(row.profile as DbRow),
    };
  }

  async resolveProfileBinding(profileId: string): Promise<{
    application: ApplicationRecord;
    group: GroupRecord;
    profile: ProfileRecord;
  } | null> {
    const result = await this.pool.query(
      `select
         row_to_json(a.*) as application,
         row_to_json(g.*) as service_group,
         row_to_json(p.*) as profile
       from vault_profiles p
       join vault_groups g on g.id = p.group_id
       join vault_applications a on a.id = g.application_id
       where p.id = $1`,
      [profileId],
    );
    const row = result.rows[0] as DbRow | undefined;
    if (!row) return null;
    return {
      application: mapApplication(row.application as DbRow),
      group: mapGroup(row.service_group as DbRow),
      profile: mapProfile(row.profile as DbRow),
    };
  }

  async audit(record: AuditRecord): Promise<void> {
    await this.pool.query(
      'insert into vault_audit_log (id, actor, action, target, details, created_at) values ($1, $2, $3, $4, $5, $6)',
      [record.id, record.actor, record.action, record.target, record.details, record.createdAt],
    );
  }
}

type DbRow = Record<string, unknown>;

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapUser(row: DbRow): UserRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    totpSecret: String(row.totp_secret),
    passkeyRequired: Boolean(row.passkey_required),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapPasskey(row: DbRow): PasskeyRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    credentialId: String(row.credential_id),
    publicKey: row.public_key as Record<string, unknown>,
    signCount: Number(row.sign_count),
    createdAt: iso(row.created_at),
  };
}

function mapSession(row: DbRow): SessionRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    csrfToken: String(row.csrf_token),
    expiresAt: iso(row.expires_at),
  };
}

function mapApplication(row: DbRow): ApplicationRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description === null ? null : String(row.description),
    createdAt: iso(row.created_at),
  };
}

function mapGroup(row: DbRow): GroupRecord {
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    name: String(row.name),
    createdAt: iso(row.created_at),
  };
}

function mapProfile(row: DbRow): ProfileRecord {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    name: String(row.name),
    activeVersionId: row.active_version_id === null ? null : String(row.active_version_id),
    createdAt: iso(row.created_at),
  };
}

function mapApplicationProfile(row: DbRow): ApplicationProfileRecord {
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    name: String(row.name),
    activeVersionId: row.active_version_id === null ? null : String(row.active_version_id),
    createdAt: iso(row.created_at),
  };
}

function mapPlugin(row: DbRow): PluginCatalogRecord {
  return {
    id: String(row.id),
    org: String(row.org),
    name: String(row.name),
    pluginId: String(row.plugin_id),
    packageName: row.package_name === null ? null : String(row.package_name),
    version: String(row.version),
    kind: row.kind as PluginCatalogRecord['kind'],
    source: row.source as PluginCatalogRecord['source'],
    configSchema: row.config_schema === null ? null : row.config_schema as Record<string, unknown>,
    eventSchema: row.event_schema === null ? null : row.event_schema as Record<string, unknown>,
    createdAt: iso(row.created_at),
  };
}

function mapDraft(row: DbRow): ConfigDraftRecord {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    encryptedPayload: String(row.encrypted_payload),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyVersion: String(row.key_version),
    updatedAt: iso(row.updated_at),
  };
}

function mapApplicationDraft(row: DbRow): ApplicationConfigDraftRecord {
  return {
    id: String(row.id),
    applicationProfileId: String(row.application_profile_id),
    encryptedPayload: String(row.encrypted_payload),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyVersion: String(row.key_version),
    updatedAt: iso(row.updated_at),
  };
}

function mapVersion(row: DbRow): ConfigVersionRecord {
  return {
    id: String(row.id),
    profileId: String(row.profile_id),
    version: Number(row.version),
    encryptedPayload: String(row.encrypted_payload),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyVersion: String(row.key_version),
    publishedAt: iso(row.published_at),
    publishedBy: String(row.published_by),
  };
}

function mapApplicationVersion(row: DbRow): ApplicationConfigVersionRecord {
  return {
    id: String(row.id),
    applicationProfileId: String(row.application_profile_id),
    version: Number(row.version),
    encryptedPayload: String(row.encrypted_payload),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyVersion: String(row.key_version),
    publishedAt: iso(row.published_at),
    publishedBy: String(row.published_by),
  };
}

function mapRuntimeKey(row: DbRow): RuntimeKeyRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    secretHash: String(row.secret_hash),
    applicationId: String(row.application_id),
    groupId: String(row.group_id),
    profileId: String(row.profile_id),
    containerName: row.container_name === null ? null : String(row.container_name),
    configPluginId: String(row.config_plugin_id),
    revokedAt: row.revoked_at === null ? null : iso(row.revoked_at),
    createdAt: iso(row.created_at),
  };
}
