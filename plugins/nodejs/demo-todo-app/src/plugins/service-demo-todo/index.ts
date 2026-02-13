import * as path from 'path';
import { z } from 'zod';
import {
  BSBService,
  BSBServiceConstructor,
  Observable,
  createFireAndForgetEvent,
  createReturnableEvent,
  createBroadcastEvent,
  createEventSchemas,
  createConfigSchema,
  type Counter,
  type Histogram,
  BSBError,
  bsb,
  optional,
  type InferBSBType,
} from '@bsb/base';
import { TodoStorage } from './storage';
import { TodoHttpServer } from './http-server';

// ============================================================================
// Schemas - Using BSB Types for Cross-Language Support
// ============================================================================

/**
 * Todo item schema.
 * Uses BSB types for cross-language support (can be called from C#, Go, Java, etc.)
 */
export const TodoItemSchema = bsb.object({
  id: bsb.uuid('The unique identifier of the todo item'),
  title: bsb.string({ min: 1, max: 200, description: 'The title of the todo item' }),
  description: optional(bsb.string({ max: 1000, description: 'The description of the todo item' })),
  completed: bsb.boolean('Whether the todo item is completed'),
  createdAt: bsb.datetime('The date and time the todo item was created'),
  updatedAt: bsb.datetime('The date and time the todo item was last updated'),
}, 'Todo item');

/**
 * Input schemas for CRUD operations.
 */
export const CreateTodoInputSchema = bsb.object({
  title: bsb.string({ min: 1, max: 200, description: 'The title of the todo item' }),
  description: optional(bsb.string({ max: 1000, description: 'The description of the todo item' })),
}, 'Input for creating a todo item');

export const GetTodoInputSchema = bsb.object({
  id: bsb.uuid('The unique identifier of the todo item'),
}, 'Input for getting a todo item by ID');

export const UpdateTodoInputSchema = bsb.object({
  id: bsb.uuid('The unique identifier of the todo item'),
  title: optional(bsb.string({ min: 1, max: 200, description: 'The title of the todo item' })),
  description: optional(bsb.string({ max: 1000, description: 'The description of the todo item' })),
  completed: optional(bsb.boolean('Whether the todo item is completed')),
}, 'Input for updating a todo item');

export const DeleteTodoInputSchema = bsb.object({
  id: bsb.uuid('The unique identifier of the todo item'),
}, 'Input for deleting a todo item');

export const TodoListSchema = bsb.object({
  todos: bsb.array(TodoItemSchema, { description: 'The list of todo items' }),
  total: bsb.int32({ min: 0, description: 'The total number of todo items' }),
}, 'List of todo items with total count');

// Result schemas for operation responses
export const DeleteTodoResultSchema = bsb.object({
  success: bsb.boolean('Whether the deletion was successful'),
}, 'Result of deleting a todo item');

export const TodoStatsSchema = bsb.object({
  total: bsb.int32({ min: 0, description: 'Total number of todos' }),
  completed: bsb.int32({ min: 0, description: 'Number of completed todos' }),
  pending: bsb.int32({ min: 0, description: 'Number of pending todos' }),
  timestamp: bsb.datetime('Timestamp when stats were generated'),
}, 'Todo statistics');

export const EmptyInputSchema = bsb.object({}, 'Empty input object');

/**
 * Event schemas for the demo todo app.
 * v9: Uses BSB types for cross-language support (C#, Go, Java, etc. can consume these events)
 */
export const EventSchemas = createEventSchemas({
  // Fire-and-forget notifications this service emits
  emitEvents: {
    'todo.created': createFireAndForgetEvent(TodoItemSchema, 'Emitted when a todo is created'),
    'todo.updated': createFireAndForgetEvent(TodoItemSchema, 'Emitted when a todo is updated'),
    'todo.deleted': createFireAndForgetEvent(
      bsb.object({ id: bsb.uuid('Todo ID') }, 'Deleted todo identifier'),
      'Emitted when a todo is deleted'
    ),
  },

  // Returnable events this service emits
  emitReturnableEvents: {
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
      EmptyInputSchema,
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
      DeleteTodoResultSchema,
      'Delete a todo item'
    ),
  },

  // Broadcast events this service emits
  emitBroadcast: {
    'todo.stats': createBroadcastEvent(
      TodoStatsSchema,
      'Broadcast todo statistics'
    ),
  },
});

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
 * Config for demo todo app.
 * v9: Created with createConfigSchema() for automatic metadata support.
 * Note: version/author/license come from package.json, not Config.
 */
export const Config = createConfigSchema(
  {
    name: 'Demo Todo App',
    description: 'Demo Todo Service showcasing BSB v9 best practices with cross-language event support',
    tags: ['demo', 'todo', 'example', 'crud', 'http', 'bsb-types'],
  },
  TodoConfigSchema
);

// ============================================================================
// Plugin
// ============================================================================

/**
 * Demo Todo App Plugin
 *
 * A comprehensive demonstration of BSB v9 best practices including:
 * - Cross-language event schemas using BSB types (can be consumed by C#, Go, Java, etc.)
 * - Type-safe event definitions with compile-time validation
 * - File-based JSON storage following observable-logging-file pattern
 * - Simple HTTP server with REST API
 * - Responsive web interface
 * - Observable pattern for logging, metrics, and tracing
 * - Event-driven CRUD operations with self-invocation pattern
 * - v9 patterns: createEventSchemas, createConfigSchema, BSB types, auto-generated PLUGIN_CLIENT
 */
export class Plugin extends BSBService<InstanceType<typeof Config>, typeof EventSchemas> {
  // v9: Required static properties for auto-generation
  static Config = Config;
  static EventSchemas = EventSchemas;
  // PLUGIN_CLIENT is now auto-generated from Config.metadata

  public initBeforePlugins?: string[] | undefined;
  public initAfterPlugins?: string[] | undefined;
  public runBeforePlugins?: string[] | undefined;
  public runAfterPlugins?: string[] | undefined;

  private storage!: TodoStorage;
  private httpServer: TodoHttpServer;
  private statsTimer?: NodeJS.Timeout;
  private self;

  // Metrics
  private todoCounter?: Counter<string>;
  private requestCounter?: Counter<string>;
  private requestDuration?: Histogram<string>;

  constructor(config: BSBServiceConstructor<InstanceType<typeof Config>, typeof EventSchemas>) {
    super({
      ...config,
      eventSchemas: EventSchemas,
    });

    // Create self-invocation client for HTTP handler to call own events
    this.self = this.createSelf();

    // Create storage client in constructor (no obs available yet)
    this.storage = new TodoStorage(this.cwd, this.config.storage);
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

    // Initialize storage (heavy I/O happens here, pass obs for logging)
    await this.storage.init(obs);

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
      return this.createTrace(name, attributes);
    });

    // Start stats broadcaster
    if (this.config.features.statsInterval > 0) {
      this.statsTimer = setInterval(() => {
        const stats = this.storage.getStats();
        this.events.emitBroadcast('todo.stats', obs, stats).catch((err: Error) => {
          obs.log.error('Failed to broadcast stats: {message}', { message: err.message });
        });
      }, this.config.features.statsInterval * 1000);

      obs.log.info('Stats broadcaster started (interval: {interval}s)', {
        interval: this.config.features.statsInterval
      });
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
    await this.events.onReturnableEvent('todo.create', obs, async (eventObs, data) => {
      eventObs.log.info('Creating todo: {title}', { title: data.title });

      // Check max todos limit
      const maxSpan = obs.startSpan('todo.create.maxcheck', {
        maxTodos: this.config.features.maxTodos,
      });
      const stats = this.storage.getStats();
      if (stats.total >= this.config.features.maxTodos) {
        const error = new BSBError(obs.trace, 'Maximum number of todos reached ({maxTodos})', {
          maxTodos: this.config.features.maxTodos,
        });
        maxSpan.error(error);
        throw error;
      }
      maxSpan.end();

      // Create todo - storage.create will create its own child span
      const todo = this.storage.create(eventObs, data.title, data.description);

      // Update metrics
      this.todoCounter?.increment(1);

      // Emit notification event
      await this.events.emitEvent('todo.created', eventObs, todo);

      eventObs.log.info('Todo created: {id}', { id: todo.id });
      return todo;
    });

    // Get todo
    await this.events.onReturnableEvent('todo.get', obs, async (eventObs, data) => {
      eventObs.log.debug('Getting todo: {id}', { id: data.id });

      const todo = this.storage.get(eventObs, data.id);
      if (!todo) {
        throw new Error(`Todo not found: ${data.id}`);
      }

      return todo;
    });

    // List todos
    await this.events.onReturnableEvent('todo.list', obs, async (eventObs) => {
      eventObs.log.debug('Listing todos');

      const todos = this.storage.list(eventObs);
      return {
        todos,
        total: todos.length,
      };
    });

    // Update todo
    await this.events.onReturnableEvent('todo.update', obs, async (eventObs, data) => {
      eventObs.log.info('Updating todo: {id}', { id: data.id });

      const { id, ...updates } = data;
      const todo = this.storage.update(eventObs, id, updates);

      // Emit notification event
      await this.events.emitEvent('todo.updated', eventObs, todo);

      eventObs.log.info('Todo updated: {id}', { id: todo.id });
      return todo;
    });

    // Delete todo
    await this.events.onReturnableEvent('todo.delete', obs, async (eventObs, data) => {
      eventObs.log.info('Deleting todo: {id}', { id: data.id });

      const success = this.storage.delete(eventObs, data.id);
      if (!success) {
        throw new Error(`Todo not found: ${data.id}`);
      }

      // Update metrics
      this.todoCounter?.increment(-1);

      // Emit notification event
      await this.events.emitEvent('todo.deleted', eventObs, { id: data.id });

      eventObs.log.info('Todo deleted: {id}', { id: data.id });
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
      // Use self for explicit self-invocation (HTTP consuming own event API)
      if (method === 'GET' && url === '/api/todos') {
        const result = await this.self.events.emitEventAndReturn('todo.list', obs, {});
        return { status: 200, data: result };
      }

      if (method === 'POST' && url === '/api/todos') {
        const result = await this.self.events.emitEventAndReturn('todo.create', obs, body);
        return { status: 201, data: result };
      }

      if (method === 'GET' && url.startsWith('/api/todos/')) {
        const id = url.split('/')[3];
        const result = await this.self.events.emitEventAndReturn('todo.get', obs, { id });
        return { status: 200, data: result };
      }

      if (method === 'PATCH' && url.startsWith('/api/todos/')) {
        const id = url.split('/')[3];
        const result = await this.self.events.emitEventAndReturn('todo.update', obs, { id, ...body });
        return { status: 200, data: result };
      }

      if (method === 'DELETE' && url.startsWith('/api/todos/')) {
        const id = url.split('/')[3];
        const result = await this.self.events.emitEventAndReturn('todo.delete', obs, { id });
        return { status: 200, data: result };
      }

      // Not found
      return { status: 404, data: { error: 'Not Found' } };
    } catch (error: any) {
      obs.log.error('API error: {message}', { message: error.message });
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
