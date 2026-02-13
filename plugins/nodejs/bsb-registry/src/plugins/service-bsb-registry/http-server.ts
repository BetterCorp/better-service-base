import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Observable } from '@bsb/base';

export interface HttpServerConfig {
  port: number;
  host: string;
  cors: boolean;
}

export type RouteHandler = (
  request: FastifyRequest,
  reply: FastifyReply,
  obs: Observable
) => Promise<void>;

export type TraceCreator = (name: string, attributes?: Record<string, string | number | boolean>) => Observable;

/**
 * Fastify-based HTTP server for the BSB Registry.
 *
 * Features:
 * - REST API routing for plugin registry operations
 * - CORS support (configurable)
 * - Bearer token authentication for write operations
 * - Observable integration for request tracing
 * - Each request gets its own root trace
 */
export class RegistryHttpServer {
  private server?: FastifyInstance;
  private createTrace?: TraceCreator;
  private routes: Map<string, { method: string; handler: RouteHandler; requireAuth?: boolean }> = new Map();
  private authTokens: Set<string> = new Set();

  constructor(private config: HttpServerConfig) {}

  /**
   * Set authentication tokens
   */
  setAuthTokens(tokens: string[]): void {
    this.authTokens = new Set(tokens);
  }

  /**
   * Register a route handler
   */
  registerRoute(
    method: string,
    path: string,
    handler: RouteHandler,
    requireAuth: boolean = false
  ): void {
    const key = `${method}:${path}`;
    this.routes.set(key, { method, handler, requireAuth });
  }

  /**
   * Start the HTTP server
   */
  async start(obs: Observable, createTrace: TraceCreator): Promise<void> {
    this.createTrace = createTrace;

    // Create Fastify instance
    this.server = Fastify({
      logger: false, // We use BSB Observable for logging
    });

    // Enable CORS if configured
    if (this.config.cors) {
      await this.server.register(import('@fastify/cors'), {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });
    }

    // Add hook to create trace for each request
    this.server.addHook('onRequest', async (request, reply) => {
      const startTime = Date.now();

      // Create a new root trace for this request
      const reqObs = this.createTrace!('http_request', {
        'http_method': request.method,
        'http_url': request.url,
        'http_user_agent': request.headers['user-agent'] || 'unknown',
      });

      // Store Observable in request for use in handlers
      (request as any).obs = reqObs;

      // Log when response is sent
      reply.raw.on('finish', () => {
        const duration = Date.now() - startTime;
        reqObs.log.info(`[{method}] [{url}] - [{statusCode}] [{duration}ms]`, {
          method: request.method,
          url: request.url,
          statusCode: reply.statusCode,
          duration,
        });
        reqObs.end({ duration, statusCode: reply.statusCode });
      });
    });

    // Register all routes
    this.registerAllRoutes();

    // Global error handler
    this.server.setErrorHandler((error: any, request, reply) => {
      const reqObs = (request as any).obs as Observable;
      reqObs.error(error);

      const statusCode = error.statusCode || 500;
      reply.status(statusCode).send({
        error: error.message || 'Internal Server Error',
        code: error.code,
      });
    });

    // Start server
    try {
      await this.server.listen({
        port: this.config.port,
        host: this.config.host,
      });
      obs.log.info(`Registry HTTP server listening on http://${this.config.host}:${this.config.port}`);
    } catch (error: any) {
      if (error.code === 'EADDRINUSE') {
        obs.log.error(`Port ${this.config.port} is already in use`);
      } else {
        obs.log.error(`Server error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Stop the HTTP server
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = undefined;
    }
  }

  /**
   * Register all routes with Fastify
   */
  private registerAllRoutes(): void {
    if (!this.server) return;

    for (const [key, config] of this.routes.entries()) {
      const { method, handler, requireAuth } = config;
      const path = key.substring(method.length + 1); // Remove "METHOD:" prefix

      const wrappedHandler = async (request: FastifyRequest, reply: FastifyReply) => {
        const obs = (request as any).obs as Observable;

        try {
          // Check authentication if required
          if (requireAuth && !this.isAuthenticated(request)) {
            reply.status(401).send({
              error: 'Unauthorized',
              code: 'UNAUTHORIZED',
            });
            return;
          }

          // Call the actual handler
          await handler(request, reply, obs);
        } catch (error: any) {
          obs.error(error);
          const statusCode = error.statusCode || 500;
          reply.status(statusCode).send({
            error: error.message || 'Internal Server Error',
            code: error.code,
          });
        }
      };

      // Register with Fastify based on method
      switch (method.toUpperCase()) {
        case 'GET':
          this.server.get(path, wrappedHandler);
          break;
        case 'POST':
          this.server.post(path, wrappedHandler);
          break;
        case 'PUT':
          this.server.put(path, wrappedHandler);
          break;
        case 'DELETE':
          this.server.delete(path, wrappedHandler);
          break;
        default:
          throw new Error(`Unsupported HTTP method: ${method}`);
      }
    }
  }

  /**
   * Check if request is authenticated
   */
  private isAuthenticated(request: FastifyRequest): boolean {
    const authHeader = request.headers.authorization;
    if (!authHeader) return false;

    // Check for Bearer token
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return false;

    const token = match[1];
    return this.authTokens.has(token);
  }
}
