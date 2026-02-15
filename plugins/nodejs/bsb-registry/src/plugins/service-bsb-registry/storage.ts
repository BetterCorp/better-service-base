import type { Observable } from '@bsb/base';
import type {
  RegistryEntry,
  ListQuery,
  SearchQuery,
  RegistryStats,
  VersionInfo,
  Organization,
} from './types';

export interface StorageConfig {
  type: 'sqlite' | 'postgres';
  path?: string; // For SQLite
  url?: string;  // For PostgreSQL
}

/**
 * In-memory storage implementation for BSB Registry.
 * This is a simplified version for initial testing.
 * For production, replace with better-sqlite3 or PostgreSQL.
 */
export class RegistryStorage {
  private plugins: Map<string, Map<string, RegistryEntry>> = new Map(); // id -> version -> entry
  private organizations: Map<string, Organization> = new Map();
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /**
   * Initialize storage
   */
  async init(obs: Observable): Promise<void> {
    const span = obs.startSpan('RegistryStorage.init');

    try {
      obs.log.info('Using in-memory storage (for testing)');
      obs.log.info('For production, replace with better-sqlite3 or PostgreSQL');
      obs.log.info('Storage initialized successfully');
    } catch (error) {
      obs.log.error('Error: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Upsert a plugin entry
   */
  async upsert(obs: Observable, entry: RegistryEntry): Promise<void> {
    const span = obs.startSpan('RegistryStorage.upsert', { pluginId: entry.id, version: entry.version });

    try {
      // Ensure organization exists
      await this.ensureOrganization(obs, entry.org, entry.orgId, entry.visibility);

      // Get or create versions map for this plugin
      if (!this.plugins.has(entry.id)) {
        this.plugins.set(entry.id, new Map());
      }

      const versions = this.plugins.get(entry.id)!;
      versions.set(entry.version, entry);

      obs.log.debug('Plugin upserted successfully');
    } catch (error) {
      obs.log.error('Error: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Ensure organization exists
   */
  private async ensureOrganization(
    obs: Observable,
    orgName: string,
    orgId: string,
    visibility: string
  ): Promise<void> {
    if (!this.organizations.has(orgId)) {
      this.organizations.set(orgId, {
        id: orgId,
        name: orgName,
        displayName: orgName,
        pluginCount: 0,
        visibility: visibility as 'public' | 'private',
      });

      obs.log.debug('Organization created');
    }
  }

  /**
   * Get a single plugin (latest version if not specified)
   */
  async get(obs: Observable, org: string, name: string, version?: string): Promise<RegistryEntry | null> {
    const span = obs.startSpan('RegistryStorage.get', { org, name, ...(version ? { version } : {}) });

    try {
      const id = `${org}/${name}`;
      const versions = this.plugins.get(id);

      if (!versions || versions.size === 0) {
        return null;
      }

      if (version) {
        return versions.get(version) || null;
      } else {
        // Get latest version (most recent publishedAt)
        let latest: RegistryEntry | null = null;
        for (const entry of versions.values()) {
          if (!latest || new Date(entry.publishedAt) > new Date(latest.publishedAt)) {
            latest = entry;
          }
        }
        return latest;
      }
    } finally {
      span.end();
    }
  }

  /**
   * Get all versions of a plugin
   */
  async getVersions(obs: Observable, org: string, name: string, majorMinor?: string): Promise<VersionInfo[]> {
    const span = obs.startSpan('RegistryStorage.getVersions', { org, name, ...(majorMinor ? { majorMinor } : {}) });

    try {
      const id = `${org}/${name}`;
      const versions = this.plugins.get(id);

      if (!versions || versions.size === 0) {
        return [];
      }

      const versionList: VersionInfo[] = [];

      for (const entry of versions.values()) {
        if (!majorMinor || entry.majorMinor === majorMinor) {
          versionList.push({
            version: entry.version,
            majorMinor: entry.majorMinor,
            publishedAt: entry.publishedAt,
          });
        }
      }

      // Sort by publishedAt descending
      versionList.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      return versionList;
    } finally {
      span.end();
    }
  }

  /**
   * Match version - find latest patch for major.minor
   */
  async matchVersion(obs: Observable, org: string, name: string, majorMinor: string): Promise<string | null> {
    const span = obs.startSpan('RegistryStorage.matchVersion', { org, name, majorMinor });

    try {
      const versions = await this.getVersions(obs, org, name, majorMinor);
      return versions.length > 0 ? versions[0].version : null;
    } finally {
      span.end();
    }
  }

  /**
   * List plugins with filters and pagination
   */
  async list(obs: Observable, query: ListQuery): Promise<{ results: RegistryEntry[]; total: number }> {
    const span = obs.startSpan('RegistryStorage.list');

    try {
      const results: RegistryEntry[] = [];

      // Get latest version of each plugin
      for (const [id, versions] of this.plugins.entries()) {
        let latest: RegistryEntry | null = null;

        for (const entry of versions.values()) {
          if (!latest || new Date(entry.publishedAt) > new Date(latest.publishedAt)) {
            latest = entry;
          }
        }

        if (latest) {
          // Apply filters
          if (query.org && latest.org !== query.org) continue;
          if (query.language && latest.language !== query.language) continue;
          if (query.category && latest.category !== query.category) continue;

          results.push(latest);
        }
      }

      // Sort by publishedAt descending
      results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      const total = results.length;

      // Apply pagination
      const limit = query.limit || 50;
      const offset = query.offset || 0;
      const paginatedResults = results.slice(offset, offset + limit);

      return { results: paginatedResults, total };
    } finally {
      span.end();
    }
  }

  /**
   * Search plugins using full-text search (simple implementation)
   */
  async search(obs: Observable, query: SearchQuery): Promise<{ results: RegistryEntry[]; total: number }> {
    const span = obs.startSpan('RegistryStorage.search', { query: query.query });

    try {
      const results: RegistryEntry[] = [];
      const searchLower = query.query.toLowerCase();

      // Get latest version of each plugin
      for (const [id, versions] of this.plugins.entries()) {
        let latest: RegistryEntry | null = null;

        for (const entry of versions.values()) {
          if (!latest || new Date(entry.publishedAt) > new Date(latest.publishedAt)) {
            latest = entry;
          }
        }

        if (latest) {
          // Simple text search
          const matchesSearch =
            latest.id.toLowerCase().includes(searchLower) ||
            latest.name.toLowerCase().includes(searchLower) ||
            latest.displayName.toLowerCase().includes(searchLower) ||
            latest.description.toLowerCase().includes(searchLower) ||
            latest.tags.some(tag => tag.toLowerCase().includes(searchLower));

          if (!matchesSearch) continue;

          // Apply filters
          if (query.language && latest.language !== query.language) continue;
          if (query.category && latest.category !== query.category) continue;

          results.push(latest);
        }
      }

      // Sort by publishedAt descending
      results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      // Apply limit
      const limit = query.limit || 20;
      const limitedResults = results.slice(0, limit);

      return { results: limitedResults, total: results.length };
    } finally {
      span.end();
    }
  }

  /**
   * Get registry statistics
   */
  async getStats(obs: Observable): Promise<RegistryStats> {
    const span = obs.startSpan('RegistryStorage.getStats');

    try {
      const byLanguage: Record<string, number> = {};
      const byCategory: Record<string, number> = {};
      let totalDownloads = 0;

      // Get latest version of each plugin
      for (const [id, versions] of this.plugins.entries()) {
        let latest: RegistryEntry | null = null;

        for (const entry of versions.values()) {
          if (!latest || new Date(entry.publishedAt) > new Date(latest.publishedAt)) {
            latest = entry;
          }
        }

        if (latest) {
          byLanguage[latest.language] = (byLanguage[latest.language] || 0) + 1;
          byCategory[latest.category] = (byCategory[latest.category] || 0) + 1;
          totalDownloads += latest.downloads || 0;
        }
      }

      return {
        totalPlugins: this.plugins.size,
        byLanguage: JSON.stringify(byLanguage),
        byCategory: JSON.stringify(byCategory),
        totalDownloads,
      };
    } finally {
      span.end();
    }
  }

  /**
   * Delete a plugin (specific version or all versions)
   */
  async delete(obs: Observable, org: string, name: string, version?: string): Promise<void> {
    const span = obs.startSpan('RegistryStorage.delete', { org, name, ...(version ? { version } : {}) });

    try {
      const id = `${org}/${name}`;
      const versions = this.plugins.get(id);

      if (!versions) {
        return;
      }

      if (version) {
        versions.delete(version);
        obs.log.debug('Plugin version deleted: {id}@{version}', { id, version });

        // Remove plugin entry if no versions left
        if (versions.size === 0) {
          this.plugins.delete(id);
        }
      } else {
        this.plugins.delete(id);
        obs.log.debug('All plugin versions deleted: {id}', { id });
      }
    } finally {
      span.end();
    }
  }

  /**
   * Get organization details
   */
  async getOrganization(obs: Observable, orgId: string): Promise<Organization | null> {
    const span = obs.startSpan('RegistryStorage.getOrganization', { orgId });

    try {
      const org = this.organizations.get(orgId);

      if (!org) {
        return null;
      }

      // Count plugins for this org
      let pluginCount = 0;
      for (const [id, versions] of this.plugins.entries()) {
        if (id.startsWith(`${orgId}/`)) {
          pluginCount++;
        }
      }

      return {
        ...org,
        pluginCount,
      };
    } finally {
      span.end();
    }
  }

  /**
   * Close and cleanup (no-op for in-memory)
   */
  async dispose(): Promise<void> {
    // No-op for in-memory storage
  }
}
