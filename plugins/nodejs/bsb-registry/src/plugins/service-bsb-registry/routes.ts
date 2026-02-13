import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Observable } from '@bsb/base';
import type { RegistryHttpServer } from './http-server';
import type { RegistryStorage } from './storage';
import type {
  PublishRequest,
  ListQuery,
  SearchQuery,
  RegistryEntry,
} from './types';

/**
 * Registry route handlers.
 *
 * Implements all HTTP API endpoints for the plugin registry.
 */
export class RegistryRoutes {
  private startTime: number = Date.now();
  private version: string = '1.0.0';

  constructor(
    private httpServer: RegistryHttpServer,
    private storage: RegistryStorage
  ) {}

  /**
   * Register all routes with the HTTP server
   */
  registerAll(): void {
    // Health check (public)
    this.httpServer.registerRoute('GET', '/health', this.handleHealth.bind(this), false);

    // Stats (public)
    this.httpServer.registerRoute('GET', '/api/stats', this.handleGetStats.bind(this), false);

    // List plugins (public)
    this.httpServer.registerRoute('GET', '/api/plugins', this.handleListPlugins.bind(this), false);

    // Search plugins (public)
    this.httpServer.registerRoute('GET', '/api/plugins/search', this.handleSearchPlugins.bind(this), false);

    // Get single plugin (public)
    this.httpServer.registerRoute('GET', '/api/plugins/:org/:name', this.handleGetPlugin.bind(this), false);

    // Get plugin versions (public)
    this.httpServer.registerRoute('GET', '/api/plugins/:org/:name/versions', this.handleGetVersions.bind(this), false);

    // Match version (public)
    this.httpServer.registerRoute('GET', '/api/plugins/:org/:name/match', this.handleMatchVersion.bind(this), false);

    // Get plugin schema (public)
    this.httpServer.registerRoute('GET', '/api/plugins/:org/:name/:version/schema', this.handleGetSchema.bind(this), false);

    // Get plugin documentation (public)
    this.httpServer.registerRoute('GET', '/api/plugins/:org/:name/:version/docs', this.handleGetDocs.bind(this), false);

    // Get plugin type definitions (public)
    this.httpServer.registerRoute('GET', '/api/plugins/:org/:name/:version/types/:language', this.handleGetTypes.bind(this), false);

    // Get organization (public)
    this.httpServer.registerRoute('GET', '/api/orgs/:org', this.handleGetOrganization.bind(this), false);

    // Get organization plugins (public)
    this.httpServer.registerRoute('GET', '/api/orgs/:org/plugins', this.handleGetOrgPlugins.bind(this), false);

    // Publish plugin (requires auth)
    this.httpServer.registerRoute('POST', '/api/plugins', this.handlePublishPlugin.bind(this), true);

    // Update plugin (requires auth)
    this.httpServer.registerRoute('PUT', '/api/plugins/:org/:name', this.handleUpdatePlugin.bind(this), true);

    // Delete plugin (requires auth)
    this.httpServer.registerRoute('DELETE', '/api/plugins/:org/:name', this.handleDeletePlugin.bind(this), true);
  }

  /**
   * Health check endpoint
   * GET /health
   */
  private async handleHealth(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    reply.status(200).send({
      status: 'ok',
      uptime,
      version: this.version,
    });
  }

  /**
   * Get registry statistics
   * GET /api/stats
   */
  private async handleGetStats(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const stats = await this.storage.getStats(obs);
    reply.status(200).send(stats);
  }

  /**
   * List plugins with filters and pagination
   * GET /api/plugins?org=...&language=...&category=...&limit=...&offset=...
   */
  private async handleListPlugins(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const query = request.query as any;

    const listQuery: ListQuery = {
      org: query.org,
      language: query.language,
      category: query.category,
      limit: query.limit ? parseInt(query.limit) : undefined,
      offset: query.offset ? parseInt(query.offset) : undefined,
    };

    const result = await this.storage.list(obs, listQuery);
    const page = Math.floor((listQuery.offset || 0) / (listQuery.limit || 50)) + 1;

    reply.status(200).send({
      results: result.results,
      total: result.total,
      page,
    });
  }

  /**
   * Search plugins
   * GET /api/plugins/search?q=...&language=...&category=...&limit=...
   */
  private async handleSearchPlugins(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const query = request.query as any;

    if (!query.q) {
      reply.status(400).send({
        error: 'Missing required query parameter: q',
        code: 'MISSING_QUERY',
      });
      return;
    }

    const searchQuery: SearchQuery = {
      q: query.q,
      language: query.language,
      category: query.category,
      limit: query.limit ? parseInt(query.limit) : undefined,
    };

    const result = await this.storage.search(obs, searchQuery);

    reply.status(200).send({
      results: result.results,
      total: result.total,
      query: searchQuery.q,
    });
  }

  /**
   * Get single plugin (latest version if not specified)
   * GET /api/plugins/:org/:name
   */
  private async handleGetPlugin(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const { org, name } = params;

    const plugin = await this.storage.get(obs, org, name);

    if (!plugin) {
      reply.status(404).send({
        error: `Plugin not found: ${org}/${name}`,
        code: 'PLUGIN_NOT_FOUND',
      });
      return;
    }

    reply.status(200).send(plugin);
  }

  /**
   * Get all versions of a plugin
   * GET /api/plugins/:org/:name/versions?majorMinor=...
   */
  private async handleGetVersions(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const query = request.query as any;
    const { org, name } = params;

    const versions = await this.storage.getVersions(obs, org, name, query.majorMinor);

    if (versions.length === 0) {
      reply.status(404).send({
        error: `Plugin not found: ${org}/${name}`,
        code: 'PLUGIN_NOT_FOUND',
      });
      return;
    }

    // Build latestForMajorMinor map
    const latestMap: Record<string, string> = {};
    versions.forEach(v => {
      if (!latestMap[v.majorMinor]) {
        latestMap[v.majorMinor] = v.version;
      }
    });

    reply.status(200).send({
      versions,
      latest: versions[0].version,
      latestForMajorMinor: JSON.stringify(latestMap),
    });
  }

  /**
   * Match version - find latest patch for major.minor
   * GET /api/plugins/:org/:name/match?version=1.0
   */
  private async handleMatchVersion(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const query = request.query as any;
    const { org, name } = params;

    if (!query.version) {
      reply.status(400).send({
        error: 'Missing required query parameter: version',
        code: 'MISSING_VERSION',
      });
      return;
    }

    const requested = query.version;
    const matched = await this.storage.matchVersion(obs, org, name, requested);

    if (!matched) {
      reply.status(404).send({
        error: `No version found matching ${requested} for ${org}/${name}`,
        code: 'VERSION_NOT_FOUND',
      });
      return;
    }

    // Get latest version
    const plugin = await this.storage.get(obs, org, name);
    const latest = plugin?.version || matched;

    // Check if there's a newer major.minor available
    let alert: string | undefined;
    if (plugin && plugin.majorMinor !== requested) {
      alert = `Newer major.minor available: ${plugin.majorMinor}`;
    }

    reply.status(200).send({
      requested,
      matched,
      latest,
      alert,
    });
  }

  /**
   * Get plugin schema
   * GET /api/plugins/:org/:name/:version/schema
   */
  private async handleGetSchema(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const { org, name, version } = params;

    const plugin = await this.storage.get(obs, org, name, version);

    if (!plugin) {
      reply.status(404).send({
        error: `Plugin not found: ${org}/${name}@${version}`,
        code: 'PLUGIN_NOT_FOUND',
      });
      return;
    }

    // Return schema as JSON
    const schema = JSON.parse(plugin.eventSchema);
    reply.status(200).send(schema);
  }

  /**
   * Get plugin documentation
   * GET /api/plugins/:org/:name/:version/docs?page=readme
   */
  private async handleGetDocs(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const query = request.query as any;
    const { org, name, version } = params;

    const plugin = await this.storage.get(obs, org, name, version);

    if (!plugin) {
      reply.status(404).send({
        error: `Plugin not found: ${org}/${name}@${version}`,
        code: 'PLUGIN_NOT_FOUND',
      });
      return;
    }

    if (!plugin.documentation) {
      reply.status(404).send({
        error: 'Documentation not available for this plugin',
        code: 'DOCS_NOT_FOUND',
      });
      return;
    }

    const page = query.page || 'readme';
    let content: string | undefined;

    switch (page) {
      case 'readme':
        content = plugin.documentation.readme;
        break;
      case 'changelog':
        content = plugin.documentation.changelog;
        break;
      case 'api-reference':
        content = plugin.documentation.apiReference;
        break;
      default:
        reply.status(400).send({
          error: `Invalid page: ${page}`,
          code: 'INVALID_PAGE',
        });
        return;
    }

    if (!content) {
      reply.status(404).send({
        error: `Documentation page not found: ${page}`,
        code: 'PAGE_NOT_FOUND',
      });
      return;
    }

    reply.status(200).send({
      content,
      format: 'markdown',
    });
  }

  /**
   * Get plugin type definitions
   * GET /api/plugins/:org/:name/:version/types/:language
   */
  private async handleGetTypes(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const { org, name, version, language } = params;

    const plugin = await this.storage.get(obs, org, name, version);

    if (!plugin) {
      reply.status(404).send({
        error: `Plugin not found: ${org}/${name}@${version}`,
        code: 'PLUGIN_NOT_FOUND',
      });
      return;
    }

    if (!plugin.typeDefinitions || !(plugin.typeDefinitions as any)[language]) {
      reply.status(404).send({
        error: `Type definitions not available for language: ${language}`,
        code: 'TYPES_NOT_FOUND',
      });
      return;
    }

    const typeContent = (plugin.typeDefinitions as any)[language];
    reply.status(200).type('text/plain').send(typeContent);
  }

  /**
   * Get organization details
   * GET /api/orgs/:org
   */
  private async handleGetOrganization(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const { org } = params;

    const organization = await this.storage.getOrganization(obs, org);

    if (!organization) {
      reply.status(404).send({
        error: `Organization not found: ${org}`,
        code: 'ORG_NOT_FOUND',
      });
      return;
    }

    reply.status(200).send(organization);
  }

  /**
   * Get organization plugins
   * GET /api/orgs/:org/plugins
   */
  private async handleGetOrgPlugins(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const { org } = params;

    const result = await this.storage.list(obs, { org });

    reply.status(200).send({
      results: result.results,
      total: result.total,
    });
  }

  /**
   * Publish a new plugin
   * POST /api/plugins
   */
  private async handlePublishPlugin(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const body = request.body as PublishRequest;

    // Validate required fields
    if (!body.org || !body.name || !body.version || !body.language || !body.metadata || !body.eventSchema) {
      reply.status(400).send({
        error: 'Missing required fields',
        code: 'INVALID_REQUEST',
      });
      return;
    }

    // Parse event schema to calculate event counts
    let eventSchema: any;
    try {
      eventSchema = JSON.parse(body.eventSchema);
    } catch (error) {
      reply.status(400).send({
        error: 'Invalid event schema JSON',
        code: 'INVALID_SCHEMA',
      });
      return;
    }

    // Calculate event counts
    const eventCount = this.countEvents(eventSchema);

    // Extract major.minor from version
    const majorMinor = this.extractMajorMinor(body.version);

    // Build registry entry
    const entry: RegistryEntry = {
      id: `${body.org}/${body.name}`,
      org: body.org,
      name: body.name,
      displayName: body.metadata.displayName,
      description: body.metadata.description,
      version: body.version,
      majorMinor,
      language: body.language,
      package: body.package,
      category: body.metadata.category,
      tags: body.metadata.tags,
      author: body.metadata.author,
      license: body.metadata.license,
      homepage: body.metadata.homepage,
      repository: body.metadata.repository,
      visibility: body.visibility || 'public',
      orgId: body.org, // Use org as orgId for now
      eventSchema: body.eventSchema,
      typeDefinitions: body.typeDefinitions,
      documentation: body.documentation,
      eventCount: eventCount.total,
      emitEventCount: eventCount.emit,
      onEventCount: eventCount.on,
      returnableEventCount: eventCount.returnable,
      broadcastEventCount: eventCount.broadcast,
      publishedBy: 'system', // TODO: Get from auth
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      downloads: 0,
      runtime: body.runtime,
    };

    // Store in database
    await this.storage.upsert(obs, entry);

    reply.status(200).send({
      success: true,
      pluginId: entry.id,
      version: entry.version,
      message: 'Plugin published successfully',
    });
  }

  /**
   * Update an existing plugin
   * PUT /api/plugins/:org/:name
   */
  private async handleUpdatePlugin(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    // Same as publish - upsert handles both
    await this.handlePublishPlugin(request, reply, obs);
  }

  /**
   * Delete a plugin
   * DELETE /api/plugins/:org/:name?version=...
   */
  private async handleDeletePlugin(request: FastifyRequest, reply: FastifyReply, obs: Observable): Promise<void> {
    const params = request.params as any;
    const query = request.query as any;
    const { org, name } = params;

    await this.storage.delete(obs, org, name, query.version);

    reply.status(200).send({
      success: true,
      deleted: true,
    });
  }

  /**
   * Count events in schema
   */
  private countEvents(schema: any): {
    total: number;
    emit: number;
    on: number;
    returnable: number;
    broadcast: number;
  } {
    const counts = { total: 0, emit: 0, on: 0, returnable: 0, broadcast: 0 };

    if (schema.emitFireAndForgetEvents) {
      counts.emit = Object.keys(schema.emitFireAndForgetEvents).length;
    }
    if (schema.onFireAndForgetEvents) {
      counts.on = Object.keys(schema.onFireAndForgetEvents).length;
    }
    if (schema.emitReturnableEvents) {
      counts.returnable += Object.keys(schema.emitReturnableEvents).length;
    }
    if (schema.onReturnableEvents) {
      counts.returnable += Object.keys(schema.onReturnableEvents).length;
    }
    if (schema.emitBroadcastEvents) {
      counts.broadcast += Object.keys(schema.emitBroadcastEvents).length;
    }
    if (schema.onBroadcastEvents) {
      counts.broadcast += Object.keys(schema.onBroadcastEvents).length;
    }

    counts.total = counts.emit + counts.on + counts.returnable + counts.broadcast;

    return counts;
  }

  /**
   * Extract major.minor from semantic version
   */
  private extractMajorMinor(version: string): string {
    const parts = version.split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid semantic version: ${version}`);
    }
    return `${parts[0]}.${parts[1]}`;
  }
}
