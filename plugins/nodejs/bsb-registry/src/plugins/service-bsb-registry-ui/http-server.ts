/**
 * Registry UI HTTP Server (Event-Driven with Handlebars)
 *
 * Server-side rendered HTML using Handlebars templates.
 * Communicates with registry core via typed BsbRegistryClient.
 */

import * as path from 'path';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyView from '@fastify/view';
import handlebars from 'handlebars';
import { Observable } from '@bsb/base';
import type { Plugin } from './index';
import type { BsbRegistryClient } from '../../.bsb/clients/service-bsb-registry';

interface PaginationQuery {
  page?: string;
  category?: string;
  language?: string;
}

interface SearchQuery extends PaginationQuery {
  query?: string;
}

interface PluginDetailParams {
  org: string;
  name: string;
}

export class RegistryUIServer {
  private app: FastifyInstance;
  public readonly port: number;
  public readonly host: string;
  private readonly pageSize: number;
  private registryClient!: BsbRegistryClient;
  private createTrace!: Plugin['createTrace'];

  constructor(
    port: number,
    host: string,
    pageSize: number
  ) {
    this.port = port;
    this.host = host;
    this.pageSize = pageSize;

    this.app = Fastify({
      logger: false,
      disableRequestLogging: true,
    });
  }

  private registerHandlebarsHelpers(): void {
    handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    handlebars.registerHelper('gt', (a: number, b: number) => a > b);
    handlebars.registerHelper('lt', (a: number, b: number) => a < b);
    handlebars.registerHelper('add', (a: number, b: number) => a + b);
    handlebars.registerHelper('subtract', (a: number, b: number) => a - b);

    handlebars.registerHelper('range', (start: number, end: number, max: number) => {
      const actualStart = Math.max(1, start);
      const actualEnd = Math.min(max, end);
      const result: number[] = [];
      for (let i = actualStart; i <= actualEnd; i++) {
        result.push(i);
      }
      return result;
    });
  }

  async init(obs: Observable, plugin: Plugin): Promise<void> {
    const span = obs.startSpan('RegistryUIServer.init');

    try {
      // Bind plugin context to this server instance
      this.registryClient = plugin.registryClient;
      this.createTrace = plugin.createTrace.bind(plugin);

      // Register Handlebars helpers
      const helpersSpan = obs.startSpan('register.helpers');
      this.registerHandlebarsHelpers();
      helpersSpan.end();

      // Register Handlebars view engine
      const viewSpan = obs.startSpan('register.handlebars');
      const templatesPath = path.join(plugin.pluginCwd, 'templates');
      obs.log.debug('Registering Handlebars templates from {path}', { path: templatesPath });

      await this.app.register(fastifyView, {
        engine: {
          handlebars,
        },
        root: templatesPath,
        layout: 'layouts/main.hbs',
        options: {
          partials: {
            'plugin-card': 'partials/plugin-card.hbs',
            'pagination': 'partials/pagination.hbs',
            'search-form': 'partials/search-form.hbs',
          },
        },
      });
      viewSpan.end();

      // Register routes
      const routesSpan = obs.startSpan('register.routes');
      this.registerRoutes();
      routesSpan.end();

      obs.log.info('Registry UI server initialized successfully');
    } catch (error) {
      obs.log.error('Failed to initialize Registry UI server: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  private registerRoutes(): void {
    // Homepage - browse all plugins
    this.app.get('/', async (request, reply) => {
      return this.handleHome(request, reply);
    });

    // Browse plugins with pagination
    this.app.get('/plugins', async (request, reply) => {
      return this.handlePluginsList(request, reply);
    });

    // Plugin details page
    this.app.get('/plugins/:org/:name', async (request, reply) => {
      return this.handlePluginDetail(request, reply);
    });

    // Search plugins
    this.app.get('/search', async (request, reply) => {
      return this.handleSearch(request, reply);
    });

    // Health check
    this.app.get('/health', async (request, reply) => {
      return { status: 'ok' };
    });
  }

  private async handleHome(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const trace = this.createTrace('ui.home', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
    });
    const span = trace.startSpan('render.home');

    try {
      // Fetch stats from registry
      const statsSpan = trace.startSpan('events.registry.stats.get');
      const stats = await this.registryClient.registryStatsGet(trace, {});
      statsSpan.end();

      // Fetch recent plugins
      const listSpan = trace.startSpan('events.registry.plugin.list');
      const listResult = await this.registryClient.registryPluginList(trace, { limit: 12, offset: 0 });
      listSpan.end();

      // Content negotiation: JSON or HTML
      if (request.headers.accept?.includes('application/json')) {
        trace.log.debug('Returned home data as JSON');
        reply.send({
          stats,
          plugins: listResult.results,
          total: listResult.total,
        });
      } else {
        const renderSpan = trace.startSpan('handlebars.render');
        await reply.view('pages/home.hbs', {
          title: 'BSB Plugin Registry',
          stats,
          plugins: listResult.results,
          pageSize: this.pageSize,
        });
        renderSpan.end();
        trace.log.debug('Rendered home page as HTML');
      }
    } catch (error) {
      trace.log.error('Failed to render home page: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    } finally {
      span.end();
    }
  }

  private async handlePluginsList(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const trace = this.createTrace('ui.plugins.list', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
    });
    const span = trace.startSpan('render.plugins-list');

    try {
      const query = request.query as PaginationQuery;
      const page = parseInt(query.page || '1', 10);
      const offset = (page - 1) * this.pageSize;

      const listSpan = trace.startSpan('events.registry.plugin.list');
      const listResult = await this.registryClient.registryPluginList(
        trace,
        {
          limit: this.pageSize,
          offset,
          category: query.category as "service" | "observable" | "events" | "config" | "other" | undefined,
          language: query.language as "nodejs" | "csharp" | "go" | "java" | "python" | undefined,
        }
      );
      listSpan.end();

      const totalPages = Math.ceil(listResult.total / this.pageSize);

      // Content negotiation: JSON or HTML
      if (request.headers.accept?.includes('application/json')) {
        trace.log.debug('Returned plugins list as JSON');
        reply.send({
          plugins: listResult.results,
          total: listResult.total,
          page,
          totalPages,
          pageSize: this.pageSize,
          filters: {
            category: query.category,
            language: query.language,
          },
        });
      } else {
        const renderSpan = trace.startSpan('handlebars.render');
        await reply.view('pages/plugins.hbs', {
          title: 'Browse Plugins',
          plugins: listResult.results,
          pagination: {
            currentPage: page,
            totalPages,
            total: listResult.total,
            pageSize: this.pageSize,
          },
          filters: {
            category: query.category,
            language: query.language,
          },
        });
        renderSpan.end();
        trace.log.debug('Rendered plugins list page {page}/{total} as HTML', {
          page,
          total: totalPages,
        });
      }
    } catch (error) {
      trace.log.error('Failed to render plugins list: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    } finally {
      span.end();
    }
  }

  private async handlePluginDetail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const trace = this.createTrace('ui.plugin.detail', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
    });
    const span = trace.startSpan('render.plugin-detail');

    try {
      const params = request.params as PluginDetailParams;
      const pluginId = `${params.org}/${params.name}`;

      const getSpan = trace.startSpan('events.registry.plugin.get');
      const plugin = await this.registryClient.registryPluginGet(
        trace,
        { org: params.org, name: params.name }
      );
      getSpan.end();

      if (!plugin) {
        if (request.headers.accept?.includes('application/json')) {
          reply.code(404).send({ error: 'Plugin not found', pluginId });
        } else {
          await reply.code(404).view('pages/not-found.hbs', {
            title: 'Plugin Not Found',
            message: `Plugin ${pluginId} not found`,
          });
        }
        return;
      }

      const versionsSpan = trace.startSpan('events.registry.plugin.versions');
      const versions = await this.registryClient.registryPluginVersions(
        trace,
        { org: params.org, name: params.name }
      );
      versionsSpan.end();

      // Content negotiation: JSON or HTML
      if (request.headers.accept?.includes('application/json')) {
        trace.log.debug('Returned plugin detail as JSON for {id}', { id: pluginId });
        reply.send({
          plugin,
          versions: versions.versions,
        });
      } else {
        const renderSpan = trace.startSpan('handlebars.render');
        reply.view('pages/plugin-detail.hbs', {
          title: `${plugin.displayName || plugin.name} - BSB Registry`,
          plugin,
          versions: versions.versions,
        });
        renderSpan.end();
        trace.log.debug('Rendered plugin detail page as HTML for {id}', { id: pluginId });
      }
    } catch (error) {
      trace.log.error('Failed to render plugin detail: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    } finally {
      span.end();
    }
  }

  private async handleSearch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const trace = this.createTrace('ui.search', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
    });
    const span = trace.startSpan('render.search');

    try {
      const query = request.query as SearchQuery;
      const searchQuery = query.query || '';
      const page = parseInt(query.page || '1', 10);

      // No query provided - render empty search page
      if (!searchQuery) {
        if (request.headers.accept?.includes('application/json')) {
          reply.send({ query: '', plugins: [], total: 0, page: 1, totalPages: 0, pageSize: this.pageSize, filters: {} });
        } else {
          await reply.view('pages/search.hbs', {
            title: 'Search Plugins',
            searchQuery: '',
            plugins: [],
            pagination: { currentPage: 1, totalPages: 0, total: 0, pageSize: this.pageSize },
            filters: { category: query.category, language: query.language },
          });
        }
        span.end();
        return;
      }

      const offset = (page - 1) * this.pageSize;

      const searchSpan = trace.startSpan('events.registry.plugin.search');
      const searchResult = await this.registryClient.registryPluginSearch(
        trace,
        {
          query: searchQuery,
          limit: this.pageSize,
          offset,
          category: query.category as "service" | "observable" | "events" | "config" | "other" | undefined,
          language: query.language as "nodejs" | "csharp" | "go" | "java" | "python" | undefined,
        }
      );
      searchSpan.end();

      const totalPages = Math.ceil(searchResult.total / this.pageSize);

      // Content negotiation: JSON or HTML
      if (request.headers.accept?.includes('application/json')) {
        trace.log.debug('Returned search results as JSON for "{query}" - {total} results', {
          query: searchQuery,
          total: searchResult.total,
        });
        reply.send({
          query: searchQuery,
          plugins: searchResult.results,
          total: searchResult.total,
          page,
          totalPages,
          pageSize: this.pageSize,
          filters: {
            category: query.category,
            language: query.language,
          },
        });
      } else {
        const renderSpan = trace.startSpan('handlebars.render');
        await reply.view('pages/search.hbs', {
          title: `Search Results: ${searchQuery}`,
          searchQuery,
          plugins: searchResult.results,
          pagination: {
            currentPage: page,
            totalPages,
            total: searchResult.total,
            pageSize: this.pageSize,
          },
          filters: {
            category: query.category,
            language: query.language,
          },
        });
        renderSpan.end();
        trace.log.debug('Rendered search results as HTML for "{query}" - {total} results', {
          query: searchQuery,
          total: searchResult.total,
        });
      }
    } catch (error) {
      trace.log.error('Failed to render search results: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    } finally {
      span.end();
    }
  }

  async start(obs: Observable): Promise<void> {
    const span = obs.startSpan('RegistryUIServer.start');

    try {
      await this.app.listen({
        port: this.port,
        host: this.host,
      });

      obs.log.info('Registry UI server started on {host}:{port}', {
        host: this.host,
        port: this.port,
      });
    } catch (error) {
      obs.log.error('Failed to start Registry UI server: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  close(): void {
    this.app.close();
  }
}
