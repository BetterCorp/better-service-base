import { Pool } from 'pg';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import type {
  AuthMethodRecord,
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
  private readonly auditPool: Pool;
  private readonly auditKey: Buffer;
  private auditQueue: Promise<void> = Promise.resolve();

  constructor(databaseUrl: string, auditKey: Buffer, auditDatabaseUrl?: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.auditPool = auditDatabaseUrl ? new Pool({ connectionString: auditDatabaseUrl }) : this.pool;
    this.auditKey = auditKey;
  }

  async close(): Promise<void> {
    if (this.auditPool !== this.pool) await this.auditPool.end();
    await this.pool.end();
  }

  async init(): Promise<void> {
    await this.pool.query(`
      create table if not exists vault_users (
        id text primary key,
        email text not null unique,
        password_hash text,
        totp_secret text,
        passkey_required boolean not null default true,
        status text not null default 'active',
        setup_token_hash text,
        setup_expires_at timestamptz,
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
      alter table vault_users alter column password_hash drop not null;
      alter table vault_users alter column totp_secret drop not null;
      alter table vault_users add column if not exists status text not null default 'active';
      alter table vault_users add column if not exists setup_token_hash text;
      alter table vault_users add column if not exists setup_expires_at timestamptz;
      create table if not exists vault_auth_methods (
        id text primary key,
        user_id text not null references vault_users(id) on delete cascade,
        label text not null,
        encrypted_totp text not null,
        iv text not null,
        auth_tag text not null,
        key_version text not null,
        credential_id text unique,
        public_key jsonb,
        sign_count integer not null default 0,
        last_totp_step bigint,
        active boolean not null default false,
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
    `);
    if (this.auditPool === this.pool) {
      await this.initAudit();
      await this.anchorLegacyAudit();
    } else {
      // The runtime read path remains available; every mutation preflight still fails closed until audit recovers.
      await this.initAudit().then(() => this.anchorLegacyAudit()).catch(() => undefined);
    }
  }

  private async initAudit(): Promise<void> {
    await this.auditPool.query(`
      create table if not exists vault_audit_log (
        ordinal bigserial unique not null,
        id text primary key,
        actor text not null,
        actor_email text,
        action text not null,
        target text not null,
        details jsonb not null,
        mutation_id text,
        outcome text,
        previous_hash text,
        entry_hash text,
        created_at timestamptz not null
      );
      alter table vault_audit_log add column if not exists ordinal bigserial;
      alter table vault_audit_log add column if not exists actor_email text;
      alter table vault_audit_log add column if not exists mutation_id text;
      alter table vault_audit_log add column if not exists outcome text;
      alter table vault_audit_log add column if not exists previous_hash text;
      alter table vault_audit_log add column if not exists entry_hash text;
      create unique index if not exists vault_audit_log_ordinal_idx on vault_audit_log (ordinal);
      create or replace function vault_audit_append_only() returns trigger language plpgsql as $$
      begin
        raise exception 'vault_audit_log is append-only';
      end $$;
      drop trigger if exists vault_audit_no_update on vault_audit_log;
      create trigger vault_audit_no_update before update or delete or truncate on vault_audit_log
        for each statement execute function vault_audit_append_only();
    `);
  }

  private async anchorLegacyAudit(): Promise<void> {
    const legacy = await this.auditPool.query('select * from vault_audit_log where entry_hash is null order by ordinal');
    if (legacy.rows.length === 0) return;
    const signed = await this.auditPool.query('select 1 from vault_audit_log where entry_hash is not null limit 1');
    if (signed.rows.length > 0) return;
    await this.audit({
      id: randomUUID(),
      actor: 'system',
      actorEmail: null,
      action: 'audit.legacy.anchor',
      target: 'vault_audit_log',
      details: { entries: legacy.rows.length, digest: legacyAuditDigest(legacy.rows as DbRow[]) },
      outcome: 'success',
      createdAt: new Date().toISOString(),
    });
  }

  async countAdmins(): Promise<number> {
    const result = await this.pool.query<{ count: string }>('select count(*)::text as count from vault_users');
    return Number(result.rows[0]?.count ?? '0');
  }

  async createUser(user: UserRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_users
       (id, email, password_hash, totp_secret, passkey_required, status, setup_token_hash, setup_expires_at, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [user.id, user.email, user.passwordHash, user.totpSecret, user.passkeyRequired, user.status,
        user.setupTokenHash, user.setupExpiresAt, user.createdAt, user.updatedAt],
    );
  }

  async listUsers(): Promise<UserRecord[]> {
    const result = await this.pool.query('select * from vault_users order by email');
    return result.rows.map((row) => mapUser(row as DbRow));
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query('select * from vault_users where email = $1', [email]);
    return result.rows[0] ? mapUser(result.rows[0] as DbRow) : null;
  }

  async getUser(id: string): Promise<UserRecord | null> {
    const result = await this.pool.query('select * from vault_users where id = $1', [id]);
    return result.rows[0] ? mapUser(result.rows[0] as DbRow) : null;
  }

  async getUserBySetupTokenHash(hash: string): Promise<UserRecord | null> {
    const result = await this.pool.query(
      "select * from vault_users where setup_token_hash = $1 and setup_expires_at > now() and status = 'pending'",
      [hash],
    );
    return result.rows[0] ? mapUser(result.rows[0] as DbRow) : null;
  }

  async setPendingPassword(userId: string, passwordHash: string): Promise<void> {
    await this.pool.query('update vault_users set password_hash = $1, updated_at = now() where id = $2 and status = \'pending\'', [passwordHash, userId]);
  }

  async activateUser(userId: string): Promise<void> {
    await this.pool.query(
      "update vault_users set status = 'active', setup_token_hash = null, setup_expires_at = null, updated_at = now() where id = $1",
      [userId],
    );
  }

  async rotateUserSetupToken(userId: string, currentHash: string, replacementHash: string): Promise<boolean> {
    const result = await this.pool.query(
      "update vault_users set setup_token_hash = $1, updated_at = now() where id = $2 and setup_token_hash = $3 and setup_expires_at > now() and status = 'pending'",
      [replacementHash, userId, currentHash],
    );
    return result.rowCount === 1;
  }

  async clearLegacyTotp(userId: string): Promise<void> {
    await this.pool.query('update vault_users set totp_secret = null where id = $1', [userId]);
  }

  async createAuthMethod(method: AuthMethodRecord): Promise<void> {
    await this.pool.query(
      `insert into vault_auth_methods
       (id, user_id, label, encrypted_totp, iv, auth_tag, key_version, credential_id, public_key, sign_count, last_totp_step, active, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [method.id, method.userId, method.label, method.encryptedTotp, method.iv, method.authTag, method.keyVersion,
        method.credentialId, method.publicKey, method.signCount, method.lastTotpStep, method.active, method.createdAt],
    );
  }

  async listAuthMethods(userId: string, activeOnly = false): Promise<AuthMethodRecord[]> {
    const result = await this.pool.query(
      `select * from vault_auth_methods where user_id = $1 ${activeOnly ? 'and active = true' : ''} order by created_at`,
      [userId],
    );
    return result.rows.map((row) => mapAuthMethod(row as DbRow));
  }

  async getAuthMethod(id: string): Promise<AuthMethodRecord | null> {
    const result = await this.pool.query('select * from vault_auth_methods where id = $1', [id]);
    return result.rows[0] ? mapAuthMethod(result.rows[0] as DbRow) : null;
  }

  async getAuthMethodByCredential(credentialId: string): Promise<AuthMethodRecord | null> {
    const result = await this.pool.query('select * from vault_auth_methods where credential_id = $1 and active = true', [credentialId]);
    return result.rows[0] ? mapAuthMethod(result.rows[0] as DbRow) : null;
  }

  async completeAuthMethod(id: string, credentialId: string, publicKey: Record<string, unknown>, signCount: number): Promise<void> {
    await this.pool.query(
      'update vault_auth_methods set credential_id = $1, public_key = $2, sign_count = $3, active = true where id = $4',
      [credentialId, publicKey, signCount, id],
    );
  }

  async updateAuthMethodCounter(id: string, signCount: number): Promise<void> {
    await this.pool.query('update vault_auth_methods set sign_count = $1 where id = $2', [signCount, id]);
  }

  async useTotpStep(id: string, step: number): Promise<boolean> {
    const result = await this.pool.query(
      'update vault_auth_methods set last_totp_step = $1 where id = $2 and active = true and (last_totp_step is null or last_totp_step < $1)',
      [step, id],
    );
    return result.rowCount === 1;
  }

  async deleteAuthMethod(id: string, userId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`vault-auth-methods:${userId}`]);
      const count = await client.query<{ count: string }>(
        'select count(*)::text as count from vault_auth_methods where user_id = $1 and active = true',
        [userId],
      );
      if (Number(count.rows[0]?.count ?? 0) <= 1) {
        await client.query('rollback');
        return false;
      }
      const deleted = await client.query('delete from vault_auth_methods where id = $1 and user_id = $2 and active = true', [id, userId]);
      await client.query('commit');
      return deleted.rowCount === 1;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async suspendUser(
    userId: string,
    status: 'inactive' | 'pending',
    invitation?: { hash: string; expiresAt: string },
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("select pg_advisory_xact_lock(hashtext('vault-active-admins'))");
      const target = await client.query<{ status: UserRecord['status'] }>('select status from vault_users where id = $1', [userId]);
      if (target.rows.length === 0) {
        await client.query('rollback');
        return false;
      }
      if (target.rows[0]?.status === 'active') {
        const active = await client.query<{ count: string }>("select count(*)::text as count from vault_users where status = 'active'");
        if (Number(active.rows[0]?.count ?? 0) <= 1) {
          await client.query('rollback');
          return false;
        }
      }
      await client.query(
        `update vault_users set status = $1, setup_token_hash = $2, setup_expires_at = $3,
         password_hash = case when $1 = 'pending' then null else password_hash end, updated_at = now() where id = $4`,
        [status, invitation?.hash ?? null, invitation?.expiresAt ?? null, userId],
      );
      await client.query('delete from vault_sessions where user_id = $1', [userId]);
      if (status === 'pending') await client.query('delete from vault_auth_methods where user_id = $1', [userId]);
      else await client.query('update vault_auth_methods set active = false where user_id = $1', [userId]);
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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

  async listAllApplicationProfiles(): Promise<ApplicationProfileRecord[]> {
    const result = await this.pool.query('select * from vault_application_profiles order by application_id, name');
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

  async deletePlugin(id: string): Promise<void> {
    await this.pool.query('delete from vault_plugin_catalog where id = $1', [id]);
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
    const operation = this.auditQueue.then(async () => {
      const client = await this.auditPool.connect();
      try {
        await client.query('begin');
        await client.query("select pg_advisory_xact_lock(hashtext('vault_audit_log'))");
        const previous = await client.query<{ entry_hash: string | null }>(
          'select entry_hash from vault_audit_log order by ordinal desc limit 1',
        );
        const previousHash = previous.rows[0]?.entry_hash ?? null;
        const signed: Record<string, unknown> = {
          id: record.id,
          actor: record.actor,
          actorEmail: record.actorEmail ?? null,
          action: record.action,
          target: record.target,
          details: record.details,
          mutationId: record.mutationId ?? null,
          outcome: record.outcome ?? null,
          previousHash,
          createdAt: record.createdAt,
        };
        const entryHash = createHmac('sha256', this.auditKey).update(canonicalJson(signed)).digest('base64url');
        await client.query(
          `insert into vault_audit_log
           (id, actor, actor_email, action, target, details, mutation_id, outcome, previous_hash, entry_hash, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [record.id, record.actor, record.actorEmail ?? null, record.action, record.target, record.details,
            record.mutationId ?? null, record.outcome ?? null, previousHash, entryHash, record.createdAt],
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    });
    this.auditQueue = operation.catch(() => undefined);
    await operation;
  }

  async assertAuditWritable(): Promise<void> {
    await this.auditPool.query('select 1');
    if (!(await this.verifyAuditChain())) throw new Error('Audit log integrity verification failed');
  }

  async listAudit(limit = 100, before?: number): Promise<AuditRecord[]> {
    const result = await this.auditPool.query(
      `select * from vault_audit_log where ($1::bigint is null or ordinal < $1) order by ordinal desc limit $2`,
      [before ?? null, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows.map((row) => mapAudit(row as DbRow));
  }

  async verifyAuditChain(): Promise<boolean> {
    const result = await this.auditPool.query('select * from vault_audit_log order by ordinal');
    const legacyRows = result.rows.filter((raw) => (raw as DbRow).entry_hash === null) as DbRow[];
    if (legacyRows.length > 0) {
      const anchor = result.rows.find((raw) => String((raw as DbRow).action) === 'audit.legacy.anchor') as DbRow | undefined;
      const details = anchor?.details as Record<string, unknown> | undefined;
      if (!anchor || legacyRows.some((row) => Number(row.ordinal) >= Number(anchor.ordinal)) ||
          details?.digest !== legacyAuditDigest(legacyRows) || details.entries !== legacyRows.length) return false;
    }
    let previousHash: string | null = null;
    for (const raw of result.rows) {
      const row = raw as DbRow;
      const entryHash = row.entry_hash === null ? null : String(row.entry_hash);
      if (!entryHash) continue;
      if ((row.previous_hash === null ? null : String(row.previous_hash)) !== previousHash) return false;
      const signed = {
        id: String(row.id),
        actor: String(row.actor),
        actorEmail: row.actor_email === null ? null : String(row.actor_email),
        action: String(row.action),
        target: String(row.target),
        details: row.details as Record<string, unknown>,
        mutationId: row.mutation_id === null ? null : String(row.mutation_id),
        outcome: row.outcome === null ? null : String(row.outcome),
        previousHash,
        createdAt: iso(row.created_at),
      };
      const expected: string = createHmac('sha256', this.auditKey).update(canonicalJson(signed)).digest('base64url');
      if (expected !== entryHash) return false;
      previousHash = entryHash;
    }
    return true;
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
    passwordHash: row.password_hash === null ? null : String(row.password_hash),
    totpSecret: row.totp_secret === null ? null : String(row.totp_secret),
    passkeyRequired: Boolean(row.passkey_required),
    status: (row.status ?? 'active') as UserRecord['status'],
    setupTokenHash: row.setup_token_hash === null || row.setup_token_hash === undefined ? null : String(row.setup_token_hash),
    setupExpiresAt: row.setup_expires_at === null || row.setup_expires_at === undefined ? null : iso(row.setup_expires_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapAuthMethod(row: DbRow): AuthMethodRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label),
    encryptedTotp: String(row.encrypted_totp),
    iv: String(row.iv),
    authTag: String(row.auth_tag),
    keyVersion: String(row.key_version),
    credentialId: row.credential_id === null ? null : String(row.credential_id),
    publicKey: row.public_key === null ? null : row.public_key as Record<string, unknown>,
    signCount: Number(row.sign_count),
    lastTotpStep: row.last_totp_step === null ? null : Number(row.last_totp_step),
    active: Boolean(row.active),
    createdAt: iso(row.created_at),
  };
}

function mapAudit(row: DbRow): AuditRecord {
  return {
    id: String(row.id),
    actor: String(row.actor),
    actorEmail: row.actor_email === null ? null : String(row.actor_email),
    action: String(row.action),
    target: String(row.target),
    details: row.details as Record<string, unknown>,
    mutationId: row.mutation_id === null ? null : String(row.mutation_id),
    outcome: row.outcome as AuditRecord['outcome'],
    previousHash: row.previous_hash === null ? null : String(row.previous_hash),
    entryHash: row.entry_hash === null ? null : String(row.entry_hash),
    ordinal: Number(row.ordinal),
    createdAt: iso(row.created_at),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function legacyAuditDigest(rows: DbRow[]): string {
  return createHash('sha256').update(canonicalJson(rows.map((row) => ({
    ordinal: Number(row.ordinal),
    id: String(row.id),
    actor: String(row.actor),
    action: String(row.action),
    target: String(row.target),
    details: row.details,
    createdAt: iso(row.created_at),
  })))).digest('base64url');
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
