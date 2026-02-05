import * as path from 'path';
import { z } from 'zod';
import {
  BSBService,
  BSBServiceConstructor,
  BSBPluginConfig,
  BSBServiceClientDefinition,
  Observable,
  createFireAndForgetEvent,
  createReturnableEvent,
  createBroadcastEvent,
  type Counter,
  type Histogram,
} from '@bsb/base';
import { TodoStorage, type TodoItem } from './storage';
import { TodoHttpServer } from './http-server';

// ============================================================================
// Schemas
// ============================================================================

/**
 * Todo item schema.
 */
export const TodoItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  completed: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Input schemas for CRUD operations.
 */
export const CreateTodoInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
});

export const GetTodoInputSchema = z.object({
  id: z.string().uuid(),
});

export const UpdateTodoInputSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  completed: z.boolean().optional(),
});

export const DeleteTodoInputSchema = z.object({
  id: z.string().uuid(),
});

export const TodoListSchema = z.object({
  todos: z.array(TodoItemSchema),
  total: z.number(),
});

/**
 * Event schemas for the demo todo app.
 */
export const EventSchemas = {
  // Fire-and-forget notifications this service emits
  emitEvents: {
    'todo.created': createFireAndForgetEvent(TodoItemSchema, 'Emitted when a todo is created'),
    'todo.updated': createFireAndForgetEvent(TodoItemSchema, 'Emitted when a todo is updated'),
    'todo.deleted': createFireAndForgetEvent(
      z.object({ id: z.string().uuid() }),
      'Emitted when a todo is deleted'
    ),
  },

  // Returnable events this service emits (HTTP server calls these internally)
  emitReturnableEvents: {
    'todo.create': createReturnableEvent(
      CreateTodoInputSchema,
      TodoItemSchema,
      'Create a new todo item'
    ),
    'todo.get': createReturnableEvent(GetTodoInputSchema, TodoItemSchema, 'Get a todo by ID'),
    'todo.list': createReturnableEvent(
      z.object({}),
      TodoListSchema,
      'List all todos'
    ),
    'todo.update': createReturnableEvent(
      UpdateTodoInputSchema,
      TodoItemSchema,
      'Update a todo item'
    ),
    'todo.delete': createReturnableEvent(
      DeleteTodoInputSchema,
      z.object({ success: z.boolean() }),
      'Delete a todo item'
    ),
  },

  // Returnable events this service listens to (handled by event handlers)
  onReturnableEvents: {
    'todo.create': createReturnableEvent(
      CreateTodoInputSchema,
      TodoItemSchema,
      'Create a new todo item'
    ),
    'todo.get': createReturnableEvent(GetTodoInputSchema, TodoItemSchema, 'Get a todo by ID'),
    'todo.list': createReturnableEvent(
      z.object({}),
      TodoListSchema,
      'List all todos'
    ),
    'todo.update': createReturnableEvent(
      UpdateTodoInputSchema,
      TodoItemSchema,
      'Update a todo item'
    ),
    'todo.delete': createReturnableEvent(
      DeleteTodoInputSchema,
      z.object({ success: z.boolean() }),
      'Delete a todo item'
    ),
  },

  // Broadcast events this service emits
  emitBroadcast: {
    'todo.stats': createBroadcastEvent(
      z.object({
        total: z.number(),
        completed: z.number(),
        pending: z.number(),
        timestamp: z.string().datetime(),
      }),
      'Broadcast todo statistics'
    ),
  },
} as const;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration schema for demo todo app.
 */
export const TodoConfigSchema = z.object({
  storage: z.object({
    path: z.string().default('./.temp/demo-todos.json'),
    autoSaveInterval: z.number().min(1000).default(5000),
    prettyPrint: z.boolean().default(true),
  }),
  http: z.object({
    port: z.number().min(1).max(65535).default(3000),
    host: z.string().default('0.0.0.0'),
    cors: z.boolean().default(true),
  }),
  features: z.object({
    statsInterval: z.number().min(0).default(30),
    maxTodos: z.number().min(1).default(1000),
  }),
});

export type TodoConfig = z.infer<typeof TodoConfigSchema>;

/**
 * Config class for demo todo app.
 */
export class Config extends BSBPluginConfig<typeof TodoConfigSchema> {
  validationSchema = TodoConfigSchema;
}

// ============================================================================
// Plugin
// ============================================================================

/**
 * Demo Todo App Plugin
 *
 * A comprehensive demonstration of BSB best practices including:
 * - Schema-first event architecture with Zod validation
 * - File-based JSON storage following observable-logging-file pattern
 * - Simple HTTP server with REST API
 * - Responsive web interface
 * - Observable pattern for logging, metrics, and tracing
 * - Event-driven CRUD operations
 */
export class Plugin extends BSBService<Config, typeof EventSchemas> {
  public static PLUGIN_CLIENT: BSBServiceClientDefinition = {
    name: 'service-demo-todo',
  };

  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  private storage!: TodoStorage;
  private httpServer: TodoHttpServer;
  private statsTimer?: NodeJS.Timeout;

  // Metrics
  private todoCounter?: Counter<string>;
  private requestCounter?: Counter<string>;
  private requestDuration?: Histogram<string>;

  constructor(config: BSBServiceConstructor<Config, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas,
    });

    // Create storage client in constructor (following pattern)
    // Note: Logger will be set in init() when Observable is available
    this.storage = new TodoStorage(this.cwd, this.config.storage, {
      info: (msg: string) => console.log(`[TodoStorage] ${msg}`),
      error: (msg: string) => console.error(`[TodoStorage] ${msg}`),
      debug: (msg: string) => console.log(`[TodoStorage] ${msg}`),
    });
    // Create HTTP server with correct plugin static path
    const staticPath = path.join(this.pluginCwd, 'static');
    this.httpServer = new TodoHttpServer(
      this.config.http,
      staticPath,
      this.handleApiRequest.bind(this)
    );
  }

  /**
   * Initialize resources and register event handlers.
   */
  async init(obs: Observable): Promise<void> {
    obs.log.info('Initializing demo-todo-app');

    // Create metrics
    this.todoCounter = obs.metrics.counter('demo_todo_total', 'Total number of todos', 'Counter');
    this.requestCounter = obs.metrics.counter(
      'demo_http_requests_total',
      'Total HTTP requests',
      'Counter',
      ['method', 'path']
    );
    this.requestDuration = obs.metrics.histogram(
      'demo_http_request_duration_ms',
      'HTTP request duration in milliseconds',
      'Histogram',
      [10, 50, 100, 500, 1000]
    );

    // Initialize storage (heavy I/O happens here)
    await this.storage.init();

    // Update initial metrics
    const stats = this.storage.getStats();
    this.todoCounter?.increment(stats.total);

    // Register event handlers
    await this.registerEventHandlers(obs);

    obs.log.info('Demo-todo-app initialized successfully');
  }

  /**
   * Start the HTTP server and stats broadcaster.
   */
  async run(obs: Observable): Promise<void> {
    obs.log.info('Starting demo-todo-app');

    // Start HTTP server
    await this.httpServer.start(obs, (name, attributes) => {
      const trace = this.__internalObservable.createTrace(name, attributes ?? {});
      return this.createObservable(trace.trace, attributes ?? {});
    });

    // Start stats broadcaster
    if (this.config.features.statsInterval > 0) {
      this.statsTimer = setInterval(() => {
        const stats = this.storage.getStats();
        this.events.emitBroadcast('todo.stats', obs, stats).catch((err: Error) => {
          obs.log.error(`Failed to broadcast stats: ${err.message}`);
        });
      }, this.config.features.statsInterval * 1000);

      obs.log.info(`Stats broadcaster started (interval: ${this.config.features.statsInterval}s)`);
    }

    obs.log.info('Demo-todo-app started successfully');
  }

  /**
   * Cleanup resources.
   */
  dispose(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = undefined;
    }

    if (this.httpServer) {
      this.httpServer.stop();
    }

    if (this.storage) {
      this.storage.dispose(); // Final save happens here
    }
  }

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  /**
   * Register all event handlers.
   */
  private async registerEventHandlers(obs: Observable): Promise<void> {
    // Create todo
    await this.events.onReturnableEvent('todo.create', obs, async (eventObs: Observable, data) => {
      eventObs.log.info(`Creating todo: ${data.title}`);

      // Check max todos limit
      const stats = this.storage.getStats();
      if (stats.total >= this.config.features.maxTodos) {
        throw new Error(`Maximum number of todos reached (${this.config.features.maxTodos})`);
      }

      // Create todo
      const todo = this.storage.create(data.title, data.description);

      // Update metrics
      this.todoCounter?.increment(1);

      // Emit notification event
      await this.events.emitEvent('todo.created', eventObs, todo);

      eventObs.log.info(`Todo created: ${todo.id}`);
      return todo;
    });

    // Get todo
    await this.events.onReturnableEvent('todo.get', obs, async (eventObs: Observable, data) => {
      eventObs.log.debug(`Getting todo: ${data.id}`);

      const todo = this.storage.get(data.id);
      if (!todo) {
        throw new Error(`Todo not found: ${data.id}`);
      }

      return todo;
    });

    // List todos
    await this.events.onReturnableEvent('todo.list', obs, async (eventObs: Observable, _data) => {
      eventObs.log.debug('Listing todos');

      const todos = this.storage.list();
      return {
        todos,
        total: todos.length,
      };
    });

    // Update todo
    await this.events.onReturnableEvent('todo.update', obs, async (eventObs: Observable, data) => {
      eventObs.log.info(`Updating todo: ${data.id}`);

      const { id, ...updates } = data;
      const todo = this.storage.update(id, updates);

      // Emit notification event
      await this.events.emitEvent('todo.updated', eventObs, todo);

      eventObs.log.info(`Todo updated: ${todo.id}`);
      return todo;
    });

    // Delete todo
    await this.events.onReturnableEvent('todo.delete', obs, async (eventObs: Observable, data) => {
      eventObs.log.info(`Deleting todo: ${data.id}`);

      const success = this.storage.delete(data.id);
      if (!success) {
        throw new Error(`Todo not found: ${data.id}`);
      }

      // Update metrics
      this.todoCounter?.increment(-1);

      // Emit notification event
      await this.events.emitEvent('todo.deleted', eventObs, { id: data.id });

      eventObs.log.info(`Todo deleted: ${data.id}`);
      return { success };
    });

    obs.log.info('Event handlers registered');
  }

  // ==========================================================================
  // HTTP API Handler
  // ==========================================================================

  /**
   * Handle API requests from HTTP server.
   */
  private async handleApiRequest(
    method: string,
    url: string,
    body: any,
    obs: Observable
  ): Promise<{ status: number; data: any }> {
    const startTime = Date.now();

    try {
      // Update metrics
      this.requestCounter?.increment(1, { method, path: url });

      // Route API requests
      if (method === 'GET' && url === '/api/todos') {
        const result = await this.events.emitEventAndReturn('todo.list', obs, {});
        return { status: 200, data: result };
      }

      if (method === 'POST' && url === '/api/todos') {
        const result = await this.events.emitEventAndReturn('todo.create', obs, body);
        return { status: 201, data: result };
      }

      if (method === 'GET' && url.startsWith('/api/todos/')) {
        const id = url.split('/')[3];
        const result = await this.events.emitEventAndReturn('todo.get', obs, { id });
        return { status: 200, data: result };
      }

      if (method === 'PATCH' && url.startsWith('/api/todos/')) {
        const id = url.split('/')[3];
        const result = await this.events.emitEventAndReturn('todo.update', obs, { id, ...body });
        return { status: 200, data: result };
      }

      if (method === 'DELETE' && url.startsWith('/api/todos/')) {
        const id = url.split('/')[3];
        const result = await this.events.emitEventAndReturn('todo.delete', obs, { id });
        return { status: 200, data: result };
      }

      // Not found
      return { status: 404, data: { error: 'Not Found' } };
    } catch (error: any) {
      obs.log.error(`API error: ${error.message}`);
      return { status: 400, data: { error: error.message } };
    } finally {
      // Record duration
      const duration = Date.now() - startTime;
      this.requestDuration?.record(duration, { method, path: url });
    }
  }
}

// Export plugin factory
export default Plugin;
