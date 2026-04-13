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
import * as av from '@anyvali/js';
import { Observable } from '@bsb/base';
import type { Plugin } from './index.js';
import type { BsbRegistryClient } from '../../.bsb/clients/service-bsb-registry.js';

type ValidationIssue = av.ValidationIssue;

interface InputValidator<T> {
  safeParse(input: unknown): av.ParseResult<T>;
}

function objectSchema<T extends Record<string, av.BaseSchema<any, any>>>(shape: T) {
  return av.object(shape, { unknownKeys: 'strip' });
}

function createValidator<T>(
  schema: av.BaseSchema<any, T>,
  options?: {
    normalize?: (input: unknown) => unknown;
    extraIssues?: (data: T) => ValidationIssue[];
  },
): InputValidator<T> {
  return {
    safeParse(input: unknown): av.ParseResult<T> {
      const normalized = options?.normalize ? options.normalize(input) : input;
      const result = schema.safeParse(normalized);
      if (!result.success) {
        return result;
      }

      const extraIssues = options?.extraIssues?.(result.data) ?? [];
      if (extraIssues.length > 0) {
        return {
          success: false,
          issues: extraIssues,
        };
      }

      return result;
    },
  };
}

function mapObjectInput(
  input: unknown,
  transform: (value: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input;
  }
  return transform({ ...(input as Record<string, unknown>) });
}

function emptyStringToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

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

const slugField = av.string().minLength(1).maxLength(100).pattern(slugPattern.source);
const semverField = av.string().minLength(5).maxLength(50).pattern(semverPattern.source);
const languageEnum = av.enum_(['nodejs', 'csharp', 'go', 'java', 'python'] as const);
const categoryEnum = av.enum_(['service', 'observable', 'events', 'config'] as const);
const visibilityEnum = av.enum_(['public', 'private'] as const);
const safeString = (max: number) => av.string().maxLength(max).pattern(safeAscii.source);
const safeStringRequired = (min: number, max: number) => av.string().minLength(min).maxLength(max).pattern(safeAscii.source);

// ---- Route param schemas ----

const OrgParamsSchema = createValidator(objectSchema({
  org: slugField,
}));

const PluginDetailParamsSchema = createValidator(objectSchema({
  org: slugField,
  name: slugField,
}));

const PluginVersionParamsSchema = createValidator(objectSchema({
  org: slugField,
  name: slugField,
  version: semverField,
}));

const PluginTypesParamsSchema = createValidator(objectSchema({
  org: slugField,
  name: slugField,
  version: semverField,
  language: languageEnum,
}));

const packageLookupIdPattern = /^[A-Za-z0-9@._\-/:]+$/;

const PackageLookupParamsSchema = createValidator(objectSchema({
  language: languageEnum,
  '*': av.string().minLength(1).maxLength(300).pattern(packageLookupIdPattern.source),
}), {
  normalize: (input) => mapObjectInput(input, (value) => {
    const packageId = value['*'];
    if (typeof packageId !== 'string') {
      return value;
    }

    try {
      return {
        ...value,
        '*': decodeURIComponent(packageId).trim(),
      };
    } catch {
      return {
        ...value,
        '*': '__INVALID_PACKAGE_ID__',
      };
    }
  }),
});

// ---- Query string schemas ----
const BrowseQuerySchema = createValidator(objectSchema({
  page: av.optional(av.int32().coerce({ from: 'string' }).min(1).max(10000)),
  query: av.optional(safeString(200)),
  category: av.optional(categoryEnum),
  language: av.optional(languageEnum),
  limit: av.optional(av.int32().coerce({ from: 'string' }).min(1).max(100)),
  offset: av.optional(av.int32().coerce({ from: 'string' }).min(0).max(100000)),
}), {
  normalize: (input) => mapObjectInput(input, (value) => ({
    ...value,
    query: emptyStringToUndefined(value.query),
    category: emptyStringToUndefined(value.category),
    language: emptyStringToUndefined(value.language),
  })),
});

const VersionsQuerySchema = createValidator(objectSchema({
  majorMinor: av.optional(av.string().maxLength(11).pattern(majorMinorPattern.source)),
}));

const MatchQuerySchema = createValidator(objectSchema({
  version: av.string().minLength(1).maxLength(20).pattern(safeAscii.source),
}));

const DocsQuerySchema = createValidator(objectSchema({
  index: av.optional(av.int32().coerce({ from: 'string' }).min(0).max(100)),
}));

// ---- EventSchemaExport validation (parsed from the JSON string clients send) ----

const AnyValiDocumentSchema = av.record(av.unknown());

const EventExportEntrySchema = objectSchema({
  type: av.enum_(['fire-and-forget', 'returnable', 'broadcast'] as const),
  category: av.enum_([
    'emitEvents', 'onEvents',
    'emitReturnableEvents', 'onReturnableEvents',
    'emitBroadcast', 'onBroadcast',
  ] as const),
  description: av.optional(av.string().maxLength(1000)),
  defaultTimeout: av.optional(av.int32().min(0).max(300)),
  inputSchema: AnyValiDocumentSchema,
  outputSchema: av.nullable(AnyValiDocumentSchema),
});

const EventSchemaExportObjectSchema = objectSchema({
  pluginName: safeStringRequired(1, 200),
  version: semverField,
  events: av.record(EventExportEntrySchema).default({}),
  capabilities: av.optional(av.unknown()),
  dependencies: av.optional(av.array(objectSchema({
    id: av.string().minLength(1).maxLength(200),
    version: safeStringRequired(1, 50),
  })).maxItems(100)),
});

type EventSchemaExportData = av.Infer<typeof EventSchemaExportObjectSchema>;

// ---- Publish body schema ----

const AuthorSchema = av.union([
  safeString(200),
  objectSchema({
    name: safeStringRequired(1, 200),
    email: av.optional(av.string().maxLength(200).format('email')),
    url: av.optional(av.string().maxLength(500).format('url')),
  }),
] as const);

const PublishBodyObjectSchema = objectSchema({
  org: av.string().minLength(1).maxLength(100).pattern(slugPattern.source),
  name: av.string().minLength(1).maxLength(100).pattern(packageNamePattern.source),
  version: semverField,
  language: languageEnum,
  metadata: objectSchema({
    displayName: safeStringRequired(1, 200),
    description: av.string().minLength(1).maxLength(1000),
    category: categoryEnum,
    tags: av.array(safeString(50)).maxItems(30),
    author: av.optional(AuthorSchema),
    license: av.optional(safeString(50)),
    homepage: av.optional(av.string().maxLength(500).format('url')),
    repository: av.optional(safeString(500)),
  }),
  eventSchema: EventSchemaExportObjectSchema,
  capabilities: av.optional(av.unknown()),
  configSchema: av.optional(AnyValiDocumentSchema),
  typeDefinitions: av.optional(objectSchema({
    nodejs: av.optional(av.string().maxLength(5_000_000)),
    csharp: av.optional(av.string().maxLength(5_000_000)),
    go: av.optional(av.string().maxLength(5_000_000)),
    java: av.optional(av.string().maxLength(5_000_000)),
  })),
  documentation: av.array(av.string().maxLength(1_000_000)).minItems(1).maxItems(20),
  dependencies: av.optional(av.array(objectSchema({
    id: av.string().minLength(1).maxLength(200).pattern(slugPattern.source),
    version: safeStringRequired(1, 50),
  })).maxItems(100)),
  package: av.optional(objectSchema({
    nodejs: av.optional(safeString(200)),
    csharp: av.optional(safeString(200)),
    go: av.optional(safeString(200)),
    java: av.optional(safeString(200)),
    python: av.optional(safeString(200)),
  })),
  runtime: av.optional(objectSchema({
    nodejs: av.optional(safeString(50)),
    dotnet: av.optional(safeString(50)),
    go: av.optional(safeString(50)),
    java: av.optional(safeString(50)),
    python: av.optional(safeString(50)),
  })),
  visibility: av.optional(visibilityEnum),
});

type PublishBodyData = av.Infer<typeof PublishBodyObjectSchema>;

function validateAnyValiDocument(value: unknown, path: Array<string | number>): ValidationIssue[] {
  if (!value || typeof value !== 'object') {
    return [{
      code: 'invalid_type',
      message: 'Expected AnyVali document object',
      path,
      expected: 'object',
      received: typeof value,
    }];
  }

  try {
    av.importSchema(value as av.AnyValiDocument);
    return [];
  } catch (error: unknown) {
    const issues: ValidationIssue[] = error instanceof av.ValidationError
      ? error.issues
      : [{
          code: 'invalid_schema',
          message: error instanceof Error ? error.message : 'Invalid AnyVali document',
          path: [],
        }];
    return issues.map((issue) => ({
      ...issue,
      path: [...path, ...issue.path],
    }));
  }
}

function validateEventSchemaExportDocuments(
  value: EventSchemaExportData,
  path: Array<string | number> = [],
): ValidationIssue[] {
  const nestedIssues: ValidationIssue[] = [];
  for (const [eventName, eventDef] of Object.entries(value.events)) {
    nestedIssues.push(...validateAnyValiDocument(eventDef.inputSchema, [...path, 'events', eventName, 'inputSchema']));
    if (eventDef.outputSchema !== null) {
      nestedIssues.push(...validateAnyValiDocument(eventDef.outputSchema, [...path, 'events', eventName, 'outputSchema']));
    }
  }
  return nestedIssues;
}

const PublishBodySchema = createValidator(PublishBodyObjectSchema, {
  extraIssues: (value: PublishBodyData) => [
    ...validateEventSchemaExportDocuments(value.eventSchema, ['eventSchema']),
    ...(value.configSchema !== undefined
      ? validateAnyValiDocument(value.configSchema, ['configSchema'])
      : []),
  ],
});

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
  private pluginCwd!: string;

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
      this.pluginCwd = plugin.pluginCwd;

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

    // LLM guidance
    this.app.get('/llms.txt', async (_request, reply) => {
      const llmsPath = path.join(this.pluginCwd, 'static', 'llms.txt');
      if (fs.existsSync(llmsPath)) {
        reply.type('text/plain').send(fs.readFileSync(llmsPath, 'utf8'));
      } else {
        reply.code(404).type('text/plain').send('Not found');
      }
    });

    // Browse + search plugins (combined list/search)
    this.app.get('/plugins', async (request, reply) => {
      return this.handleBrowse(request, reply);
    });

    // Package lookup page (exact package id match by language)
    // Example: /packages/nodejs/@bsb/registry
    this.app.get('/packages/:language/*', async (request, reply) => {
      return this.handlePackageLookup(request, reply);
    });

    // Language-first package lookup alias.
    // Example: /nodejs/@bsb/registry or /go/github.com/acme/plugin
    this.app.get('/:language/*', async (request, reply) => {
      return this.handlePackageLookup(request, reply);
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
   * Validate input against an AnyVali-backed schema. Returns parsed data on success,
   * or sends a 400 response and returns null on failure.
   */
  private validateInput<T>(
    schema: InputValidator<T>,
    data: unknown,
    reply: FastifyReply,
  ): T | null {
    const result = schema.safeParse(data);
    if (result.success) {
      return result.data;
    }

    const issues = result.issues.map((issue: ValidationIssue) => ({
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

    // If the org slug doesn't exist, try redirecting to the unaffiliated org "_" plugin.
    // Example: /plugins/events-default -> /plugins/_/events-default
    if (!request.url.includes('?') && params.org !== '_') {
      const trace = this.createTrace('ui.org.redirect', {
        url: request.url,
        method: request.method,
        accept: request.headers.accept || 'text/html',
        org: params.org,
      });
      const span = trace.startSpan('redirect.check');
      try {
        const listResult = await this.registryClient.registryPluginList(trace, {
          org: params.org,
          limit: 1,
          offset: 0,
        });

        if (!Number(listResult.total || 0)) {
          let plugin: any = null;
          try {
            plugin = await this.registryClient.registryPluginGet(trace, { org: '_', name: params.org });
          } catch {
            plugin = null;
          }
          if (plugin) {
            reply.redirect(`/plugins/_/${params.org}`, 302);
            return;
          }
        }
      } catch {
        // Fall through to normal org browse on any error.
      } finally {
        span.end();
      }
    }

    return this._handleBrowseInternal(request, reply, params.org);
  }

  private async listAllPluginsByLanguage(trace: Observable, language: 'nodejs' | 'csharp' | 'go' | 'java' | 'python'): Promise<any[]> {
    const all: any[] = [];
    const limit = 100;
    let offset = 0;
    let total = 0;

    do {
      const pageSpan = trace.startSpan('events.registry.plugin.list.page', { limit, offset, language });
      const page = await this.registryClient.registryPluginList(trace, { language, limit, offset });
      pageSpan.end();

      all.push(...(page.results || []));
      total = Number(page.total || 0);
      offset += limit;
    } while (offset < total);

    return all;
  }

  private async handlePackageLookup(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const params = this.validateInput(PackageLookupParamsSchema, request.params, reply);
    if (!params) return;

    const packageId = params['*'];

    const trace = this.createTrace('ui.package.lookup', {
      url: request.url,
      method: request.method,
      accept: request.headers.accept || 'text/html',
      language: params.language,
      packageId,
    });
    const span = trace.startSpan('render.package-lookup');

    try {
      const allLanguagePlugins = await this.listAllPluginsByLanguage(trace, params.language);
      const matches = allLanguagePlugins.filter((plugin: any) => {
        const pkg = plugin?.package;
        if (!pkg || typeof pkg !== 'object') return false;
        return String(pkg[params.language] ?? '').trim() === packageId;
      });

      if (!matches.length) {
        if (this.wantsJson(request)) {
          reply.code(404).send({
            error: 'Not Found',
            message: `No package found for ${params.language}/${packageId}`,
          });
        } else {
          await this.renderError(request, reply, 404, 'Package Not Found', `No package found for ${params.language}/${packageId}.`);
        }
        return;
      }

      if (matches.length === 1) {
        const only = matches[0];
        const org = String(only.org || '').trim();
        const name = String(only.name || '').trim();
        if (org && name) {
          const location = `/plugins/${org}/${name}`;
          if (this.wantsJson(request)) {
            reply.send({
              packageId,
              language: params.language,
              total: 1,
              redirect: location,
              plugin: this.enrichPlugin(only),
            });
          } else {
            reply.redirect(location, 307);
          }
          return;
        }
      }

      const enrichedPlugins = this.enrichPluginList(matches);
      if (this.wantsJson(request)) {
        reply.send({
          packageId,
          language: params.language,
          total: matches.length,
          plugins: enrichedPlugins,
        });
      } else {
        await reply.view('pages/plugins.hbs', {
          title: `Package: ${packageId}`,
          activePage: 'browse',
          searchQuery: packageId,
          plugins: enrichedPlugins,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            total: matches.length,
            pageSize: this.pageSize,
          },
          filters: {
            language: params.language,
          },
        });
      }
    } catch (error) {
      trace.log.error('Failed to render package lookup page: {error}', { error: (error as Error).message });
      await this.renderError(request, reply, 500, 'Internal Server Error', 'Something went wrong resolving this package.');
    } finally {
      span.end();
    }
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

