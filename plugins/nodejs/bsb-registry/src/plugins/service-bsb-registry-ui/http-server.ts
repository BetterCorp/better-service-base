/**
 * Registry UI & API HTTP Server (Event-Driven with Handlebars)
 *
 * Serves both the web UI (HTML via Handlebars) and the REST API (JSON)
 * using content negotiation (Accept header).
 * Communicates with registry core via typed BsbRegistryClient.
 */

import * as path from 'path';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart, { MultipartFile } from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import handlebars from 'handlebars';
import { marked } from 'marked';
import { z } from 'zod';
import { Observable } from '@bsb/base';
import type { Plugin } from './index';
import type { BsbRegistryClient } from '../../.bsb/clients/service-bsb-registry';

// ============================================================================
// Zod Validation Schemas — all external input validated at the boundary
// ============================================================================

// ---- Reusable field schemas ----

// ASCII-only printable, no control chars or unicode exploits
const safeAscii = /^[\x20-\x7E]*$/;
// Slug: alphanumeric, dash, underscore, dot, @, /
const slugPattern = /^[a-zA-Z0-9_@.\-/]+$/;
// Semver: strict major.minor.patch with optional pre-release
const semverPattern = /^\d{1,5}\.\d{1,5}\.\d{1,5}(-[a-zA-Z0-9.]+)?$/;
// Major.minor only
const majorMinorPattern = /^\d{1,5}\.\d{1,5}$/;
// Package name: npm-style scoped or unscoped
const packageNamePattern = /^(@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9._-]+$/;

const slugField = z.string().min(1).max(100).regex(slugPattern, 'Only alphanumeric, dash, underscore, dot, @, /');
const semverField = z.string().min(5).max(50).regex(semverPattern, 'Must be semver (e.g. 1.0.0)');
const languageEnum = z.enum(['nodejs', 'csharp', 'go', 'java', 'python']);
const categoryEnum = z.enum(['service', 'observable', 'events', 'config']);
const visibilityEnum = z.enum(['public', 'private']);
const safeString = (max: number) => z.string().max(max).regex(safeAscii, 'ASCII printable characters only');
const safeStringRequired = (min: number, max: number) => z.string().min(min).max(max).regex(safeAscii, 'ASCII printable characters only');
const optionalNonEmpty = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => value === '' ? undefined : value, schema.optional());

// ---- Route param schemas ----

const OrgParamsSchema = z.object({
  org: slugField,
});

const PluginDetailParamsSchema = z.object({
  org: slugField,
  name: slugField,
});

const PluginVersionParamsSchema = z.object({
  org: slugField,
  name: slugField,
  version: semverField,
});

const PluginTypesParamsSchema = z.object({
  org: slugField,
  name: slugField,
  version: semverField,
  language: languageEnum,
});

// ---- Query string schemas ----
// Note: z.coerce handles string-to-number conversion for query params

const BrowseQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  query: optionalNonEmpty(safeString(200)),
  category: optionalNonEmpty(categoryEnum),
  language: optionalNonEmpty(languageEnum),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(100000).optional(),
}).passthrough(); // ignore unexpected query params (referrer tracking etc.)

const VersionsQuerySchema = z.object({
  majorMinor: z.string().max(11).regex(majorMinorPattern, 'Must be major.minor (e.g. 1.0)').optional(),
}).passthrough();

const MatchQuerySchema = z.object({
  version: z.string().min(1).max(20).regex(safeAscii, 'ASCII only'),
}).passthrough();

const DocsQuerySchema = z.object({
  index: z.coerce.number().int().min(0).max(100).optional(),
}).passthrough();

// ---- EventSchemaExport validation (parsed from the JSON string clients send) ----

const EventExportEntryZod = z.object({
  type: z.enum(['fire-and-forget', 'returnable', 'broadcast']),
  category: z.enum([
    'emitEvents', 'onEvents',
    'emitReturnableEvents', 'onReturnableEvents',
    'emitBroadcast', 'onBroadcast',
  ]),
  description: z.string().max(1000).optional(),
  defaultTimeout: z.number().int().min(0).max(300).optional(),
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()).nullable(),
}).passthrough();

const EventSchemaExportZod = z.object({
  pluginName: safeStringRequired(1, 200),
  version: semverField,
  events: z.record(z.string(), EventExportEntryZod).default({}),
  capabilities: z.unknown().optional(),
  dependencies: z.array(z.object({
    id: z.string().min(1).max(200),
    version: safeStringRequired(1, 50),
  })).max(100).optional(),
}).passthrough();

// ---- Publish body schema ----

const AuthorSchema = z.union([
  safeString(200),
  z.object({
    name: safeStringRequired(1, 200),
    email: z.string().max(200).email().optional(),
    url: z.string().max(500).url().optional(),
  }).strict(),
]);

const PublishBodySchema = z.object({
  org: z.string().min(1).max(100).regex(slugPattern, 'Invalid org name'),
  name: z.string().min(1).max(100).regex(packageNamePattern, 'Invalid plugin name'),
  version: semverField,
  language: languageEnum,
  metadata: z.object({
    displayName: safeStringRequired(1, 200),
    description: z.string().min(1).max(1000),
    category: categoryEnum,
    tags: z.array(safeString(50)).max(30),
    author: AuthorSchema.optional(),
    license: safeString(50).optional(),
    homepage: z.string().max(500).url().optional(),
    repository: z.string().max(500).url().optional(),
  }).strict(),
  eventSchema: EventSchemaExportZod, // parsed object, validated at HTTP boundary
  capabilities: z.unknown().optional(),
  configSchema: z.object({
    type: z.literal('object'),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
    description: z.string().optional(),
  }).passthrough().optional(),
  typeDefinitions: z.object({
    nodejs: z.string().max(5_000_000).optional(),
    csharp: z.string().max(5_000_000).optional(),
    go: z.string().max(5_000_000).optional(),
    java: z.string().max(5_000_000).optional(),
  }).strict().optional(),
  documentation: z.array(z.string().max(1_000_000)).min(1).max(20),
  dependencies: z.array(z.object({
    id: z.string().min(1).max(200).regex(slugPattern, 'Invalid plugin ID'),
    version: safeStringRequired(1, 50),
  }).strict()).max(100).optional(),
  package: z.object({
    nodejs: safeString(200).optional(),
    csharp: safeString(200).optional(),
    go: safeString(200).optional(),
    java: safeString(200).optional(),
    python: safeString(200).optional(),
  }).strict().optional(),
  runtime: z.object({
    nodejs: safeString(50).optional(),
    dotnet: safeString(50).optional(),
    go: safeString(50).optional(),
    java: safeString(50).optional(),
    python: safeString(50).optional(),
  }).strict().optional(),
  visibility: visibilityEnum.optional(),
}).strict();

export class RegistryUIServer {
  private app: FastifyInstance;
  public readonly port: number;
  public readonly host: string;
  private readonly pageSize: number;
  private readonly uploadDir: string;
  private readonly badgesFile: string;
  private readonly maxImageUploadBytes: number;
  private readonly imageIndexPath: string;
  private imageIndex: Record<string, string> = {};
  private badgeMap: Record<string, string | string[]> = {};
  private registryClient!: BsbRegistryClient;
  private createTrace!: Plugin['createTrace'];

  constructor(
    port: number,
    host: string,
    pageSize: number,
    uploadDir: string,
    badgesFile: string,
    maxImageUploadMb: number
  ) {
    this.port = port;
    this.host = host;
    this.pageSize = pageSize;
    this.uploadDir = path.resolve(uploadDir);
    this.badgesFile = path.resolve(badgesFile);
    this.maxImageUploadBytes = maxImageUploadMb * 1024 * 1024;
    this.imageIndexPath = path.join(this.uploadDir, 'images.json');

    this.app = Fastify({
      logger: false,
      disableRequestLogging: true,
      bodyLimit: 10 * 1024 * 1024, // 10MB max request body
    });
  }

  private getHandlebarsHelpers(): Record<string, (...args: unknown[]) => unknown> {
    return {
      eq: (a: unknown, b: unknown) => a === b,
      neq: (a: unknown, b: unknown) => a !== b,
      gt: (a: unknown, b: unknown) => (a as number) > (b as number),
      lt: (a: unknown, b: unknown) => (a as number) < (b as number),
      add: (a: unknown, b: unknown) => (a as number) + (b as number),
      subtract: (a: unknown, b: unknown) => (a as number) - (b as number),

      // Display plugin ID without the "_/" prefix for unaffiliated plugins
      pluginDisplayId: (id: unknown) => {
        const str = id as string;
        if (str && str.startsWith('_/')) {
          return str.substring(2);
        }
        return str;
      },

      range: (start: unknown, end: unknown, max: unknown) => {
        const actualStart = Math.max(1, start as number);
        const actualEnd = Math.min(max as number, end as number);
        const result: number[] = [];
        for (let i = actualStart; i <= actualEnd; i++) {
          result.push(i);
        }
        return result;
      },

      // Display author - handles both string and { name, email?, url? } formats
      formatAuthor: (author: unknown) => {
        if (!author) return '';
        if (typeof author === 'string') return author;
        if (typeof author === 'object' && author !== null) {
          const obj = author as Record<string, unknown>;
          return obj.name || '';
        }
        return String(author);
      },

      // Check if an array has at least one item
      hasItems: (arr: unknown) => {
        return Array.isArray(arr) && arr.length > 0;
      },

      // Build the correct /plugins/:org/:name URL for a dependency ID.
      // Handles both "org/name" and bare "name" (assumes _ org).
      dependencyHref: (depId: unknown) => {
        const str = depId as string;
        if (!str) return '/plugins';
        if (str.includes('/')) {
          return `/plugins/${str}`;
        }
        return `/plugins/_/${str}`;
      },

      // Build query string preserving existing params
      queryString: (context: unknown) => {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
          if (value !== undefined && value !== null && value !== '') {
            params.set(key, String(value));
          }
        }
        const qs = params.toString();
        return qs ? `?${qs}` : '';
      },
    };
  }

  private registerHandlebarsHelpers(): void {
    const helpers = this.getHandlebarsHelpers();
    for (const [name, fn] of Object.entries(helpers)) {
      handlebars.registerHelper(name, fn);
    }
  }

  async init(obs: Observable, plugin: Plugin): Promise<void> {
    const span = obs.startSpan('RegistryUIServer.init');

    try {
      // Bind plugin context to this server instance
      this.registryClient = plugin.registryClient;
      this.createTrace = plugin.createTrace.bind(plugin);

      // Register CORS
      const corsSpan = obs.startSpan('register.cors');
      await this.app.register(fastifyCors, {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      });
      corsSpan.end();

      // Register multipart upload handling for plugin images
      const multipartSpan = obs.startSpan('register.multipart');
      await this.app.register(fastifyMultipart, {
        limits: {
          fileSize: this.maxImageUploadBytes,
          files: 1,
        },
      });
      multipartSpan.end();

      // Register Handlebars helpers
      const helpersSpan = obs.startSpan('register.helpers');
      this.registerHandlebarsHelpers();
      helpersSpan.end();

      // Register static file serving
      const staticSpan = obs.startSpan('register.static');
      const staticPath = path.join(plugin.pluginCwd, 'static');
      await this.app.register(fastifyStatic, {
        root: staticPath,
        prefix: '/static/',
        index: false,
      });

      await fsp.mkdir(this.uploadDir, { recursive: true });
      await this.app.register(fastifyStatic, {
        root: this.uploadDir,
        prefix: '/images/',
        decorateReply: false,
      });
      staticSpan.end();

      await this.loadImageIndex(obs);
      await this.loadBadgeMap(obs);

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
          helpers: this.getHandlebarsHelpers(),
        },
      });
      viewSpan.end();

      // Register global error handler — catches anything that slips through
      // route-level try/catch (template errors, unexpected throws, etc.)
      // This MUST NOT use reply.view() since the template engine itself may
      // be the source of the error.
      const errorSpan = obs.startSpan('register.errorHandler');
      this.app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
        const statusCode = error.statusCode ?? 500;

        // Log server errors
        if (statusCode >= 500) {
          obs.log.error('Unhandled server error on {method} {url}: {error}', {
            error: error.message,
            method: request.method,
            url: request.url,
          });
        }

        if (request.headers.accept?.includes('application/json')) {
          reply.code(statusCode).send({
            statusCode,
            error: 'Internal Server Error',
          });
        } else {
          reply
            .code(statusCode)
            .type('text/html; charset=utf-8')
            .send(this.fallbackErrorHtml(statusCode));
        }
      });
      errorSpan.end();

      // Register routes
      const routesSpan = obs.startSpan('register.routes');
      this.registerRoutes();
      routesSpan.end();

      obs.log.info('Registry UI & API server initialized successfully');
    } catch (error) {
      obs.log.error('Failed to initialize Registry UI server: {error}', { error: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // Route Registration
  // ============================================================================

  private registerRoutes(): void {
    // --- Pages (HTML + JSON content negotiation) ---

    // Homepage
    this.app.get('/', async (request, reply) => {
      return this.handleHome(request, reply);
    });

    // Browse + search plugins (combined list/search)
    this.app.get('/plugins', async (request, reply) => {
      return this.handleBrowse(request, reply);
    });

    // Org-scoped browse + search
    this.app.get('/plugins/:org', async (request, reply) => {
      return this.handleOrgBrowse(request, reply);
    });

    // Plugin details page
    this.app.get('/plugins/:org/:name', async (request, reply) => {
      return this.handlePluginDetail(request, reply);
    });

    // --- API-only routes (JSON) ---

    // Registry stats
    this.app.get('/stats', async (request, reply) => {
      return this.handleStats(request, reply);
    });

    // Plugin versions
    this.app.get('/plugins/:org/:name/versions', async (request, reply) => {
      return this.handleVersions(request, reply);
    });

    // Version matching
    this.app.get('/plugins/:org/:name/match', async (request, reply) => {
      return this.handleMatchVersion(request, reply);
    });

    // Plugin event schema
    this.app.get('/plugins/:org/:name/:version/schema', async (request, reply) => {
      return this.handleSchema(request, reply);
    });

    // Plugin documentation
    this.app.get('/plugins/:org/:name/:version/docs', async (request, reply) => {
      return this.handleDocs(request, reply);
    });

    // Plugin type definitions
    this.app.get('/plugins/:org/:name/:version/types/:language', async (request, reply) => {
      return this.handleTypes(request, reply);
    });

    // --- Write routes (require auth) ---

    // Publish plugin (immutable versions)
    this.app.post('/plugins', async (request, reply) => {
      return this.handlePublish(request, reply);
    });

    // Upload/replace plugin image
    this.app.post('/plugins/:org/:name/image', async (request, reply) => {
      return this.handleImageUpload(request, reply);
    });

    // Health check
    this.app.get('/health', async (_request, _reply) => {
      return { status: 'ok' };
    });
  }

  // ============================================================================
  // Auth
  // ============================================================================

  /**
   * Authenticate request via Bearer token.
   * Returns the userId on success, or null if not authenticated (also sends 401 reply).
   */
  private async authenticateRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    trace: Observable
  ): Promise<string | null> {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      trace.log.warn('Missing Authorization header');
      reply.code(401).send({ error: 'Unauthorized', code: 'MISSING_TOKEN' });
      return null;
    }

    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      trace.log.warn('Invalid Authorization header format');
      reply.code(401).send({ error: 'Unauthorized', code: 'INVALID_TOKEN_FORMAT' });
      return null;
    }

    const token = match[1];
    const authSpan = trace.startSpan('auth.verify');
    try {
      const result = await this.registryClient.registryAuthVerify(trace, { token });
      authSpan.end();

      if (!result.valid) {
        trace.log.warn('Token verification failed');
        reply.code(401).send({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
        return null;
      }

      return result.userId || 'unknown';
    } catch (error) {
      authSpan.end();
      trace.log.error('Auth verification error: {error}', { error: (error as Error).message });
      reply.code(401).send({ error: 'Unauthorized', code: 'AUTH_ERROR' });
      return null;
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  /** Check if request accepts JSON */
  private wantsJson(request: FastifyRequest): boolean {
    return request.headers.accept?.includes('application/json') === true;
  }

  /**
   * Validate input against a Zod schema. Returns parsed data on success,
   * or sends a 400 response and returns null on failure.
   */
  private validateInput<T>(
    schema: z.ZodType<T>,
    data: unknown,
    reply: FastifyReply,
  ): T | null {
    const result = schema.safeParse(data);
    if (!result.success) {
      const issues = result.error.issues.map((issue: z.ZodIssue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      reply.code(400).send({
        error: 'Validation Error',
        code: 'INVALID_INPUT',
        details: issues,
      });
      return null;
    }
    return result.data;
  }

  /** Render an error page (HTML) or send JSON error depending on Accept header */
  private async renderError(
    request: FastifyRequest,
    reply: FastifyReply,
    statusCode: number,
    title: string,
    message: string,
  ): Promise<void> {
    if (this.wantsJson(request)) {
      reply.code(statusCode).send({ error: title, message });
    } else {
      await reply.code(statusCode).view('pages/error.hbs', {
        title: `${statusCode} - ${title}`,
        statusCode,
        message,
      });
    }
  }

  private async loadImageIndex(obs: Observable): Promise<void> {
    try {
      const raw = await fsp.readFile(this.imageIndexPath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.imageIndex = parsed as Record<string, string>;
      }
    } catch {
      this.imageIndex = {};
    }
    obs.log.debug('Loaded image index with {count} entries', { count: Object.keys(this.imageIndex).length });
  }

  private async saveImageIndex(): Promise<void> {
    await fsp.mkdir(this.uploadDir, { recursive: true });
    await fsp.writeFile(this.imageIndexPath, JSON.stringify(this.imageIndex, null, 2), 'utf-8');
  }

  private async loadBadgeMap(obs: Observable): Promise<void> {
    try {
      const raw = await fsp.readFile(this.badgesFile, 'utf-8');
      const parsed = JSON.parse(raw);
      this.badgeMap = parsed && typeof parsed === 'object'
        ? parsed as Record<string, string | string[]>
        : {};
    } catch {
      this.badgeMap = {};
    }
    obs.log.debug('Loaded badge map with {count} entries', { count: Object.keys(this.badgeMap).length });
  }

  private resolvePluginImageUrl(pluginId: string): string | null {
    const filename = this.imageIndex[pluginId];
    if (!filename) return null;
    const filePath = path.join(this.uploadDir, filename);
    if (!fs.existsSync(filePath)) {
      delete this.imageIndex[pluginId];
      return null;
    }
    return `/images/${filename}`;
  }

  private normalizeBadgeLabel(raw: string): string {
    return raw.trim().toUpperCase();
  }

  private resolvePluginBadges(plugin: Record<string, unknown>): Array<{ label: string; type: string }> {
    const id = String(plugin.id || '');
    const org = String(plugin.org || '').trim();
    const mapped = this.badgeMap[id];

    if (typeof mapped === 'string' && mapped.trim()) {
      const label = this.normalizeBadgeLabel(mapped);
      const type = label === 'CORE' ? 'core' : label === 'OFFICIAL' ? 'official' : 'custom';
      return [{ label, type }];
    }
    if (Array.isArray(mapped) && mapped.length > 0) {
      return mapped
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .map((item) => {
          const label = this.normalizeBadgeLabel(item as string);
          const type = label === 'CORE' ? 'core' : label === 'OFFICIAL' ? 'official' : 'custom';
          return { label, type };
        });
    }
    if (org && org !== '_') {
      return [{ label: org.toUpperCase(), type: 'org' }];
    }
    return [{ label: 'COMMUNITY', type: 'community' }];
  }

  private enrichPlugin(plugin: Record<string, unknown>): Record<string, unknown> {
    const id = String(plugin.id || '');
    return {
      ...plugin,
      imageUrl: this.resolvePluginImageUrl(id),
      badges: this.resolvePluginBadges(plugin),
    };
  }

  private enrichPluginList(plugins: unknown[]): Record<string, unknown>[] {
    return plugins.map((plugin) => this.enrichPlugin(plugin as Record<string, unknown>));
  }

  private getImageExtension(mimeType: string): string | null {
    const map: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
    };
    return map[mimeType] || null;
  }

  /**
   * Self-contained HTML error page that never touches the template engine.
   * Used by the global error handler as a last-resort fallback.
   */
  private fallbackErrorHtml(statusCode: number): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${statusCode} - BSB Registry</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#1a1a1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
.c{text-align:center;padding:2rem}
h1{font-size:6rem;font-weight:800;color:#FB8C00;line-height:1;margin-bottom:1rem}
h2{font-size:1.5rem;font-weight:600;margin-bottom:.75rem}
p{color:#a0a0a0;margin-bottom:2rem}
a{display:inline-block;padding:.75rem 1.5rem;background:#FB8C00;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:0 .5rem}
a:hover{background:#e65100}
a.s{background:#2a2a2a;border:1px solid #3a3a3a}
a.s:hover{background:#333;border-color:#FB8C00}
</style>
</head>
<body>
<div class="c">
<h1>${statusCode}</h1>
<h2>Internal Server Error</h2>
<p>Something went wrong. Please try again.</p>
<a href="/">Go Home</a>
<a class="s" href="/plugins">Browse Plugins</a>
</div>
</body>
</html>`;
  }

  /**
   * Count events by type from an events map (Record<string, EventExportEntry>).
   * The stored `eventSchema` field is the events map directly (not the full export wrapper).
   */
  private countEvents(eventsMap: any): {
    total: number;
    emit: number;
    on: number;
    returnable: number;
    broadcast: number;
  } {
    const counts = { total: 0, emit: 0, on: 0, returnable: 0, broadcast: 0 };
    if (!eventsMap || typeof eventsMap !== 'object') return counts;

    for (const def of Object.values(eventsMap) as any[]) {
      switch (def.category) {
        case 'emitEvents': counts.emit++; break;
        case 'onEvents': counts.on++; break;
        case 'emitReturnableEvents':
        case 'onReturnableEvents':
          counts.returnable++; break;
        case 'emitBroadcast':
        case 'onBroadcast':
          counts.broadcast++; break;
      }
    }

    counts.total = counts.emit + counts.on + counts.returnable + counts.broadcast;
    return counts;
  }

  /**
   * Transform the flat events map into client-perspective grouped format for Handlebars.
   *
   * The stored schema records the SERVICE perspective (onReturnableEvents = the service
   * listens). But the registry shows the CLIENT perspective: if the service listens,
   * the client emits-and-returns.
   *
   * Mapping (service -> client perspective):
   *   onReturnableEvents  -> emitReturnableEvents  (client calls, service responds)
   *   emitReturnableEvents -> onReturnableEvents   (service calls, client responds)
   *   onEvents            -> emitEvents            (client fires, service handles)
   *   emitEvents          -> onEvents              (service fires, client handles)
   *   onBroadcast         -> emitBroadcast         (client broadcasts, service receives)
   *   emitBroadcast       -> onBroadcast           (service broadcasts, client receives)
   *
   * Also extracts input/output schema property names for display.
   */
  private groupEventsByCategory(eventsMap: any): Record<string, any[]> {
    // Flip map: service perspective -> client perspective
    const flipMap: Record<string, string> = {
      onReturnableEvents: 'emitReturnableEvents',
      emitReturnableEvents: 'onReturnableEvents',
      onEvents: 'emitEvents',
      emitEvents: 'onEvents',
      onBroadcast: 'emitBroadcast',
      emitBroadcast: 'onBroadcast',
    };

    const grouped: Record<string, any[]> = {};
    if (!eventsMap || typeof eventsMap !== 'object') return grouped;

    for (const [name, def] of Object.entries(eventsMap)) {
      const d = def as any;
      const serviceCat = d.category || 'onEvents';
      const clientCat = flipMap[serviceCat] || serviceCat;

      if (!grouped[clientCat]) grouped[clientCat] = [];

      // Extract property names from JSON Schema for input/output display
      const inputProps = this.extractSchemaProps(d.inputSchema);
      const outputProps = this.extractSchemaProps(d.outputSchema);

      grouped[clientCat].push({
        name,
        description: d.description,
        type: d.type,
        inputProps,
        outputProps,
      });
    }

    return grouped;
  }

  /**
   * Extract property names and types from a JSON Schema object for display.
   * Returns an array of { name, type, required, description } for each property.
   */
  private extractSchemaProps(schema: any): any[] {
    if (!schema || typeof schema !== 'object' || schema.type !== 'object') return [];
    const props = schema.properties;
    if (!props || typeof props !== 'object') return [];

    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const result: any[] = [];

    for (const [name, def] of Object.entries(props)) {
      const d = def as any;
      let typeLabel = d.type || 'unknown';

      // Enhance type label for common patterns
      if (d.enum) {
        typeLabel = d.enum.map((v: string) => `"${v}"`).join(' | ');
      } else if (d.type === 'array' && d.items) {
        const itemType = d.items.type || 'unknown';
        typeLabel = `${itemType}[]`;
      } else if (d.type === 'object') {
        typeLabel = 'object';
      } else if (d.format) {
        typeLabel = d.format;
      }

      result.push({
        name,
        type: typeLabel,
        required: required.has(name),
        description: d.description || '',
      });
    }

    return result;
  }

  /**
   * Extract config properties from a JSON Schema for template display.
   * Builds a tree-like flattened node list preserving hierarchy depth.
   */
  private extractConfigProps(schema: any): any[] {
    if (!schema || schema.type !== 'object' || !schema.properties) return [];
    const nodes: Array<{
      name: string;
      fullPath: string;
      level: number;
      isObject: boolean;
      required: boolean;
      description: string;
      type?: string;
      defaultValue?: string | null;
    }> = [];

    const toStringSet = (values: unknown): Set<string> => {
      if (!Array.isArray(values)) return new Set<string>();
      return new Set<string>(
        values.filter((v): v is string => typeof v === 'string')
      );
    };

    const walk = (current: any, parentPath: string, required: Set<string>, level: number) => {
      const props = current?.properties;
      if (!props || typeof props !== 'object') return;

      for (const [name, def] of Object.entries(props)) {
        const d = def as any;
        const fullPath = parentPath ? `${parentPath}.${name}` : name;

        if (d.type === 'object' && d.properties && typeof d.properties === 'object') {
          nodes.push({
            name,
            fullPath,
            level,
            isObject: true,
            required: required.has(name),
            description: d.description || '',
          });
          const nestedRequired = toStringSet(d.required);
          walk(d, fullPath, nestedRequired, level + 1);
          continue;
        }

        nodes.push({
          name,
          fullPath,
          level,
          isObject: false,
          type: this.configTypeLabel(d),
          required: required.has(name),
          description: d.description || '',
          defaultValue: d.default !== undefined ? JSON.stringify(d.default) : null,
        });
      }
    };

    walk(schema, '', toStringSet(schema.required), 0);
    return nodes;
  }

  /** Get a human-readable type label from a JSON Schema property definition */
  private configTypeLabel(def: any): string {
    if (def.enum) return def.enum.map((v: unknown) => JSON.stringify(v)).join(' | ');
    if (def.type === 'array' && def.items) return `${def.items.type || 'unknown'}[]`;
    if (def.format) return def.format;
    return def.type || 'unknown';
  }

  private extractObservableFeatureGroups(capabilities: any): Array<{
    title: string;
    items: Array<{ name: string; supported: boolean }>;
  }> {
    const groups: Array<{ title: string; key: string; labels: Record<string, string> }> = [
      {
        title: 'Logging',
        key: 'logging',
        labels: { debug: 'debug', info: 'info', warn: 'warn', error: 'error' },
      },
      {
        title: 'Metrics',
        key: 'metrics',
        labels: {
          createCounter: 'createCounter',
          createGauge: 'createGauge',
          createHistogram: 'createHistogram',
          incrementCounter: 'incrementCounter',
          setGauge: 'setGauge',
          observeHistogram: 'observeHistogram',
        },
      },
      {
        title: 'Tracing',
        key: 'tracing',
        labels: { spanStart: 'spanStart', spanEnd: 'spanEnd', spanError: 'spanError' },
      },
    ];

    if (!capabilities || typeof capabilities !== 'object') {
      return [];
    }

    return groups
      .map((group) => {
        const source = (capabilities as Record<string, any>)[group.key];
        if (!source || typeof source !== 'object') {
          return null;
        }
        const items = Object.entries(group.labels).map(([key, label]) => ({
          name: label,
          supported: source[key] === true,
        }));
        return { title: group.title, items };
      })
      .filter((g): g is { title: string; items: Array<{ name: string; supported: boolean }> } => g !== null);
  }

  /**
   * Build documentation tabs from an array of markdown strings.
   * Extracts the title from the first # heading in each document.
   * Returns an array of { id, title, html, active } for the template.
   */
  private buildDocTabs(docs: unknown): any[] | null {
    if (!Array.isArray(docs) || docs.length === 0) {
      // Legacy format: object with { readme, changelog?, ... }
      if (docs && typeof docs === 'object' && !Array.isArray(docs)) {
        const legacy = docs as Record<string, unknown>;
        if (typeof legacy.readme === 'string') {
          const title = this.extractMarkdownTitle(legacy.readme) || 'README';
          try {
            return [{ id: 'doc-0', title, html: this.renderMarkdown(legacy.readme), active: true }];
          } catch { return null; }
        }
      }
      return null;
    }

    const tabs: any[] = [];
    for (let i = 0; i < docs.length; i++) {
      const md = docs[i];
      if (typeof md !== 'string' || !md.trim()) continue;

      const title = this.extractMarkdownTitle(md) || `Document ${i + 1}`;
      try {
        tabs.push({
          id: `doc-${i}`,
          title,
          html: this.renderMarkdown(md),
          active: i === 0,
        });
      } catch {
        // Skip docs that fail to render
      }
    }

    return tabs.length > 0 ? tabs : null;
  }

  /**
   * Extract the title from the first # heading in a markdown string.
   * Returns null if no heading is found.
   */
  private extractMarkdownTitle(md: string): string | null {
    // Match the first line that starts with # (h1)
    const match = md.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : null;
  }

  /** Extract major.minor from semantic version */
  private extractMajorMinor(version: string): string {
    const parts = version.split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid semantic version: ${version}`);
    }
    return `${parts[0]}.${parts[1]}`;
  }

  /**
   * Render a markdown string to sanitized HTML.
   * External links open in a new tab. Raw HTML in the source is escaped.
   */
  private renderMarkdown(md: string): string {
    const renderer = new marked.Renderer();

    // Open external links in new tab with noopener
    renderer.link = ({ href, title, text }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    return marked.parse(md, {
      renderer,
      gfm: true,
      breaks: false,
    }) as string;
  }

  // ============================================================================
  // Page Handlers (HTML + JSON content negotiation)
  // ============================================================================

  private async handleHome(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const trace = this.createTrace('ui.home', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
    });
    const span = trace.startSpan('render.home');

    try {
      const statsSpan = trace.startSpan('events.registry.stats.get');
      const stats = await this.registryClient.registryStatsGet(trace, {});
      statsSpan.end();

      const listSpan = trace.startSpan('events.registry.plugin.list');
      const listResult = await this.registryClient.registryPluginList(trace, { limit: 12, offset: 0 });
      listSpan.end();
      const plugins = this.enrichPluginList(listResult.results as unknown[]);

      if (this.wantsJson(request)) {
        trace.log.debug('Returned home data as JSON');
        reply.send({
          stats,
          plugins,
          total: listResult.total,
        });
      } else {
        const renderSpan = trace.startSpan('handlebars.render');
        await reply.view('pages/home.hbs', {
          title: 'BSB Plugin Registry',
          activePage: 'home',
          stats,
          plugins,
          pageSize: this.pageSize,
        });
        renderSpan.end();
        trace.log.debug('Rendered home page as HTML');
      }
    } catch (error) {
      trace.log.error('Failed to render home page: {error}', { error: (error as Error).message });
      await this.renderError(request, reply, 500, 'Internal Server Error', 'Something went wrong loading the home page. Please try again.');
    } finally {
      span.end();
    }
  }

  private async handleBrowse(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    return this._handleBrowseInternal(request, reply);
  }

  private async handleOrgBrowse(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(OrgParamsSchema, request.params, reply);
    if (!params) return;
    return this._handleBrowseInternal(request, reply, params.org);
  }

  /**
   * Internal browse handler shared by /plugins and /plugins/:org.
   * Supports list, search, pagination, and content negotiation.
   */
  private async _handleBrowseInternal(
    request: FastifyRequest,
    reply: FastifyReply,
    orgFilter?: string
  ): Promise<void> {
    const query = this.validateInput(BrowseQuerySchema, request.query, reply);
    if (!query) return;

    const trace = this.createTrace('ui.browse', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
      ...(orgFilter && { org: orgFilter }),
    });
    const span = trace.startSpan('render.browse');

    try {
      const searchQuery = query.query || '';
      const isJson = this.wantsJson(request);

      const limit = query.limit ?? this.pageSize;
      const page = query.page ?? 1;
      const offset = query.offset ?? (page - 1) * limit;

      const categoryFilter = query.category;
      const languageFilter = query.language;

      let plugins: unknown[] = [];
      let total = 0;

      if (searchQuery) {
        // Search mode
        const searchSpan = trace.startSpan('events.registry.plugin.search');
        const searchResult = await this.registryClient.registryPluginSearch(
          trace,
          {
            query: searchQuery,
            limit,
            offset,
            category: categoryFilter,
            language: languageFilter,
          }
        );
        searchSpan.end();
        plugins = searchResult.results;
        total = searchResult.total;
      } else {
        // Browse mode
        const listSpan = trace.startSpan('events.registry.plugin.list');
        const listResult = await this.registryClient.registryPluginList(
          trace,
          {
            limit,
            offset,
            org: orgFilter,
            category: categoryFilter,
            language: languageFilter,
          }
        );
        listSpan.end();
        plugins = listResult.results;
        total = listResult.total;
      }

      const enrichedPlugins = this.enrichPluginList(plugins);
      const totalPages = Math.ceil(total / limit);

      if (isJson) {
        trace.log.debug('Returned browse data as JSON');
        reply.send({
          query: searchQuery || undefined,
          plugins: enrichedPlugins,
          total,
          page: Math.floor(offset / limit) + 1,
          totalPages,
          pageSize: limit,
          filters: {
            org: orgFilter,
            category: categoryFilter,
            language: languageFilter,
          },
        });
      } else {
        const renderSpan = trace.startSpan('handlebars.render');
        await reply.view('pages/plugins.hbs', {
          title: searchQuery
            ? `Search: ${searchQuery}`
            : orgFilter
            ? `Plugins by ${orgFilter}`
            : 'Browse Plugins',
          activePage: 'browse',
          searchQuery,
          plugins: enrichedPlugins,
          pagination: {
            currentPage: page,
            totalPages,
            total,
            pageSize: limit,
          },
          filters: {
            org: orgFilter,
            category: categoryFilter,
            language: languageFilter,
          },
        });
        renderSpan.end();
        trace.log.debug('Rendered browse page as HTML');
      }
    } catch (error) {
      trace.log.error('Failed to render browse page: {error}', { error: (error as Error).message });
      await this.renderError(request, reply, 500, 'Internal Server Error', 'Something went wrong loading plugins. Please try again.');
    } finally {
      span.end();
    }
  }

  private async handlePluginDetail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PluginDetailParamsSchema, request.params, reply);
    if (!params) return;

    const trace = this.createTrace('ui.plugin.detail', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
    });
    const span = trace.startSpan('render.plugin-detail');

    try {
      const pluginId = `${params.org}/${params.name}`;

      const getSpan = trace.startSpan('events.registry.plugin.get');
      let plugin: any;
      try {
        plugin = await this.registryClient.registryPluginGet(
          trace,
          { org: params.org, name: params.name }
        );
      } catch {
        plugin = null;
      }
      getSpan.end();

      if (!plugin) {
        await this.renderError(request, reply, 404, 'Plugin Not Found', `Plugin "${pluginId}" could not be found in the registry.`);
        return;
      }

      const versionsSpan = trace.startSpan('events.registry.plugin.versions');
      const versions = await this.registryClient.registryPluginVersions(
        trace,
        { org: params.org, name: params.name }
      );
      versionsSpan.end();

      if (this.wantsJson(request)) {
        const category = String(plugin.category || '');
        const pluginView = {
          ...this.enrichPlugin(plugin),
          showEventsCard: category === 'service',
          showDependenciesCard: category === 'service',
          showSupportedFeaturesCard: category === 'observable',
          showConfigCard: category === 'service' || category === 'config' || category === 'events' || category === 'observable',
        };
        trace.log.debug('Returned plugin detail as JSON for {id}', { id: pluginId });
        reply.send({
          plugin: pluginView,
          versions: versions.versions,
        });
      } else {
        // eventSchema is stored as the events map directly.
        // Handle legacy string format (old data before migration).
        let eventsMap = plugin.eventSchema;
        if (typeof eventsMap === 'string') {
          try {
            const parsed = JSON.parse(eventsMap);
            // Legacy: full export wrapper with .events key
            eventsMap = parsed.events ?? parsed;
          } catch { eventsMap = null; }
        }

        // Group events by category for the Handlebars template
        const groupedEvents = eventsMap
          ? this.groupEventsByCategory(eventsMap)
          : null;
        const category = String(plugin.category || '');
        const showEventsCard = category === 'service' && !!groupedEvents && Object.keys(groupedEvents).length > 0;
        const showDependenciesCard = category === 'service';
        const showSupportedFeaturesCard = category === 'observable';

        // Build documentation tabs from the array of markdown strings.
        // Each doc's title is extracted from the first # heading.
        // First doc is the active tab by default.
        const docTabs = this.buildDocTabs(plugin.documentation);

        // Extract config schema properties for display
        const configProps = plugin.configSchema
          ? this.extractConfigProps(plugin.configSchema)
          : null;
        const hasNestedConfigProps = !!configProps && configProps.some((node: any) => Number(node.level || 0) > 0);
        const showConfigCard = category === 'service' || category === 'config' || category === 'events' || category === 'observable';
        const configDescription = category === 'config'
          ? 'Configuration for config plugins is provided through environment variables:'
          : 'Configuration options for this plugin:';
        const observableFeatureGroups = category === 'observable'
          ? this.extractObservableFeatureGroups(plugin.capabilities)
          : [];

        const pluginView = {
          ...this.enrichPlugin(plugin),
          eventSchema: groupedEvents,
          configProps,
          hasNestedConfigProps,
          configDescription,
          showConfigCard,
          showEventsCard,
          showDependenciesCard,
          showSupportedFeaturesCard,
          observableFeatureGroups,
          docTabs,
        };

        const renderSpan = trace.startSpan('handlebars.render');
        await reply.view('pages/plugin-detail.hbs', {
          title: `${plugin.displayName || plugin.name} - BSB Registry`,
          plugin: pluginView,
          versions: versions.versions,
        });
        renderSpan.end();
        trace.log.debug('Rendered plugin detail page as HTML for {id}', { id: pluginId });
      }
    } catch (error) {
      trace.log.error('Failed to render plugin detail: {error}', { error: (error as Error).message });
      await this.renderError(request, reply, 500, 'Internal Server Error', 'Something went wrong loading plugin details. Please try again.');
    } finally {
      span.end();
    }
  }

  // ============================================================================
  // API-only Handlers (JSON responses)
  // ============================================================================

  /** GET /stats — Registry statistics */
  private async handleStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const trace = this.createTrace('api.stats', {
      url: request.url,
      method: request.method,
    });

    try {
      const statsSpan = trace.startSpan('events.registry.stats.get');
      const stats = await this.registryClient.registryStatsGet(trace, {});
      statsSpan.end();

      reply.send(stats);
    } catch (error) {
      trace.log.error('Failed to get stats: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  /** GET /plugins/:org/:name/versions — Plugin version list */
  private async handleVersions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PluginDetailParamsSchema, request.params, reply);
    if (!params) return;
    const query = this.validateInput(VersionsQuerySchema, request.query, reply);
    if (!query) return;

    const trace = this.createTrace('api.versions', {
      url: request.url,
      method: request.method,
    });

    try {

      const versionsSpan = trace.startSpan('events.registry.plugin.versions');
      const result = await this.registryClient.registryPluginVersions(
        trace,
        { org: params.org, name: params.name, majorMinor: query.majorMinor }
      );
      versionsSpan.end();

      if (result.versions.length === 0) {
        reply.code(404).send({
          error: `Plugin not found: ${params.org}/${params.name}`,
          code: 'PLUGIN_NOT_FOUND',
        });
        return;
      }

      reply.send(result);
    } catch (error) {
      trace.log.error('Failed to get versions: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  /** GET /plugins/:org/:name/match?version=1.0 — Find latest patch for major.minor */
  private async handleMatchVersion(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PluginDetailParamsSchema, request.params, reply);
    if (!params) return;
    const query = this.validateInput(MatchQuerySchema, request.query, reply);
    if (!query) return;

    const trace = this.createTrace('api.match', {
      url: request.url,
      method: request.method,
    });

    try {
      const requested = query.version;

      // Get all versions and find the latest patch for the requested major.minor
      const versionsSpan = trace.startSpan('events.registry.plugin.versions');
      const result = await this.registryClient.registryPluginVersions(
        trace,
        { org: params.org, name: params.name, majorMinor: requested }
      );
      versionsSpan.end();

      if (result.versions.length === 0) {
        reply.code(404).send({
          error: `No version found matching ${requested} for ${params.org}/${params.name}`,
          code: 'VERSION_NOT_FOUND',
        });
        return;
      }

      // Latest patch is the first version in the filtered list
      const matched = result.versions[0].version;

      // Check if there's a newer major.minor available
      let alert: string | undefined;
      if (result.latest) {
        const latestMajorMinor = this.extractMajorMinor(result.latest);
        if (latestMajorMinor !== requested) {
          alert = `Newer major.minor available: ${latestMajorMinor}`;
        }
      }

      reply.send({
        requested,
        matched,
        latest: result.latest,
        alert,
      });
    } catch (error) {
      trace.log.error('Failed to match version: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  /** GET /plugins/:org/:name/:version/schema — Plugin event schema (JSON) */
  private async handleSchema(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PluginVersionParamsSchema, request.params, reply);
    if (!params) return;

    const trace = this.createTrace('api.schema', {
      url: request.url,
      method: request.method,
    });

    try {

      const getSpan = trace.startSpan('events.registry.plugin.get');
      let plugin: any;
      try {
        plugin = await this.registryClient.registryPluginGet(
          trace,
          { org: params.org, name: params.name, version: params.version }
        );
      } catch {
        plugin = null;
      }
      getSpan.end();

      if (!plugin) {
        reply.code(404).send({
          error: `Plugin not found: ${params.org}/${params.name}@${params.version}`,
          code: 'PLUGIN_NOT_FOUND',
        });
        return;
      }

      // eventSchema is stored as the events map only.
      // Reconstruct the full EventSchemaExport for the API response
      // using name/version from the root entry.
      let eventsMap = plugin.eventSchema;
      if (typeof eventsMap === 'string') {
        try {
          const parsed = JSON.parse(eventsMap);
          eventsMap = parsed.events ?? parsed;
        } catch { eventsMap = {}; }
      }

      reply.send({
        pluginName: plugin.displayName || plugin.name,
        version: plugin.version,
        events: eventsMap || {},
        ...(plugin.capabilities ? { capabilities: plugin.capabilities } : {}),
        ...(plugin.configSchema ? { configSchema: plugin.configSchema } : {}),
      });
    } catch (error) {
      trace.log.error('Failed to get schema: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  /** GET /plugins/:org/:name/:version/docs?index=0 — Plugin documentation by index */
  private async handleDocs(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PluginVersionParamsSchema, request.params, reply);
    if (!params) return;
    const query = this.validateInput(DocsQuerySchema, request.query, reply);
    if (!query) return;

    const trace = this.createTrace('api.docs', {
      url: request.url,
      method: request.method,
    });

    try {
      const getSpan = trace.startSpan('events.registry.plugin.get');
      let plugin: any;
      try {
        plugin = await this.registryClient.registryPluginGet(
          trace,
          { org: params.org, name: params.name, version: params.version }
        );
      } catch {
        plugin = null;
      }
      getSpan.end();

      if (!plugin) {
        reply.code(404).send({
          error: `Plugin not found: ${params.org}/${params.name}@${params.version}`,
          code: 'PLUGIN_NOT_FOUND',
        });
        return;
      }

      const docs = plugin.documentation;

      // Handle both array (new) and legacy object format
      if (Array.isArray(docs)) {
        const idx = query.index ?? 0;
        if (idx >= docs.length) {
          reply.code(404).send({
            error: `Documentation index ${idx} out of range (${docs.length} docs available)`,
            code: 'DOC_NOT_FOUND',
          });
          return;
        }
        reply.send({ content: docs[idx], format: 'markdown', index: idx, total: docs.length });
      } else if (docs && typeof docs === 'object') {
        // Legacy object format
        const legacy = docs as Record<string, unknown>;
        if (typeof legacy.readme === 'string') {
          reply.send({ content: legacy.readme, format: 'markdown', index: 0, total: 1 });
        } else {
          reply.code(404).send({ error: 'Documentation not available', code: 'DOCS_NOT_FOUND' });
        }
      } else {
        reply.code(404).send({ error: 'Documentation not available for this plugin', code: 'DOCS_NOT_FOUND' });
      }
    } catch (error) {
      trace.log.error('Failed to get docs: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  /** GET /plugins/:org/:name/:version/types/:language — Type definitions (text/plain) */
  private async handleTypes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PluginTypesParamsSchema, request.params, reply);
    if (!params) return;

    const trace = this.createTrace('api.types', {
      url: request.url,
      method: request.method,
    });

    try {

      const getSpan = trace.startSpan('events.registry.plugin.get');
      let plugin: any;
      try {
        plugin = await this.registryClient.registryPluginGet(
          trace,
          { org: params.org, name: params.name, version: params.version }
        );
      } catch {
        plugin = null;
      }
      getSpan.end();

      if (!plugin) {
        reply.code(404).send({
          error: `Plugin not found: ${params.org}/${params.name}@${params.version}`,
          code: 'PLUGIN_NOT_FOUND',
        });
        return;
      }

      if (!plugin.typeDefinitions || !plugin.typeDefinitions[params.language]) {
        reply.code(404).send({
          error: `Type definitions not available for language: ${params.language}`,
          code: 'TYPES_NOT_FOUND',
        });
        return;
      }

      reply.type('text/plain').send(plugin.typeDefinitions[params.language]);
    } catch (error) {
      trace.log.error('Failed to get types: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  // ============================================================================
  // Write Handlers (require auth)
  // ============================================================================

  /** POST /plugins/:org/:name/image — Upload or replace plugin image */
  private async handleImageUpload(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PluginDetailParamsSchema, request.params, reply);
    if (!params) return;

    const trace = this.createTrace('api.image.upload', {
      url: request.url,
      method: request.method,
    });

    try {
      const userId = await this.authenticateRequest(request, reply, trace);
      if (!userId) return;

      const getSpan = trace.startSpan('events.registry.plugin.get');
      let plugin: any;
      try {
        plugin = await this.registryClient.registryPluginGet(
          trace,
          { org: params.org, name: params.name }
        );
      } catch {
        plugin = null;
      }
      getSpan.end();

      if (!plugin) {
        reply.code(404).send({
          error: `Plugin not found: ${params.org}/${params.name}`,
          code: 'PLUGIN_NOT_FOUND',
        });
        return;
      }

      const parts = (request as any).parts?.();
      if (!parts) {
        reply.code(400).send({ error: 'Expected multipart/form-data body', code: 'INVALID_UPLOAD' });
        return;
      }

      let filePart: MultipartFile | null = null;
      for await (const part of parts) {
        if (part.type === 'file') {
          filePart = part;
          break;
        }
      }

      if (!filePart) {
        reply.code(400).send({ error: 'No image file provided', code: 'MISSING_FILE' });
        return;
      }

      const ext = this.getImageExtension(filePart.mimetype);
      if (!ext) {
        reply.code(400).send({
          error: `Unsupported image type: ${filePart.mimetype}`,
          code: 'UNSUPPORTED_IMAGE_TYPE',
        });
        return;
      }

      const pluginId = `${params.org}/${params.name}`;
      const safeFileName = `${params.org}__${params.name}${ext}`;
      const outputPath = path.join(this.uploadDir, safeFileName);
      await fsp.mkdir(this.uploadDir, { recursive: true });

      await pipeline(filePart.file, fs.createWriteStream(outputPath));
      if (filePart.file.truncated) {
        await fsp.unlink(outputPath).catch(() => {});
        reply.code(413).send({
          error: 'Image exceeds configured upload size limit',
          code: 'IMAGE_TOO_LARGE',
        });
        return;
      }

      const previousFile = this.imageIndex[pluginId];
      this.imageIndex[pluginId] = safeFileName;
      await this.saveImageIndex();

      if (previousFile && previousFile !== safeFileName) {
        await fsp.unlink(path.join(this.uploadDir, previousFile)).catch(() => {});
      }

      trace.log.info('Plugin image updated for {id} by {userId}', { id: pluginId, userId });
      reply.send({
        success: true,
        pluginId,
        imageUrl: `/images/${safeFileName}`,
      });
    } catch (error) {
      trace.log.error('Failed to upload plugin image: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  /** POST /plugins — Publish a plugin (immutable versions) */
  private async handlePublish(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Validate body first, before any auth or tracing
    const body = this.validateInput(PublishBodySchema, request.body, reply);
    if (!body) return;

    const trace = this.createTrace('api.publish', {
      url: request.url,
      method: request.method,
    });

    try {
      // Authenticate (returns userId on success)
      const userId = await this.authenticateRequest(request, reply, trace);
      if (!userId) return;

      // eventSchema is already a validated object (Zod parsed it from the JSON body).
      // configSchema is also already validated by Zod if present.

      // Extract dependencies from eventSchema if not provided at top level
      const dependencies = body.dependencies ?? body.eventSchema.dependencies ?? [];

      // Publish via event (immutable versions - rejects if version exists)
      const publishSpan = trace.startSpan('events.registry.plugin.publish');
      const result = await this.registryClient.registryPluginPublish(trace, {
        org: body.org,
        name: body.name,
        version: body.version,
        language: body.language,
        metadata: body.metadata,
        eventSchema: body.eventSchema as any,
        configSchema: body.configSchema as any,
        typeDefinitions: body.typeDefinitions,
        documentation: body.documentation,
        dependencies,
        package: body.package,
        runtime: body.runtime,
        visibility: body.visibility || 'public',
        publishedBy: userId,
      });
      publishSpan.end();

      // Check if the core rejected the publish (version already exists)
      if (!result.success) {
        trace.log.warn('Publish rejected: {org}/{name}@{version} - {message}', {
          org: body.org,
          name: body.name,
          version: body.version,
          message: result.message || 'Version already exists',
        });
        reply.code(409).send(result);
        return;
      }

      trace.log.info('Plugin published: {org}/{name}@{version}', {
        org: body.org,
        name: body.name,
        version: body.version,
      });

      reply.send(result);
    } catch (error) {
      trace.log.error('Failed to publish plugin: {error}', { error: (error as Error).message });
      reply.code(500).send({ error: 'Internal Server Error' });
    }
  }

  // ============================================================================
  // Server Lifecycle
  // ============================================================================

  async start(obs: Observable): Promise<void> {
    const span = obs.startSpan('RegistryUIServer.start');

    try {
      await this.app.listen({
        port: this.port,
        host: this.host,
      });

      obs.log.info('Registry UI & API server started on {host}:{port}', {
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
