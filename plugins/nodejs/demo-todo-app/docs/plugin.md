# BSB Demo Todo App

A comprehensive demonstration application that showcases Best Service Base (BSB) best practices through a fully-functional todo application with CRUD operations, file-based storage, HTTP server, and responsive web interface.

## Overview

The Demo Todo App is designed as a reference implementation for BSB developers, demonstrating key patterns and practices in a real-world application context. It combines multiple BSB concepts into a single, cohesive plugin that's easy to understand and use as a learning resource.

### What Makes This Demo Valuable

- **Complete Example**: Shows how all BSB components work together in a real application
- **Best Practices**: Follows established patterns from core BSB plugins
- **Self-Contained**: Works out-of-the-box with zero external dependencies (except BSB core)
- **Interactive**: Provides a visual web interface to see BSB events in action
- **Educational**: Well-commented code suitable for learning

### Key Features

✅ **Schema-First Events** - All events defined with Zod, automatic validation
✅ **File-Based Storage** - Persistent JSON storage following BSB patterns
✅ **HTTP REST API** - Simple server with proper routing and CORS
✅ **Web Interface** - Responsive single-page application
✅ **Observable Integration** - Full logging, metrics, and tracing
✅ **Real-Time Updates** - Live statistics and event logging
✅ **Production-Ready Patterns** - Proper lifecycle, error handling, cleanup

### BSB Patterns Demonstrated

This demo showcases **10 critical BSB patterns**:

1. **Schema-First Events**: Zod validation for all event inputs/outputs
2. **Client Pattern**: Storage client created in constructor
3. **Resource Lifecycle**: Proper init/run/dispose with cleanup
4. **Observable Integration**: Logging, metrics, tracing throughout
5. **Configuration**: Zod schema with sensible defaults
6. **File Storage**: Following observable-logging-file pattern
7. **Event Types**: Fire-and-forget, returnable, and broadcast events
8. **Metrics**: Counters and histograms for monitoring
9. **Distributed Tracing**: Spans for HTTP requests and operations
10. **Resource Context**: Automatic from plugin configuration

---

## Installation

### Prerequisites

Ensure you have the following BSB plugins enabled:

- `observable-default` (or another Observable implementation)
- `events-default` (or another Events implementation)

### Install the Plugin

```bash
npm install @bsb/demo-todo-app
```

Or install from source:

```bash
cd plugins/nodejs/demo-todo-app
npm install
npm run build
```

## Configuration

Add to your BSB `sec-config.yaml`:

```yaml
default:
  # Required dependencies
  observable:
    observable-default:
      plugin: observable-default
      enabled: true

  events:
    events-default:
      plugin: events-default
      enabled: true

  # Demo Todo App
  services:
    service-demo-todo:
      plugin: service-demo-todo
      enabled: true
      config:
        storage:
          path: "./.temp/demo-todos.json"
          autoSaveInterval: 5000
          prettyPrint: true
        http:
          port: 3000
          host: "0.0.0.0"
          cors: true
        features:
          statsInterval: 30
          maxTodos: 1000
```

### Configuration Options

#### Storage Settings

- **`path`** (string, default: `"./.temp/demo-todos.json"`)
  - Path to JSON storage file (relative to working directory)
  - Directory will be created automatically if it doesn't exist

- **`autoSaveInterval`** (number, default: `5000`)
  - Auto-save interval in milliseconds
  - Minimum: 1000ms (1 second)

- **`prettyPrint`** (boolean, default: `true`)
  - Format JSON with indentation for readability
  - Set to `false` for compact storage

#### HTTP Settings

- **`port`** (number, default: `3000`)
  - HTTP server port (1-65535)
  - Change if port is already in use

- **`host`** (string, default: `"0.0.0.0"`)
  - HTTP server bind address
  - Use `"127.0.0.1"` for localhost-only access

- **`cors`** (boolean, default: `true`)
  - Enable CORS headers for cross-origin requests
  - Useful for development and API testing

#### Feature Settings

- **`statsInterval`** (number, default: `30`)
  - Broadcast statistics every N seconds
  - Set to `0` to disable periodic broadcasts

- **`maxTodos`** (number, default: `1000`)
  - Maximum number of todos allowed
  - Prevents excessive storage usage

## Usage

### Starting the Application

```bash
bsb start
```

The application will:
1. Initialize storage and load existing todos
2. Register event handlers
3. Start the HTTP server
4. Begin broadcasting statistics (if enabled)

### Accessing the Web Interface

Open your browser to: **http://localhost:3000**

The web interface provides:
- Real-time statistics (total, pending, completed)
- Add new todos with title and optional description
- Filter todos by status (all, pending, completed)
- Toggle completion status
- Delete todos
- Live event log showing BSB events

### Using the REST API

#### List All Todos

```bash
curl http://localhost:3000/api/todos
```

Response:
```json
{
  "todos": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Learn BSB",
      "description": "Study the demo app",
      "completed": false,
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "total": 1
}
```

#### Create a Todo

```bash
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn BSB", "description": "Study the demo app"}'
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Learn BSB",
  "description": "Study the demo app",
  "completed": false,
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

#### Get a Specific Todo

```bash
curl http://localhost:3000/api/todos/550e8400-e29b-41d4-a716-446655440000
```

#### Update a Todo

```bash
curl -X PATCH http://localhost:3000/api/todos/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

You can update:
- `title` (string, 1-200 characters)
- `description` (string, 0-1000 characters)
- `completed` (boolean)

#### Delete a Todo

```bash
curl -X DELETE http://localhost:3000/api/todos/550e8400-e29b-41d4-a716-446655440000
```

Response:
```json
{
  "success": true
}
```

## Events API

The demo app exposes several events that other BSB services can interact with.

### Returnable Events (CRUD Operations)

#### `todo.create`

Create a new todo item.

**Input:**
```typescript
{
  title: string,        // 1-200 characters, required
  description?: string  // 0-1000 characters, optional
}
```

**Output:** `TodoItem`

**Example:**
```typescript
const todo = await emitEventAndReturn('todo.create', obs, {
  title: 'Complete project',
  description: 'Finish all remaining tasks'
});
```

#### `todo.get`

Get a todo by ID.

**Input:**
```typescript
{
  id: string  // UUID format
}
```

**Output:** `TodoItem`

#### `todo.list`

List all todos.

**Input:** `{}`

**Output:**
```typescript
{
  todos: TodoItem[],
  total: number
}
```

#### `todo.update`

Update a todo item.

**Input:**
```typescript
{
  id: string,           // UUID format, required
  title?: string,       // 1-200 characters
  description?: string, // 0-1000 characters
  completed?: boolean
}
```

**Output:** `TodoItem` (updated)

#### `todo.delete`

Delete a todo item.

**Input:**
```typescript
{
  id: string  // UUID format
}
```

**Output:**
```typescript
{
  success: boolean
}
```

### Fire-and-Forget Events (Notifications)

These events are emitted automatically when CRUD operations occur:

- **`todo.created`** - Emitted when a todo is created
  - Payload: `TodoItem`

- **`todo.updated`** - Emitted when a todo is updated
  - Payload: `TodoItem`

- **`todo.deleted`** - Emitted when a todo is deleted
  - Payload: `{ id: string }`

**Example - Listening to notifications:**
```typescript
onEvent('todo.created', async (todo, obs) => {
  obs.log.info(`New todo created: ${todo.title}`);
  // Send notification, update cache, etc.
});
```

### Broadcast Events

#### `todo.stats`

Periodic broadcast of todo statistics (if `statsInterval > 0`).

**Payload:**
```typescript
{
  total: number,
  completed: number,
  pending: number,
  timestamp: string  // ISO datetime
}
```

**Example - Listening to broadcasts:**
```typescript
onBroadcast('todo.stats', async (stats, obs) => {
  obs.log.info(`Current stats: ${stats.pending} pending, ${stats.completed} completed`);
});
```

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────┐
│                  HTTP Requests                       │
└──────────────────┬──────────────────────────────────┘
                   │
            ┌──────▼───────┐
            │ HTTP Server  │
            │ (Port 3000)  │
            └──────┬───────┘
                   │
         ┌─────────▼──────────┐
         │   API Handler      │
         │ (Event Emitter)    │
         └─────────┬──────────┘
                   │
            ┌──────▼───────┐
            │ Event System │
            │  (BSB Core)  │
            └──────┬───────┘
                   │
         ┌─────────▼──────────┐
         │  Event Handlers    │
         │ (CRUD Operations)  │
         └─────────┬──────────┘
                   │
         ┌─────────▼──────────┐
         │  Storage Client    │
         │ (Map + File I/O)   │
         └─────────┬──────────┘
                   │
            ┌──────▼───────┐
            │  File System │
            │ (.temp/...)  │
            └──────────────┘
```

### Data Flow

#### Create Todo Flow

```
1. POST /api/todos
   ↓
2. HTTP Server receives request
   ↓
3. API Handler parses body
   ↓
4. emitEventAndReturn('todo.create', { title, description })
   ↓
5. Event handler validates input (Zod)
   ↓
6. Storage.create() adds to map, marks dirty
   ↓
7. emitEvent('todo.created', todo)
   ↓
8. Returns todo to API Handler
   ↓
9. HTTP Server sends JSON response
   ↓
10. Auto-save writes to disk (within 5s)
```

### Storage Strategy

The storage client uses a **two-tier approach**:

1. **In-Memory Map**: Fast read/write operations
2. **File Persistence**: Periodic auto-save + final save on dispose

This provides:
- ⚡ Fast performance for frequent operations
- 💾 Durability through persistent storage
- 🔄 Automatic recovery on restart
- 🛡️ Data safety with final save on shutdown

## Metrics

The demo app exposes metrics that can be monitored:

### Counters

- **`demo_todo_total`**
  - Total number of todos
  - Increments on create, decrements on delete

- **`demo_http_requests_total`**
  - Total HTTP requests received
  - Labels: `method`, `path`

### Histograms

- **`demo_http_request_duration_ms`**
  - HTTP request duration in milliseconds
  - Buckets: [10, 50, 100, 500, 1000]
  - Labels: `method`, `path`

## Best Practices Reference

### 1. Constructor Pattern

```typescript
constructor(config: BSBServiceConstructor) {
  super({ ...config, eventSchemas: EventSchemas });

  // Create lightweight clients in constructor
  this.storage = new TodoStorage(this.cwd, this.config.storage, logger);
}
```

**Why:** Constructors should be fast and synchronous. Heavy I/O happens in `init()`.

### 2. Init Pattern

```typescript
async init(obs: Observable): Promise<void> {
  // Heavy I/O operations
  await this.storage.init();

  // Create metrics
  this.todoCounter = obs.metrics.counter(...);

  // Register event handlers
  await this.registerEventHandlers(obs);
}
```

**Why:** Separates initialization from construction, provides Observable context.

### 3. Event Handler Pattern

```typescript
this.onReturnableEvent('todo.create', async (data, obs) => {
  // Input is automatically validated by Zod schema
  obs.log.info(`Creating todo: ${data.title}`);

  // Perform operation
  const todo = this.storage.create(data.title, data.description);

  // Emit notification event
  await this.emitEvent('todo.created', obs, todo);

  // Return is automatically validated by Zod schema
  return todo;
});
```

**Why:** Validation is automatic, Observable is available, tracing is built-in.

### 4. Dispose Pattern

```typescript
dispose(): void {
  // Stop timers
  if (this.statsTimer) clearInterval(this.statsTimer);

  // Stop servers
  if (this.httpServer) this.httpServer.stop();

  // Cleanup clients (final save happens here)
  if (this.storage) this.storage.dispose();
}
```

**Why:** Ensures clean shutdown, prevents resource leaks, saves pending data.

### 5. Storage Pattern (from TodoStorage)

```typescript
class TodoStorage {
  private todos: Map<string, TodoItem> = new Map();
  private isDirty = false;
  private autoSaveTimer?: NodeJS.Timeout;

  async init() {
    // Load from disk
    // Start auto-save timer
  }

  create(title: string, description?: string): TodoItem {
    // Add to map
    this.isDirty = true;
    return todo;
  }

  dispose() {
    // Stop timer
    // Final save
  }
}
```

**Why:** Fast in-memory operations + persistent storage + automatic cleanup.

## Troubleshooting

### Port Already in Use

**Problem:** `Error: listen EADDRINUSE: address already in use :::3000`

**Solution:** Change the port in your configuration:

```yaml
services:
  service-demo-todo:
    config:
      http:
        port: 3001
```

### Storage File Not Created

**Problem:** Todos don't persist after restart

**Solutions:**
1. Check that the directory is writable
2. Verify `storage.path` in configuration
3. Check logs for file system errors
4. Ensure proper shutdown (allows final save)

### Events Not Working

**Problem:** Event handlers not firing

**Solutions:**
1. Ensure `events-default` plugin is enabled
2. Ensure `observable-default` plugin is enabled
3. Check BSB logs for initialization errors
4. Verify plugin load order in configuration

### CORS Errors

**Problem:** Browser blocks API requests from different origin

**Solution:** Enable CORS in configuration (default: enabled):

```yaml
services:
  service-demo-todo:
    config:
      http:
        cors: true
```

### Maximum Todos Reached

**Problem:** Cannot create new todos

**Solution:** Increase or remove the limit:

```yaml
services:
  service-demo-todo:
    config:
      features:
        maxTodos: 10000  # Or any higher number
```

## Learning Path

### For New BSB Developers

1. **Start Here**: Read `src/plugins/service-demo-todo/index.ts`
   - Understand event schema definitions
   - See how configuration works
   - Study the lifecycle methods

2. **Study Storage**: Read `src/plugins/service-demo-todo/storage.ts`
   - Learn the file storage pattern
   - Understand init/dispose lifecycle
   - See auto-save implementation

3. **Explore HTTP**: Read `src/plugins/service-demo-todo/http-server.ts`
   - See how to integrate Observable with HTTP
   - Learn routing and static file serving
   - Study security considerations

4. **Run It**: Start the app and use the web interface
   - Watch the event log
   - Inspect the storage file
   - Check BSB logs for observability

### For Experienced Developers

Use this as a reference for:
- Schema-first API design with Zod
- Event-driven architecture patterns
- Observable integration strategies
- File-based persistence patterns
- HTTP server implementation
- Client lifecycle management

## Support

- **Documentation**: See README.md for detailed usage
- **Issues**: Report bugs or request features on GitHub
- **Examples**: Check `static/app.js` for frontend integration examples

## License

(AGPL-3.0-only OR Commercial)
