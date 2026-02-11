import Fastify, { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Observable } from '@bsb/base';

export interface HttpServerConfig {
  port: number;
  host: string;
  cors: boolean;
}

export type ApiHandler = (
  method: string,
  url: string,
  body: any,
  obs: Observable
) => Promise<{ status: number; data: any }>;

export type TraceCreator = (name: string, attributes?: Record<string, string | number | boolean>) => Observable;

/**
 * Fastify-based HTTP server for the demo todo app.
 *
 * Features:
 * - Static file serving from static/ directory
 * - REST API routing
 * - CORS support (configurable)
 * - Observable integration for request tracing
 * - Each request gets its own root trace
 */
export class TodoHttpServer {
  private server?: FastifyInstance;
  private createTrace?: TraceCreator;

  constructor(
    private config: HttpServerConfig,
    private staticPath: string,
    private apiHandler: ApiHandler
  ) {}

  /**
   * Start the HTTP server.
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
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type'],
      });
    }

    // Register static file serving
    await this.server.register(fastifyStatic, {
      root: this.staticPath,
      prefix: '/',
    });

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

    // API Routes
    this.server.get('/api/todos', async (request, reply) => {
      return this.handleApiRequest('GET', '/api/todos', null, (request as any).obs, reply);
    });

    this.server.post('/api/todos', async (request, reply) => {
      return this.handleApiRequest('POST', '/api/todos', request.body, (request as any).obs, reply);
    });

    this.server.get('/api/todos/:id', async (request, reply) => {
      return this.handleApiRequest('GET', `/api/todos/${(request.params as any).id}`, null, (request as any).obs, reply);
    });

    this.server.patch('/api/todos/:id', async (request, reply) => {
      return this.handleApiRequest('PATCH', `/api/todos/${(request.params as any).id}`, request.body, (request as any).obs, reply);
    });

    this.server.delete('/api/todos/:id', async (request, reply) => {
      return this.handleApiRequest('DELETE', `/api/todos/${(request.params as any).id}`, null, (request as any).obs, reply);
    });

    // Error handler
    this.server.setErrorHandler((error: Error, request, reply) => {
      const reqObs = (request as any).obs as Observable;
      reqObs.error(error);

      reply.status(500).send({
        error: error.message || 'Internal Server Error',
      });
    });

    // Start server
    try {
      await this.server.listen({
        port: this.config.port,
        host: this.config.host,
      });
      obs.log.info(`HTTP server listening on http://${this.config.host}:${this.config.port}`);
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
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = undefined;
    }
  }

  /**
   * Handle API requests.
   */
  private async handleApiRequest(
    method: string,
    url: string,
    body: any,
    obs: Observable,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Call API handler with Observable for tracing
      const result = await this.apiHandler(method, url, body, obs);

      // Send response
      reply.status(result.status).send(result.data);
    } catch (error: any) {
      obs.error(error);
      reply.status(error.status || 400).send({ error: error.message });
    }
  }
}
