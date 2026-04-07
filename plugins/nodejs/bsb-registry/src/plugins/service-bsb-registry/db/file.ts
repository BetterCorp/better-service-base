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
 *           <version>.json            Full RegistryEntry for each version
 *     users.json                      User[] - all registered users
 *     tokens.json                     AuthToken[] - all auth tokens
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Observable } from '@bsb/base';
import type { RegistryDB } from './index.js';
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

export class FileDB implements RegistryDB {
  private readonly dataDir: string;
  private readonly pluginsDir: string;
  private readonly orgsDir: string;
  private readonly usersFile: string;
  private readonly tokensFile: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.pluginsDir = path.join(dataDir, 'plugins');
    this.orgsDir = path.join(dataDir, 'orgs');
    this.usersFile = path.join(dataDir, 'users.json');
    this.tokensFile = path.join(dataDir, 'tokens.json');
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

  async versionExists(obs: Observable, org: string, name: string, version: string): Promise<boolean> {
    return fs.existsSync(this.versionPath(org, name, version));
  }

  async insert(obs: Observable, entry: RegistryEntry): Promise<void> {
    const span = obs.startSpan('FileDB.insert', { pluginId: entry.id, version: entry.version });
    try {
      const vPath = this.versionPath(entry.org, entry.name, entry.version);

      if (fs.existsSync(vPath)) {
        throw new Error(
          `Version ${entry.version} of ${entry.id} already exists. Published versions are immutable.`
        );
      }

      // Ensure plugin directory exists
      const pluginDir = this.pluginDir(entry.org, entry.name);
      fs.mkdirSync(pluginDir, { recursive: true });

      // Write version entry
      this.writeJson(vPath, entry);

      obs.log.debug('Plugin inserted: {id}@{version}', { id: entry.id, version: entry.version });
    } catch (error) {
      obs.log.error('Insert failed: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  async get(obs: Observable, org: string, name: string, version?: string): Promise<RegistryEntry | null> {
    const span = obs.startSpan('FileDB.get', { org, name, ...(version ? { version } : {}) });
    try {
      if (version) {
        return this.readVersion(org, name, version);
      }
      // No version specified -- return the latest
      const entries = this.readAllVersions(org, name);
      if (entries.length === 0) return null;
      return this.latestEntry(entries);
    } finally {
      span.end();
    }
  }

  async delete(obs: Observable, org: string, name: string, version?: string): Promise<void> {
    const span = obs.startSpan('FileDB.delete', { org, name, ...(version ? { version } : {}) });
    try {
      if (version) {
        const vPath = this.versionPath(org, name, version);
        if (fs.existsSync(vPath)) {
          fs.unlinkSync(vPath);
          obs.log.debug('Deleted version {org}/{name}@{version}', { org, name, version });
        }
        // If no versions remain, remove the plugin directory
        const remaining = this.listVersionFiles(org, name);
        if (remaining.length === 0) {
          this.rmdir(this.pluginDir(org, name));
        }
      } else {
        // Delete entire plugin
        const dir = this.pluginDir(org, name);
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true });
          obs.log.debug('Deleted all versions of {org}/{name}', { org, name });
        }
      }
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // Queries
  // ============================================================================

  async list(obs: Observable, query: ListQuery): Promise<{ results: RegistryEntry[]; total: number }> {
    const span = obs.startSpan('FileDB.list');
    try {
      let results = this.allLatestEntries();

      // Apply filters
      if (query.org) results = results.filter(e => e.org === query.org);
      if (query.language) results = results.filter(e => e.language === query.language);
      if (query.category) results = results.filter(e => e.category === query.category);

      // Sort newest first
      results.sort((a, b) => cmpDate(b.publishedAt, a.publishedAt));

      const total = results.length;
      const limit = query.limit || 50;
      const offset = query.offset || 0;

      return { results: results.slice(offset, offset + limit), total };
    } finally {
      span.end();
    }
  }

  async search(obs: Observable, query: SearchQuery): Promise<{ results: RegistryEntry[]; total: number }> {
    const span = obs.startSpan('FileDB.search', { query: query.query });
    try {
      const q = query.query.toLowerCase();
      let results = this.allLatestEntries().filter(e => {
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

      return { results: results.slice(offset, offset + limit), total };
    } finally {
      span.end();
    }
  }

  async getVersions(obs: Observable, org: string, name: string, majorMinor?: string): Promise<VersionInfo[]> {
    const span = obs.startSpan('FileDB.getVersions', { org, name, ...(majorMinor ? { majorMinor } : {}) });
    try {
      const entries = this.readAllVersions(org, name);
      let infos: VersionInfo[] = entries.map(e => ({
        version: e.version,
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

  async getStats(obs: Observable): Promise<RegistryStats> {
    const span = obs.startSpan('FileDB.getStats');
    try {
      const latest = this.allLatestEntries();
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
      const orgPath = path.join(this.orgsDir, `${orgId}.json`);
      if (!fs.existsSync(orgPath)) return null;

      const org = this.readJson<Organization>(orgPath);

      // Count plugins for this org (live count)
      const orgDir = path.join(this.pluginsDir, orgId);
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
      const orgPath = path.join(this.orgsDir, `${orgId}.json`);

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

  async setOrgMember(obs: Observable, orgId: string, userId: string, permission: ResourcePermission): Promise<void> {
    const span = obs.startSpan('FileDB.setOrgMember', { orgId, userId, permission });
    try {
      const orgPath = path.join(this.orgsDir, `${orgId}.json`);
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
      const orgPath = path.join(this.orgsDir, `${orgId}.json`);
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
      const orgPath = path.join(this.orgsDir, `${orgId}.json`);
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
    const span = obs.startSpan('FileDB.getToken');
    try {
      const tokens = this.readJson<AuthToken[]>(this.tokensFile);
      return tokens.find(t => t.token === tokenString) ?? null;
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
      tokens.push(token);
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
      const idx = tokens.findIndex(t => t.token === tokenString);
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
    return path.join(this.pluginsDir, org, name);
  }

  private versionPath(org: string, name: string, version: string): string {
    return path.join(this.pluginsDir, org, name, `${version}.json`);
  }

  /** List version JSON files in a plugin directory. Returns filenames (no path). */
  private listVersionFiles(org: string, name: string): string[] {
    const dir = this.pluginDir(org, name);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  }

  /** Read a single version entry. Returns null if file does not exist. */
  private readVersion(org: string, name: string, version: string): RegistryEntry | null {
    const p = this.versionPath(org, name, version);
    if (!fs.existsSync(p)) return null;
    return this.readJson<RegistryEntry>(p);
  }

  /** Read every version entry for a plugin. */
  private readAllVersions(org: string, name: string): RegistryEntry[] {
    const files = this.listVersionFiles(org, name);
    const dir = this.pluginDir(org, name);
    const entries: RegistryEntry[] = [];
    for (const f of files) {
      try {
        entries.push(this.readJson<RegistryEntry>(path.join(dir, f)));
      } catch {
        // Skip corrupt files
      }
    }
    return entries;
  }

  /** Walk every org/plugin directory and return the latest entry of each plugin. */
  private allLatestEntries(): RegistryEntry[] {
    const results: RegistryEntry[] = [];

    if (!fs.existsSync(this.pluginsDir)) return results;

    const orgs = fs.readdirSync(this.pluginsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    for (const orgDir of orgs) {
      const orgPath = path.join(this.pluginsDir, orgDir.name);
      const plugins = fs.readdirSync(orgPath, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const pluginDir of plugins) {
        const entries = this.readAllVersions(orgDir.name, pluginDir.name);
        if (entries.length === 0) continue;
        const latest = this.latestEntry(entries);
        if (latest) results.push(latest);
      }
    }

    return results;
  }

  /** Pick the entry with the most recent publishedAt. */
  private latestEntry(entries: RegistryEntry[]): RegistryEntry | null {
    if (entries.length === 0) return null;
    let best = entries[0];
    for (let i = 1; i < entries.length; i++) {
      if (cmpDate(entries[i].publishedAt, best.publishedAt) > 0) {
        best = entries[i];
      }
    }
    return best;
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
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

/** Compare two ISO date strings. Returns positive if a > b. */
function cmpDate(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}
