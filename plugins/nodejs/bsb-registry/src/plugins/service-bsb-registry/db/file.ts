/**
 * File-based database implementation for BSB Registry.
 *
 * Layout on disk:
 *   <dataDir>/
 *     orgs/
 *       <orgId>.json                  Organization metadata (includes members)
 *     plugins/
 *       <org>/
 *         <name>/
 *           <language>@<version>.json Full RegistryEntry for each implementation version
 *           <version>.json            Legacy entries remain readable in place
 *     users.json                      User[] - all registered users
 *     tokens.json                     AuthToken[] - all auth tokens
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'node:crypto';
import type { Observable } from '@bsb/base';
import { normalizePluginLanguage, type PluginLanguage } from '@bsb/base';
import {
  DEFAULT_PUBLICATION_LIMITS,
  type PublicationLimits,
  type RegistryDB,
  type RegistryEntryFilter,
} from './index.js';
import type {
  RegistryEntry,
  ListQuery,
  SearchQuery,
  RegistryStats,
  VersionInfo,
  Organization,
  OrgMember,
  ResourcePermission,
  User,
  AuthToken,
} from '../types.js';

type RegistryIndexRecord = {
  file: string;
  bytes: number;
  id: string;
  org: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  majorMinor: string;
  language: PluginLanguage;
  package?: RegistryEntry['package'];
  category: RegistryEntry['category'];
  tags: string[];
  visibility: RegistryEntry['visibility'];
  permissions?: RegistryEntry['permissions'];
  publishedBy: string;
  publishedAt: string;
  downloads: number;
};

type RegistryIndexFile = { version: 1; records: RegistryIndexRecord[] };

export class FileDB implements RegistryDB {
  private readonly dataDir: string;
  private readonly pluginsDir: string;
  private readonly orgsDir: string;
  private readonly usersFile: string;
  private readonly tokensFile: string;
  private readonly indexFile: string;
  private readonly publicationLimits: PublicationLimits;
  private readonly publicationWindows = new Map<string, { startedAt: number; count: number }>();
  private pluginIndex?: Promise<RegistryIndexRecord[]>;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(dataDir: string, publicationLimits: Partial<PublicationLimits> = {}) {
    this.dataDir = dataDir;
    this.pluginsDir = path.join(dataDir, 'plugins');
    this.orgsDir = path.join(dataDir, 'orgs');
    this.usersFile = path.join(dataDir, 'users.json');
    this.tokensFile = path.join(dataDir, 'tokens.json');
    this.indexFile = path.join(dataDir, 'registry-index-v1.json');
    this.publicationLimits = { ...DEFAULT_PUBLICATION_LIMITS, ...publicationLimits };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async init(obs: Observable): Promise<void> {
    const span = obs.startSpan('FileDB.init');
    try {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      fs.mkdirSync(this.orgsDir, { recursive: true });

      // Ensure users and tokens files exist
      if (!fs.existsSync(this.usersFile)) {
        this.writeJson(this.usersFile, []);
      }
      if (!fs.existsSync(this.tokensFile)) {
        this.writeJson(this.tokensFile, []);
      }

      obs.log.info('File DB initialized at {path}', { path: this.dataDir });
    } finally {
      span.end();
    }
  }

  async dispose(): Promise<void> {
    // Nothing to close -- all ops are synchronous fs calls
  }

  // ============================================================================
  // Plugin CRUD
  // ============================================================================

  async versionExists(obs: Observable, org: string, name: string, version: string, language: PluginLanguage = 'nodejs'): Promise<boolean> {
    const records = await this.indexRecords();
    const normalized = normalizePluginLanguage(language);
    return records.some(entry => entry.org === org && entry.name === name && entry.version === version && entry.language === normalized);
  }

  async insert(obs: Observable, entry: RegistryEntry): Promise<void> {
    return this.serializeMutation(() => this.insertUnlocked(obs, entry));
  }

  private async insertUnlocked(obs: Observable, entry: RegistryEntry): Promise<void> {
    const span = obs.startSpan('FileDB.insert', { pluginId: entry.id, version: entry.version });
    try {
      entry = { ...entry, language: normalizePluginLanguage(entry.language ?? 'nodejs') };
      const vPath = this.versionPath(entry.org, entry.name, entry.version, entry.language);
      const records = await this.indexRecords();
      if (records.some(existing => existing.org === entry.org && existing.name === entry.name
        && existing.version === entry.version && existing.language === entry.language)) {
        throw new Error(
          `Version ${entry.version} of ${entry.id} already exists. Published versions are immutable.`
        );
      }

      const encoded = JSON.stringify(entry, null, 2);
      const bytes = Buffer.byteLength(encoded, 'utf8');
      this.enforcePublicationLimits(records, entry, bytes);

      // Ensure plugin directory exists
      const pluginDir = this.pluginDir(entry.org, entry.name);
      fs.mkdirSync(pluginDir, { recursive: true });

      // Write version entry
      this.writeJson(vPath, entry);
      const updated = [...records, this.indexRecord(entry, vPath, bytes)];
      try {
        this.persistIndex(updated);
      } catch (error) {
        fs.rmSync(vPath, { force: true });
        throw error;
      }
      this.pluginIndex = Promise.resolve(updated);
      this.recordPublication(entry);

      obs.log.debug('Plugin inserted: {id}@{version}', { id: entry.id, version: entry.version });
    } catch (error) {
      obs.log.error('Insert failed: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  async get(obs: Observable, org: string, name: string, version?: string, filter?: RegistryEntryFilter, language?: PluginLanguage): Promise<RegistryEntry | null> {
    const span = obs.startSpan('FileDB.get', { org, name, ...(version ? { version } : {}) });
    try {
      const records = await this.filterIndexRecords(
        (await this.indexRecords()).filter(entry => entry.org === org && entry.name === name), filter);
      const selected = this.selectLanguage(records, language);
      const latest = this.latestEntry(version ? selected.filter(entry => entry.version === version) : selected);
      return latest ? this.readIndexedEntry(latest) : null;
    } finally {
      span.end();
    }
  }

  async delete(obs: Observable, org: string, name: string, version?: string, language?: PluginLanguage): Promise<void> {
    return this.serializeMutation(() => this.deleteUnlocked(obs, org, name, version, language));
  }

  private async deleteUnlocked(obs: Observable, org: string, name: string, version?: string, language?: PluginLanguage): Promise<void> {
    const span = obs.startSpan('FileDB.delete', { org, name, ...(version ? { version } : {}) });
    try {
      const records = await this.indexRecords();
      const selected = this.selectLanguage(records.filter(entry => entry.org === org && entry.name === name), language);
      const removed = new Set(selected.filter(entry => !version || entry.version === version));
      for (const entry of removed) {
        fs.rmSync(this.indexedPath(entry), { force: true });
        const legacy = safeChild(this.pluginsDir, org, name, `${entry.version}.json`);
        if (fs.existsSync(legacy) && normalizePluginLanguage(this.readJson<RegistryEntry>(legacy).language ?? 'nodejs') === entry.language) {
          fs.unlinkSync(legacy);
        }
      }
      const updated = records.filter(entry => !removed.has(entry));
      this.persistIndex(updated);
      this.pluginIndex = Promise.resolve(updated);
      this.rmdir(this.pluginDir(org, name));
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // Queries
  // ============================================================================

  async list(obs: Observable, query: ListQuery, filter?: RegistryEntryFilter): Promise<{ results: RegistryEntry[]; total: number }> {
    const span = obs.startSpan('FileDB.list');
    try {
      let results = await this.allLatestIndexRecords(filter);

      // Apply filters
      if (query.org) results = results.filter(e => e.org === query.org);
      if (query.language) results = results.filter(e => e.language === query.language);
      if (query.category) results = results.filter(e => e.category === query.category);
      if (query.packageName) results = results.filter(e => String(e.package?.[e.language] ?? '').trim() === query.packageName);

      // Sort newest first
      results.sort((a, b) => cmpDate(b.publishedAt, a.publishedAt));

      const total = results.length;
      const limit = query.limit || 50;
      const offset = query.offset || 0;

      return { results: results.slice(offset, offset + limit).map((entry) => this.readIndexedEntry(entry)), total };
    } finally {
      span.end();
    }
  }

  async search(obs: Observable, query: SearchQuery, filter?: RegistryEntryFilter): Promise<{ results: RegistryEntry[]; total: number }> {
    const span = obs.startSpan('FileDB.search', { query: query.query });
    try {
      const q = query.query.toLowerCase();
      let results = (await this.allLatestIndexRecords(filter)).filter(e => {
        return (
          e.id.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.displayName.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.tags.some(tag => tag.toLowerCase().includes(q))
        );
      });

      if (query.language) results = results.filter(e => e.language === query.language);
      if (query.category) results = results.filter(e => e.category === query.category);

      results.sort((a, b) => cmpDate(b.publishedAt, a.publishedAt));

      const total = results.length;
      const limit = query.limit || 20;
      const offset = query.offset || 0;

      return { results: results.slice(offset, offset + limit).map((entry) => this.readIndexedEntry(entry)), total };
    } finally {
      span.end();
    }
  }

  async getVersions(obs: Observable, org: string, name: string, majorMinor?: string, filter?: RegistryEntryFilter, language?: PluginLanguage): Promise<VersionInfo[]> {
    const span = obs.startSpan('FileDB.getVersions', { org, name, ...(majorMinor ? { majorMinor } : {}) });
    try {
      const entries = this.selectLanguage(await this.filterIndexRecords(
        (await this.indexRecords()).filter(entry => entry.org === org && entry.name === name), filter), language);
      let infos: VersionInfo[] = entries.map(e => ({
        version: e.version,
        language: e.language,
        majorMinor: e.majorMinor,
        publishedAt: e.publishedAt,
      }));

      if (majorMinor) {
        infos = infos.filter(v => v.majorMinor === majorMinor);
      }

      infos.sort((a, b) => cmpDate(b.publishedAt, a.publishedAt));
      return infos;
    } finally {
      span.end();
    }
  }

  async getStats(obs: Observable, filter?: RegistryEntryFilter): Promise<RegistryStats> {
    const span = obs.startSpan('FileDB.getStats');
    try {
      const latest = await this.allLatestIndexRecords(filter);
      const byLanguage: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      let totalDownloads = 0;

      for (const entry of latest) {
        byLanguage[entry.language] = (byLanguage[entry.language] || 0) + 1;
        byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
        totalDownloads += entry.downloads || 0;
      }

      return {
        totalPlugins: latest.length,
        byLanguage: JSON.stringify(byLanguage),
        byCategory: JSON.stringify(byCategory),
        totalDownloads,
      };
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // Organizations
  // ============================================================================

  async getOrganization(obs: Observable, orgId: string): Promise<Organization | null> {
    const span = obs.startSpan('FileDB.getOrganization', { orgId });
    try {
      const orgPath = this.orgPath(orgId);
      if (!fs.existsSync(orgPath)) return null;

      const org = this.readJson<Organization>(orgPath);

      // Count plugins for this org (live count)
      const orgDir = safeChild(this.pluginsDir, orgId);
      let pluginCount = 0;
      if (fs.existsSync(orgDir)) {
        pluginCount = fs.readdirSync(orgDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .length;
      }

      return { ...org, pluginCount };
    } finally {
      span.end();
    }
  }

  async createOrganization(
    obs: Observable,
    orgId: string,
    displayName: string,
    visibility: 'public' | 'private',
  ): Promise<Organization> {
    const span = obs.startSpan('FileDB.createOrganization', { orgId });
    try {
      const orgPath = this.orgPath(orgId);

      // If already exists, return it
      if (fs.existsSync(orgPath)) {
        return this.readJson<Organization>(orgPath);
      }

      const org: Organization = {
        id: orgId,
        name: orgId,
        displayName,
        pluginCount: 0,
        visibility,
        members: [],
      };
      this.writeJson(orgPath, org);
      obs.log.debug('Created organization: {orgId}', { orgId });
      return org;
    } finally {
      span.end();
    }
  }

  async claimOrganization(obs: Observable, orgId: string, userId: string): Promise<boolean> {
    const span = obs.startSpan('FileDB.claimOrganization', { orgId, userId });
    try {
      // A registry may predate organization ownership records. Never let the
      // first authenticated publisher claim a namespace that already contains
      // legacy packages; an administrator must migrate that ownership first.
      const legacyOrgDir = safeChild(this.pluginsDir, orgId);
      if (fs.existsSync(legacyOrgDir) && fs.readdirSync(legacyOrgDir, { withFileTypes: true })
        .some(entry => entry.isDirectory())) {
        return false;
      }
      const org: Organization = {
        id: orgId,
        name: orgId,
        displayName: orgId,
        pluginCount: 0,
        visibility: 'public',
        members: [{ userId, permission: 'write' }],
      };
      return this.writeJsonIfAbsent(this.orgPath(orgId), org);
    } finally {
      span.end();
    }
  }

  async setOrgMember(obs: Observable, orgId: string, userId: string, permission: ResourcePermission): Promise<void> {
    const span = obs.startSpan('FileDB.setOrgMember', { orgId, userId, permission });
    try {
      const orgPath = this.orgPath(orgId);
      if (!fs.existsSync(orgPath)) {
        throw new Error(`Organization not found: ${orgId}`);
      }

      const org = this.readJson<Organization>(orgPath);
      const members = [...(org.members || [])];

      // Update existing or add new
      const existingIdx = members.findIndex(m => m.userId === userId);
      if (existingIdx >= 0) {
        members[existingIdx] = { userId, permission };
      } else {
        members.push({ userId, permission });
      }

      const updated = { ...org, members };
      this.writeJson(orgPath, updated);
      obs.log.debug('Set org member: {orgId} / {userId} = {permission}', { orgId, userId, permission });
    } finally {
      span.end();
    }
  }

  async removeOrgMember(obs: Observable, orgId: string, userId: string): Promise<void> {
    const span = obs.startSpan('FileDB.removeOrgMember', { orgId, userId });
    try {
      const orgPath = this.orgPath(orgId);
      if (!fs.existsSync(orgPath)) return;

      const org = this.readJson<Organization>(orgPath);
      const updated = { ...org, members: (org.members || []).filter(m => m.userId !== userId) };
      this.writeJson(orgPath, updated);
      obs.log.debug('Removed org member: {orgId} / {userId}', { orgId, userId });
    } finally {
      span.end();
    }
  }

  async getOrgMembers(obs: Observable, orgId: string): Promise<OrgMember[]> {
    const span = obs.startSpan('FileDB.getOrgMembers', { orgId });
    try {
      const orgPath = this.orgPath(orgId);
      if (!fs.existsSync(orgPath)) return [];

      const org = this.readJson<Organization>(orgPath);
      return org.members || [];
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // Users
  // ============================================================================

  async getUser(obs: Observable, userId: string): Promise<User | null> {
    const span = obs.startSpan('FileDB.getUser', { userId });
    try {
      const users = this.readJson<User[]>(this.usersFile);
      return users.find(u => u.id === userId) ?? null;
    } finally {
      span.end();
    }
  }

  async getUserByEmail(obs: Observable, email: string): Promise<User | null> {
    const span = obs.startSpan('FileDB.getUserByEmail', { email });
    try {
      const users = this.readJson<User[]>(this.usersFile);
      return users.find(u => u.email === email) ?? null;
    } finally {
      span.end();
    }
  }

  async listUsers(obs: Observable): Promise<User[]> {
    const span = obs.startSpan('FileDB.listUsers');
    try {
      return this.readJson<User[]>(this.usersFile);
    } finally {
      span.end();
    }
  }

  async createUser(obs: Observable, user: User): Promise<void> {
    const span = obs.startSpan('FileDB.createUser', { userId: user.id });
    try {
      const users = this.readJson<User[]>(this.usersFile);
      if (users.some(u => u.id === user.id)) {
        throw new Error(`User already exists: ${user.id}`);
      }
      users.push(user);
      this.writeJson(this.usersFile, users);
      obs.log.debug('Created user: {id}', { id: user.id });
    } finally {
      span.end();
    }
  }

  async updateUser(
    obs: Observable,
    userId: string,
    updates: Partial<Pick<User, 'name' | 'email' | 'active' | 'permissions'>>,
  ): Promise<User | null> {
    const span = obs.startSpan('FileDB.updateUser', { userId });
    try {
      const users = this.readJson<User[]>(this.usersFile);
      const idx = users.findIndex(u => u.id === userId);
      if (idx < 0) return null;

      const existing = users[idx];
      const updated: User = {
        ...existing,
        name: updates.name ?? existing.name,
        email: updates.email ?? existing.email,
        active: updates.active ?? existing.active,
        permissions: updates.permissions ?? existing.permissions,
        updatedAt: new Date().toISOString(),
      };
      users[idx] = updated;
      this.writeJson(this.usersFile, users);
      obs.log.debug('Updated user: {id}', { id: userId });
      return updated;
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // Auth Tokens
  // ============================================================================

  async getToken(obs: Observable, tokenString: string): Promise<AuthToken | null> {
    // Stored digests are never bearer credentials, including during legacy migration.
    if (typeof tokenString !== 'string' || !tokenString || tokenString.startsWith('sha256:')) return null;
    const span = obs.startSpan('FileDB.getToken');
    try {
      const tokens = this.readJson<AuthToken[]>(this.tokensFile);
      const tokenHash = hashToken(tokenString);
      const index = tokens.findIndex((token) => token.token === tokenHash || token.token === tokenString);
      if (index < 0) return null;
      if (tokens[index].token !== tokenHash) {
        tokens[index] = { ...tokens[index], token: tokenHash };
        this.writeJson(this.tokensFile, tokens);
      }
      return { ...tokens[index], token: tokenString };
    } finally {
      span.end();
    }
  }

  async getTokensForUser(obs: Observable, userId: string): Promise<AuthToken[]> {
    const span = obs.startSpan('FileDB.getTokensForUser', { userId });
    try {
      const tokens = this.readJson<AuthToken[]>(this.tokensFile);
      return tokens.filter(t => t.userId === userId);
    } finally {
      span.end();
    }
  }

  async createToken(obs: Observable, token: AuthToken): Promise<void> {
    const span = obs.startSpan('FileDB.createToken', { userId: token.userId });
    try {
      const tokens = this.readJson<AuthToken[]>(this.tokensFile);
      tokens.push({ ...token, token: hashToken(token.token) });
      this.writeJson(this.tokensFile, tokens);
      obs.log.debug('Created token for user: {userId}', { userId: token.userId });
    } finally {
      span.end();
    }
  }

  async deleteToken(obs: Observable, tokenString: string): Promise<boolean> {
    const span = obs.startSpan('FileDB.deleteToken');
    try {
      const tokens = this.readJson<AuthToken[]>(this.tokensFile);
      const tokenHash = hashToken(tokenString);
      const idx = tokens.findIndex(t => t.token === tokenHash || t.token === tokenString);
      if (idx < 0) return false;
      tokens.splice(idx, 1);
      this.writeJson(this.tokensFile, tokens);
      return true;
    } finally {
      span.end();
    }
  }

  async deleteTokensForUser(obs: Observable, userId: string): Promise<number> {
    const span = obs.startSpan('FileDB.deleteTokensForUser', { userId });
    try {
      const tokens = this.readJson<AuthToken[]>(this.tokensFile);
      const before = tokens.length;
      const remaining = tokens.filter(t => t.userId !== userId);
      const count = before - remaining.length;
      if (count > 0) {
        this.writeJson(this.tokensFile, remaining);
      }
      return count;
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // Internal helpers
  // ============================================================================

  private pluginDir(org: string, name: string): string {
    return safeChild(this.pluginsDir, org, name);
  }

  private versionPath(org: string, name: string, version: string, language: PluginLanguage): string {
    return safeChild(this.pluginsDir, org, name, `${normalizePluginLanguage(language)}@${version}.json`);
  }

  private orgPath(org: string): string {
    return safeChild(this.orgsDir, `${org}.json`);
  }

  /** Load the compact persistent index, rebuilding it once for legacy storage. */
  private async indexRecords(): Promise<RegistryIndexRecord[]> {
    // One process owns this file database; use transactional storage for multiple writers.
    if (!this.pluginIndex) {
      const index = this.readPluginIndex();
      this.pluginIndex = index;
      void index.catch(() => {
        if (this.pluginIndex === index) this.pluginIndex = undefined;
      });
    }
    return this.pluginIndex;
  }

  private async allLatestIndexRecords(filter?: RegistryEntryFilter): Promise<RegistryIndexRecord[]> {
    const groups = new Map<string, RegistryIndexRecord[]>();
    for (const record of await this.filterIndexRecords(await this.indexRecords(), filter)) {
      const key = `${record.org}\0${record.name}\0${record.language}`;
      const group = groups.get(key) ?? [];
      group.push(record);
      groups.set(key, group);
    }
    const results: RegistryIndexRecord[] = [];
    for (const versions of groups.values()) {
      const latest = this.latestEntry(versions);
      if (latest) results.push(latest);
    }
    return results;
  }

  private async readPluginIndex(): Promise<RegistryIndexRecord[]> {
    if (fs.existsSync(this.indexFile)) {
      try {
        const persisted = this.readJson<RegistryIndexFile>(this.indexFile);
        if (persisted.version !== 1 || !Array.isArray(persisted.records)
          || persisted.records.some((record) => !this.validIndexRecord(record))) {
          throw new SyntaxError('Invalid Registry index');
        }
        return persisted.records;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }

    const ignoreRemovedDirectory = (error: NodeJS.ErrnoException): never[] => {
      if (error.code === 'ENOENT') return [];
      throw error;
    };
    const records: RegistryIndexRecord[] = [];
    const orgs = await fs.promises.readdir(this.pluginsDir, { withFileTypes: true }).catch(ignoreRemovedDirectory);
    for (const org of orgs.filter(item => item.isDirectory())) {
      const orgPath = path.join(this.pluginsDir, org.name);
      const plugins = await fs.promises.readdir(orgPath, { withFileTypes: true }).catch(ignoreRemovedDirectory);
      for (const plugin of plugins.filter(item => item.isDirectory())) {
        const directory = path.join(orgPath, plugin.name);
        for (const file of await fs.promises.readdir(directory).catch(ignoreRemovedDirectory)) {
          if (!file.endsWith('.json')) continue;
          try {
            const filePath = path.join(directory, file);
            const [raw, stat] = await Promise.all([
              fs.promises.readFile(filePath, 'utf-8'),
              fs.promises.stat(filePath),
            ]);
            const entry = JSON.parse(raw) as RegistryEntry;
            entry.language = normalizePluginLanguage(entry.language ?? 'nodejs');
            records.push(this.indexRecord(entry, filePath, stat.size));
          } catch (error) {
            if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
      }
    }
    this.persistIndex(records);
    return records;
  }

  private async filterIndexRecords(records: RegistryIndexRecord[], filter?: RegistryEntryFilter): Promise<RegistryIndexRecord[]> {
    if (!filter) return records;
    const allowed: RegistryIndexRecord[] = [];
    for (const record of records) {
      if (await filter(this.accessEntry(record))) allowed.push(record);
    }
    return allowed;
  }

  /** Apply legacy Node preference only after authorization has filtered entries. */
  private selectLanguage<T extends { language: PluginLanguage }>(entries: T[], language?: PluginLanguage): T[] {
    const languages = new Set(entries.map(entry => entry.language));
    const selected = language !== undefined ? normalizePluginLanguage(language)
      : languages.has('nodejs') ? 'nodejs' : languages.size === 1 ? [...languages][0] : undefined;
    if (selected === undefined && languages.size > 1) throw new Error('Ambiguous plugin implementation: specify language');
    return entries.filter(entry => entry.language === selected);
  }

  /** Pick the entry with the most recent publishedAt. */
  private latestEntry<T extends { publishedAt: string }>(entries: T[]): T | null {
    if (entries.length === 0) return null;
    let best = entries[0];
    for (let i = 1; i < entries.length; i++) {
      if (cmpDate(entries[i].publishedAt, best.publishedAt) > 0) {
        best = entries[i];
      }
    }
    return best;
  }

  private indexRecord(entry: RegistryEntry, filePath: string, bytes: number): RegistryIndexRecord {
    const language = normalizePluginLanguage(entry.language ?? 'nodejs');
    return {
      file: path.relative(this.dataDir, filePath).split(path.sep).join('/'),
      bytes,
      id: entry.id,
      org: entry.org,
      name: entry.name,
      displayName: entry.displayName ?? entry.name,
      description: entry.description ?? '',
      version: entry.version,
      majorMinor: entry.majorMinor ?? entry.version.split('.').slice(0, 2).join('.'),
      language,
      package: entry.package,
      category: entry.category ?? 'service',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      visibility: entry.visibility ?? 'public',
      permissions: entry.permissions,
      publishedBy: entry.publishedBy ?? 'system',
      publishedAt: entry.publishedAt,
      downloads: entry.downloads ?? 0,
    };
  }

  private accessEntry(record: RegistryIndexRecord): RegistryEntry {
    return {
      id: record.id, org: record.org, name: record.name,
      displayName: record.displayName, description: record.description,
      version: record.version, majorMinor: record.majorMinor, language: record.language,
      package: record.package, category: record.category, tags: record.tags,
      visibility: record.visibility, permissions: record.permissions,
      eventSchema: {}, eventCount: 0, emitEventCount: 0, onEventCount: 0,
      returnableEventCount: 0, broadcastEventCount: 0,
      publishedBy: record.publishedBy, publishedAt: record.publishedAt,
      updatedAt: record.publishedAt, downloads: record.downloads,
    };
  }

  private readIndexedEntry(record: RegistryIndexRecord): RegistryEntry {
    const entry = this.readJson<RegistryEntry>(this.indexedPath(record));
    const language = normalizePluginLanguage(entry.language ?? 'nodejs');
    if (entry.org !== record.org || entry.name !== record.name || entry.version !== record.version || language !== record.language) {
      throw new Error('Registry index does not match stored entry');
    }
    return { ...entry, language };
  }

  private indexedPath(record: RegistryIndexRecord): string {
    return safeChild(this.dataDir, ...record.file.split('/'));
  }

  private validIndexRecord(record: RegistryIndexRecord): boolean {
    if (!record || typeof record !== 'object' || typeof record.file !== 'string' || typeof record.bytes !== 'number'
      || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || typeof record.org !== 'string'
      || typeof record.name !== 'string' || typeof record.version !== 'string' || typeof record.language !== 'string'
      || typeof record.publishedAt !== 'string' || typeof record.publishedBy !== 'string') return false;
    try {
      this.indexedPath(record);
      return true;
    } catch {
      return false;
    }
  }

  private persistIndex(records: RegistryIndexRecord[]): void {
    this.writeJson(this.indexFile, { version: 1, records } satisfies RegistryIndexFile);
  }

  private enforcePublicationLimits(records: RegistryIndexRecord[], entry: RegistryEntry, bytes: number): void {
    const limits = this.publicationLimits;
    const publisher = entry.publishedBy || 'system';
    const packageKey = `${entry.org}\0${entry.name}\0${entry.language}`;
    const orgRecords = records.filter(record => record.org === entry.org);
    const publisherRecords = records.filter(record => record.publishedBy === publisher);
    const packageRecords = orgRecords.filter(record => `${record.org}\0${record.name}\0${record.language}` === packageKey);
    const orgPackages = new Set(orgRecords.map(record => `${record.org}\0${record.name}\0${record.language}`));
    const publisherPackages = new Set(publisherRecords.map(record => `${record.org}\0${record.name}\0${record.language}`));

    if (bytes > limits.maxEntryBytes) throw new Error(`Publication exceeds ${limits.maxEntryBytes} byte entry limit`);
    if (records.length >= limits.maxTotalVersions) throw new Error('Registry version quota exceeded');
    if (packageRecords.length >= limits.maxVersionsPerPackage) throw new Error('Package version quota exceeded');
    if (!orgPackages.has(packageKey) && orgPackages.size >= limits.maxPackagesPerOrganization) throw new Error('Organization package quota exceeded');
    if (!publisherPackages.has(packageKey) && publisherPackages.size >= limits.maxPackagesPerPublisher) throw new Error('Publisher package quota exceeded');
    if (orgRecords.reduce((total, record) => total + record.bytes, 0) + bytes > limits.maxBytesPerOrganization) {
      throw new Error('Organization storage quota exceeded');
    }
    if (publisherRecords.reduce((total, record) => total + record.bytes, 0) + bytes > limits.maxBytesPerPublisher) {
      throw new Error('Publisher storage quota exceeded');
    }
    this.checkPublicationWindow(`org:${entry.org}`);
    this.checkPublicationWindow(`publisher:${publisher}`);
  }

  private checkPublicationWindow(key: string): void {
    const now = Date.now();
    const current = this.publicationWindows.get(key);
    if (current && now - current.startedAt < 60_000 && current.count >= this.publicationLimits.maxPublicationsPerMinute) {
      throw new Error('Publication rate quota exceeded');
    }
  }

  private recordPublication(entry: RegistryEntry): void {
    const now = Date.now();
    for (const [key, value] of this.publicationWindows) {
      if (now - value.startedAt >= 60_000) this.publicationWindows.delete(key);
    }
    for (const key of [`org:${entry.org}`, `publisher:${entry.publishedBy || 'system'}`]) {
      const current = this.publicationWindows.get(key);
      this.publicationWindows.set(key, current && now - current.startedAt < 60_000
        ? { ...current, count: current.count + 1 }
        : { startedAt: now, count: 1 });
    }
  }

  private async serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Remove a directory if it exists and is empty. */
  private rmdir(dir: string): void {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      // Ignore cleanup failures
    }
  }

  private readJson<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  }

  private writeJson(filePath: string, data: unknown): void {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2), {
        encoding: 'utf-8', flag: 'wx', mode: 0o600, flush: true,
      });
      fs.renameSync(temporary, filePath);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }

  private writeJsonIfAbsent(filePath: string, data: unknown): boolean {
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2), {
        encoding: 'utf-8', flag: 'wx', mode: 0o600, flush: true,
      });
      try {
        fs.linkSync(temporary, filePath);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
        throw error;
      }
    } finally {
      fs.rmSync(temporary, { force: true });
    }
  }
}

function hashToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('base64url')}`;
}

function safeChild(root: string, ...parts: string[]): string {
  const base = path.resolve(root);
  const resolved = path.resolve(base, ...parts);
  if (!resolved.startsWith(`${base}${path.sep}`)) throw new Error('Invalid storage path');
  return resolved;
}

/** Compare two ISO date strings. Returns positive if a > b. */
function cmpDate(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}
