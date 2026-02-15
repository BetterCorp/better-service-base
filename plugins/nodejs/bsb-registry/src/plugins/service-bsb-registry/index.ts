import { z } from 'zod';
import {
  BSBService,
  BSBServiceConstructor,
  Observable,
  createEventSchemas,
  createConfigSchema,
  createReturnableEvent,
  bsb,
  optional,
} from '@bsb/base';
import { RegistryStorage, StorageConfig } from './storage';
import { AuthManager } from './auth';
import * as Types from './types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration schema for BSB Registry (Core - Event-Driven).
 */
export const RegistryConfigSchema = z.object({
  database: z.object({
    type: z.enum(['sqlite', 'postgres']).default('sqlite'),
    path: z.string().default('./.temp/registry.db'), // For SQLite
    url: z.string().optional(), // For PostgreSQL
  }),
  auth: z.object({
    tokensFile: z.string().default('./.temp/api-tokens.json'),
    requireAuth: z.boolean().default(true),
  }),
});

export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;

/**
 * Event schemas for BSB Registry Core.
 * All operations are event-driven for maximum flexibility.
 */
export const EventSchemas = createEventSchemas({
  onReturnableEvents: {
    // Plugin Operations
    'registry.plugin.publish': createReturnableEvent(
      Types.PublishRequestSchema,
      Types.PublishResponseSchema,
      'Publish a new plugin or version'
    ),
    'registry.plugin.get': createReturnableEvent(
      bsb.object({
        org: bsb.string({ description: 'Organization name' }),
        name: bsb.string({ description: 'Plugin name' }),
        version: optional(bsb.string({ description: 'Version (defaults to latest)' })),
      }),
      Types.RegistryEntrySchema,
      'Get plugin details by org/name'
    ),
    'registry.plugin.list': createReturnableEvent(
      Types.ListQuerySchema,
      Types.ListResultsSchema,
      'List plugins with filtering'
    ),
    'registry.plugin.search': createReturnableEvent(
      Types.SearchQuerySchema,
      Types.SearchResultsSchema,
      'Search plugins by query'
    ),
    'registry.plugin.delete': createReturnableEvent(
      bsb.object({
        org: bsb.string({ description: 'Organization name' }),
        name: bsb.string({ description: 'Plugin name' }),
        version: optional(bsb.string({ description: 'Version (or all if not provided)' })),
      }),
      bsb.object({
        success: bsb.boolean('Success status'),
        deleted: bsb.int32({ min: 0, description: 'Number of versions deleted' }),
      }),
      'Delete a plugin or specific version'
    ),
    'registry.plugin.versions': createReturnableEvent(
      bsb.object({
        org: bsb.string({ description: 'Organization name' }),
        name: bsb.string({ description: 'Plugin name' }),
        majorMinor: optional(bsb.string({ description: 'Filter by major.minor' })),
      }),
      Types.VersionListSchema,
      'Get all versions of a plugin'
    ),

    // Stats
    'registry.stats.get': createReturnableEvent(
      bsb.object({}),
      Types.RegistryStatsSchema,
      'Get registry statistics'
    ),

    // Auth Operations
    'registry.auth.login': createReturnableEvent(
      bsb.object({
        username: bsb.string({ description: 'Username' }),
        password: bsb.string({ description: 'Encrypted password' }),
      }),
      bsb.object({
        success: bsb.boolean('Login success'),
        token: optional(bsb.string({ description: 'Auth token' })),
        expiresAt: optional(bsb.datetime('Expiration')),
        message: optional(bsb.string({ description: 'Error message' })),
      }),
      'Authenticate user and get token'
    ),
    'registry.auth.verify': createReturnableEvent(
      bsb.object({
        token: bsb.string({ description: 'Token to verify' }),
      }),
      bsb.object({
        valid: bsb.boolean('Token validity'),
        userId: optional(bsb.string({ description: 'User ID' })),
        permissions: optional(bsb.array(bsb.string())),
      }),
      'Verify authentication token'
    ),
  },
});

/**
 * Config for BSB Registry Core.
 */
export const Config = createConfigSchema(
  {
    name: 'BSB Registry Core',
    description: 'Event-driven plugin registry core for multi-language BSB plugin discovery',
    tags: ['registry', 'plugin', 'marketplace', 'discovery', 'publishing', 'events'],
  },
  RegistryConfigSchema
);

// ============================================================================
// Plugin
// ============================================================================

/**
 * BSB Registry Core Plugin (Event-Driven)
 *
 * A language-agnostic plugin registry for the BSB framework, similar to npm registry
 * but supporting plugins from multiple languages (Node.js, C#, Go, Java, Python).
 *
 * This is the CORE registry - it only handles events. For HTTP access, use:
 * - service-bsb-registry-api (HTTP REST API gateway)
 * - service-bsb-registry-ui (Web interface)
 *
 * Features:
 * - Event-driven architecture (works locally or distributed)
 * - SQLite/PostgreSQL storage
 * - Organization-based naming (org/plugin-name)
 * - Version matching (major.minor with patch interchangeability)
 * - Authentication with encrypted passwords
 * - Full-text search
 * - Documentation storage
 *
 * Events:
 * - registry.plugin.publish - Publish a plugin
 * - registry.plugin.get - Get plugin details
 * - registry.plugin.list - List plugins
 * - registry.plugin.search - Search plugins
 * - registry.plugin.delete - Delete plugin
 * - registry.plugin.versions - Get versions
 * - registry.stats.get - Get statistics
 * - registry.auth.login - Login
 * - registry.auth.verify - Verify token
 */
export class Plugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  // v9: Required static properties
  static Config = Config;
  static EventSchemas = EventSchemas;

  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  private storage: RegistryStorage;
  private authManager: AuthManager;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas,
    });

    // Create storage client
    const storageConfig: StorageConfig = {
      type: this.config.database.type,
      path: this.config.database.path,
      url: this.config.database.url,
    };
    this.storage = new RegistryStorage(storageConfig);

    // Create auth manager
    this.authManager = new AuthManager(this.config.auth);
  }

  /**
   * Initialize resources and register event handlers.
   */
  async init(obs: Observable): Promise<void> {
    obs.log.info('Initializing BSB Registry Core');

    // Initialize storage (database migrations, etc.)
    await this.storage.init(obs);

    // Initialize authentication
    await this.authManager.init(obs);

    // Register event handlers
    await this.registerEventHandlers(obs);

    obs.log.info('BSB Registry Core initialized - event handlers registered');
  }

  /**
   * Run phase - nothing to start (event-driven).
   */
  async run(obs: Observable): Promise<void> {
    obs.log.info('BSB Registry Core ready - listening for events');
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    if (this.storage) {
      this.storage.dispose();
    }
  }

  /**
   * Register all event handlers.
   */
  private async registerEventHandlers(obs: Observable): Promise<void> {
    // Plugin Operations
    await this.events.onReturnableEvent('registry.plugin.publish', obs, async (trace, data) => {
      return await this.handlePluginPublish(trace, data);
    });

    await this.events.onReturnableEvent('registry.plugin.get', obs, async (trace, data) => {
      return await this.handlePluginGet(trace, data);
    });

    await this.events.onReturnableEvent('registry.plugin.list', obs, async (trace, data) => {
      return await this.handlePluginList(trace, data);
    });

    await this.events.onReturnableEvent('registry.plugin.search', obs, async (trace, data) => {
      return await this.handlePluginSearch(trace, data);
    });

    await this.events.onReturnableEvent('registry.plugin.delete', obs, async (trace, data) => {
      return await this.handlePluginDelete(trace, data);
    });

    await this.events.onReturnableEvent('registry.plugin.versions', obs, async (trace, data) => {
      return await this.handlePluginVersions(trace, data);
    });

    // Stats
    await this.events.onReturnableEvent('registry.stats.get', obs, async (trace, data) => {
      return await this.handleStatsGet(trace);
    });

    // Auth
    await this.events.onReturnableEvent('registry.auth.login', obs, async (trace, data) => {
      return await this.handleAuthLogin(trace, data);
    });

    await this.events.onReturnableEvent('registry.auth.verify', obs, async (trace, data) => {
      return await this.handleAuthVerify(trace, data);
    });

    obs.log.debug('Registered {count} event handlers', { count: 9 });
  }

  // ============================================================================
  // Event Handlers (Business Logic with Full Tracing)
  // ============================================================================

  /**
   * Handle plugin publish request
   */
  private async handlePluginPublish(trace: Observable, data: Types.PublishRequest): Promise<Types.PublishResponse> {
    const span = trace.startSpan('registry.plugin.publish', {
      org: data.org,
      name: data.name,
      version: data.version,
      language: data.language,
    });

    try {
      trace.log.debug('Publishing plugin {org}/{name} v{version}', {
        org: data.org,
        name: data.name,
        version: data.version,
      });

      // Validate authentication if required
      if (this.config.auth.requireAuth) {
        const authSpan = trace.startSpan('auth.check');
        // TODO: Check auth token from trace context
        trace.log.debug('Auth check skipped (token from trace context)');
        authSpan.end();
      }

      // Build registry entry
      const buildSpan = trace.startSpan('build.entry');
      const pluginId = `${data.org}/${data.name}`;
      const majorMinor = data.version.split('.').slice(0, 2).join('.');

      const entry: Types.RegistryEntry = {
        id: pluginId,
        org: data.org,
        name: data.name,
        displayName: data.metadata.displayName,
        description: data.metadata.description,
        version: data.version,
        majorMinor: majorMinor,
        language: data.language,
        category: data.metadata.category,
        tags: data.metadata.tags,
        author: data.metadata.author,
        license: data.metadata.license,
        homepage: data.metadata.homepage,
        repository: data.metadata.repository,
        visibility: data.visibility || 'public',
        orgId: data.org,
        eventSchema: data.eventSchema,
        typeDefinitions: data.typeDefinitions,
        documentation: data.documentation,
        package: data.package,
        runtime: data.runtime,
        eventCount: 0, // TODO: Parse from eventSchema
        emitEventCount: 0,
        onEventCount: 0,
        returnableEventCount: 0,
        broadcastEventCount: 0,
        publishedBy: 'system', // TODO: Get from auth token
        publishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        downloads: 0,
      };
      buildSpan.end();

      // Store in database
      const upsertSpan = trace.startSpan('storage.upsert');
      await this.storage.upsert(trace, entry);
      upsertSpan.end();

      trace.log.info('Plugin published successfully: {id}@{version}', {
        id: pluginId,
        version: data.version,
      });

      return {
        success: true,
        pluginId,
        version: data.version,
        message: 'Plugin published successfully',
      };
    } catch (error) {
      trace.log.error('Failed to publish plugin: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle get plugin request
   */
  private async handlePluginGet(trace: Observable, data: any): Promise<Types.RegistryEntry> {
    const span = trace.startSpan('registry.plugin.get', { org: data.org, name: data.name });

    try {
      trace.log.debug('Getting plugin {org}/{name}', { org: data.org, name: data.name });

      const getSpan = trace.startSpan('storage.get');
      const plugin = await this.storage.get(trace, data.org, data.name, data.version);
      getSpan.end();

      if (!plugin) {
        trace.log.warn('Plugin not found: {org}/{name}', { org: data.org, name: data.name });
        throw new Error(`Plugin not found: ${data.org}/${data.name}`);
      }

      // Add plugin metadata to span for dashboarding
      span.setAttributes({
        version: plugin.version,
        category: plugin.category,
        language: plugin.language,
      });

      trace.log.debug('Plugin retrieved: {id}@{version}', { id: plugin.id, version: plugin.version });
      return plugin;
    } catch (error) {
      trace.log.error('Failed to get plugin: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle list plugins request
   */
  private async handlePluginList(trace: Observable, data: Types.ListQuery): Promise<Types.ListResults> {
    const span = trace.startSpan('registry.plugin.list', {
      ...(data.org && { org: data.org }),
      ...(data.language && { language: data.language }),
      ...(data.category && { category: data.category }),
      ...(data.limit && { limit: data.limit }),
      ...(data.offset && { offset: data.offset }),
    });

    try {
      trace.log.debug('Listing plugins');

      const listSpan = trace.startSpan('storage.list');
      const result = await this.storage.list(trace, data);
      listSpan.end();

      const page = Math.floor((data.offset || 0) / (data.limit || 50)) + 1;

      // Add result metrics to span for dashboarding
      span.setAttributes({
        resultCount: result.total,
        returnedCount: result.results.length,
      });

      trace.log.debug('Listed {count} plugins (total: {total})', {
        count: result.results.length,
        total: result.total,
      });

      return {
        results: result.results,
        total: result.total,
        page,
      };
    } catch (error) {
      trace.log.error('Failed to list plugins: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle search plugins request
   */
  private async handlePluginSearch(trace: Observable, data: Types.SearchQuery): Promise<Types.SearchResults> {
    const span = trace.startSpan('registry.plugin.search', {
      query: data.query,
      ...(data.category && { category: data.category }),
      ...(data.language && { language: data.language }),
      limit: data.limit || 20,
      ...(data.offset && { offset: data.offset }),
    });

    try {
      trace.log.debug('Searching plugins: {query}', { query: data.query });

      const searchSpan = trace.startSpan('storage.search');
      const result = await this.storage.search(trace, data);
      searchSpan.end();

      // Add result count to span for dashboarding
      span.setAttributes({
        resultCount: result.total,
      });

      trace.log.info('Found {count} plugins matching "{query}"', {
        count: result.total,
        query: data.query,
      });

      return {
        results: result.results,
        total: result.total,
        query: data.query,
      };
    } catch (error) {
      trace.log.error('Failed to search plugins: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle delete plugin request
   */
  private async handlePluginDelete(trace: Observable, data: any): Promise<{ success: boolean; deleted: number }> {
    const span = trace.startSpan('registry.plugin.delete', { org: data.org, name: data.name });

    try {
      trace.log.debug('Deleting plugin {org}/{name}', { org: data.org, name: data.name });

      // Check authentication
      if (this.config.auth.requireAuth) {
        const authSpan = trace.startSpan('auth.check');
        // TODO: Verify token has delete permissions
        trace.log.debug('Auth check for delete operation');
        authSpan.end();
      }

      // Get current versions count
      const countSpan = trace.startSpan('storage.getVersions');
      const versions = await this.storage.getVersions(trace, data.org, data.name);
      const versionCount = data.version
        ? versions.filter(v => v.version === data.version).length
        : versions.length;
      countSpan.end();

      // Perform deletion
      const deleteSpan = trace.startSpan('storage.delete');
      await this.storage.delete(trace, data.org, data.name, data.version);
      deleteSpan.end();

      trace.log.info('Deleted {count} version(s) of {org}/{name}', {
        count: versionCount,
        org: data.org,
        name: data.name,
      });

      return {
        success: true,
        deleted: versionCount,
      };
    } catch (error) {
      trace.log.error('Failed to delete plugin: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle get plugin versions request
   */
  private async handlePluginVersions(trace: Observable, data: any): Promise<Types.VersionList> {
    const span = trace.startSpan('registry.plugin.versions', { org: data.org, name: data.name });

    try {
      trace.log.debug('Getting versions for {org}/{name}', { org: data.org, name: data.name });

      const versionsSpan = trace.startSpan('storage.getVersions');
      const versions = await this.storage.getVersions(trace, data.org, data.name, data.majorMinor);
      versionsSpan.end();

      const latest = versions.length > 0 ? versions[0].version : '0.0.0';

      // Build major.minor -> latest patch map
      const latestMap: Record<string, string> = {};
      for (const v of versions) {
        if (!latestMap[v.majorMinor] || v.version > latestMap[v.majorMinor]) {
          latestMap[v.majorMinor] = v.version;
        }
      }

      trace.log.debug('Found {count} versions for {org}/{name}', {
        count: versions.length,
        org: data.org,
        name: data.name,
      });

      return {
        versions,
        latest,
        latestForMajorMinor: JSON.stringify(latestMap),
      };
    } catch (error) {
      trace.log.error('Failed to get versions: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle get stats request
   */
  private async handleStatsGet(trace: Observable): Promise<Types.RegistryStats> {
    const span = trace.startSpan('registry.stats.get');

    try {
      trace.log.debug('Getting registry statistics');

      const statsSpan = trace.startSpan('storage.getStats');
      const stats = await this.storage.getStats(trace);
      statsSpan.end();

      trace.log.debug('Registry stats: {totalPlugins} plugins', { totalPlugins: stats.totalPlugins });

      return stats;
    } catch (error) {
      trace.log.error('Failed to get stats: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Handle login request
   */
  private async handleAuthLogin(trace: Observable, data: any): Promise<any> {
    const span = trace.startSpan('registry.auth.login', { username: data.username });

    try {
      trace.log.info('Auth login attempt for user {username}', { username: data.username });

      // TODO: Implement proper user/password authentication with encrypted password storage
      // For now, login is not implemented - use API tokens instead
      trace.log.warn('Login not implemented - use API tokens for authentication');

      return {
        success: false,
        message: 'User/password authentication not implemented. Use API tokens instead.',
      };
    } catch (error) {
      trace.log.error('Login error: {error}', { error: (error as Error).message });
      return {
        success: false,
        message: 'Authentication error',
      };
    } finally {
      span.end();
    }
  }

  /**
   * Handle verify token request
   */
  private async handleAuthVerify(trace: Observable, data: any): Promise<any> {
    const span = trace.startSpan('registry.auth.verify');

    try {
      trace.log.debug('Verifying auth token');

      const verifySpan = trace.startSpan('auth.manager.verify');
      const isValid = this.authManager.isValidToken(data.token);
      verifySpan.end();

      if (isValid) {
        trace.log.debug('Token is valid');
        return {
          valid: true,
        };
      } else {
        trace.log.warn('Token verification failed');
        return {
          valid: false,
        };
      }
    } catch (error) {
      trace.log.error('Token verification error: {error}', { error: (error as Error).message });
      return {
        valid: false,
      };
    } finally {
      span.end();
    }
  }
}

// Export plugin factory
export default Plugin;
