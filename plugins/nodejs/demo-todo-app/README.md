# BSB Demo Todo App

A comprehensive demonstration application showcasing Best Service Base (BSB) best practices through a simple yet feature-rich todo application.

## Features

- **Event-Driven Architecture**: Schema-first events with Zod validation
- **File-Based Storage**: Persistent JSON storage following BSB patterns
- **HTTP Server**: Simple REST API with CORS support
- **Web Interface**: Responsive single-page application
- **Observable Integration**: Full logging, metrics, and tracing
- **Real-Time Updates**: Live statistics and event logging

## What This Demo Showcases

### BSB Patterns Demonstrated

1. **Schema-First Events**: All events defined with Zod schemas, automatic validation
2. **Client Pattern**: Storage client created in constructor
3. **Resource Lifecycle**: Proper init/run/dispose with cleanup
4. **Observable Integration**: Logging, metrics, and tracing throughout
5. **Configuration**: Zod schema with sensible defaults
6. **File Storage**: Following observable-logging-file pattern
7. **Event Types**: Fire-and-forget, returnable, and broadcast events
8. **Metrics**: Counters and histograms for monitoring
9. **Distributed Tracing**: Spans for HTTP requests and operations
10. **Resource Context**: Automatic from plugin configuration

## Installation

### From NPM (when published)

```bash
npm install @bsb/demo-todo-app
```

### From Source

```bash
cd plugins/nodejs/demo-todo-app
npm install
npm run build
```

## Configuration

Add to your BSB `sec-config.yaml`:

```yaml
default:
  # Required: Observable plugin
  observable:
    observable-default:
      plugin: observable-default
      enabled: true

  # Required: Events plugin
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
          path: "./.temp/demo-todos.json"  # Relative to cwd
          autoSaveInterval: 5000            # Auto-save interval (ms)
          prettyPrint: true                 # Pretty-print JSON
        http:
          port: 3000                        # HTTP server port
          host: "0.0.0.0"                   # HTTP server host
          cors: true                        # Enable CORS
        features:
          statsInterval: 30                 # Broadcast stats every N seconds (0 = disabled)
          maxTodos: 1000                    # Maximum number of todos
```

## Axiom.co Integration

The demo app includes full Axiom.co integration for production-grade observability.

### Quick Setup

```bash
# 1. Copy Axiom example environment file
cp .env.axiom.example .env

# 2. Update with your Axiom credentials
# Edit .env and set:
#   AXIOM_TOKEN=xaat-your-token-here
#   AXIOM_DATASET=bsb-demo

# 3. Start with Axiom configuration
BSB_ENV=axiom bsb start
```

### What Gets Sent to Axiom

- **Logs**: All application logs with trace context
- **Metrics**: Todo operations, HTTP requests, performance
- **Traces**: Distributed tracing for all operations

### Example Axiom Queries

```apl
# View all logs
['bsb-demo'] | where service == "demo-todo-app"

# Track todo creation rate
['bsb-demo']
| where message contains "Todo created"
| summarize count() by bin(_time, 1m)

# Monitor errors
['bsb-demo']
| where level == "error"
| order by _time desc
```

See `sec-config.axiom.yaml` for full configuration options.

## Usage

### Starting the Application

```bash
bsb start
```

### Accessing the Web Interface

Open your browser to: `http://localhost:3000`

### Using the REST API

#### List all todos
```bash
curl http://localhost:3000/api/todos
```

#### Create a todo
```bash
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn BSB", "description": "Study the demo app"}'
```

#### Get a specific todo
```bash
curl http://localhost:3000/api/todos/{id}
```

#### Update a todo
```bash
curl -X PATCH http://localhost:3000/api/todos/{id} \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'
```

#### Delete a todo
```bash
curl -X DELETE http://localhost:3000/api/todos/{id}
```

## Events

### Returnable Events (CRUD Operations)

- `todo.create` - Create a new todo
  - Input: `{ title: string, description?: string }`
  - Output: `TodoItem`

- `todo.get` - Get a todo by ID
  - Input: `{ id: string }`
  - Output: `TodoItem`

- `todo.list` - List all todos
  - Input: `{}`
  - Output: `{ todos: TodoItem[], total: number }`

- `todo.update` - Update a todo
  - Input: `{ id: string, title?: string, description?: string, completed?: boolean }`
  - Output: `TodoItem`

- `todo.delete` - Delete a todo
  - Input: `{ id: string }`
  - Output: `{ success: boolean }`

### Fire-and-Forget Events (Notifications)

- `todo.created` - Emitted when a todo is created
- `todo.updated` - Emitted when a todo is updated
- `todo.deleted` - Emitted when a todo is deleted

### Broadcast Events

- `todo.stats` - Periodic statistics broadcast
  - Data: `{ total: number, completed: number, pending: number, timestamp: string }`

## Architecture

### Project Structure

```
demo-todo-app/
├── src/
│   └── plugins/
│       └── service-demo-todo/
│           ├── index.ts          # Main plugin with event handlers
│           ├── storage.ts        # File storage client
│           ├── http-server.ts    # Simple HTTP server
│           └── static/           # Web interface
│               ├── index.html
│               ├── style.css
│               └── app.js
├── package.json
├── tsconfig.json
├── bsb-plugin.json
└── README.md
```

### Component Interaction

```
HTTP Request → HTTP Server → API Handler → Event System → Storage Client → File System
                    ↓
              Observable Context (logging, metrics, tracing)
```

## Development

### Building

```bash
npm run build
```

### Development Mode (watch)

```bash
npm run dev
```

### Cleaning

```bash
npm run clean
```

## Best Practices Highlighted

### 1. Schema-First Design

All events are defined with Zod schemas, providing:
- Automatic validation
- Type safety
- Self-documenting API
- Runtime type checking

### 2. Resource Lifecycle

```typescript
constructor() {
  // Create lightweight clients
}

async init(obs: Observable) {
  // Heavy I/O operations
  // Initialize resources
  // Register event handlers
}

async run(obs: Observable) {
  // Start servers
  // Start background tasks
}

dispose() {
  // Stop timers
  // Close connections
  // Final save
}
```

### 3. Observable Integration

Every operation receives an `Observable` context for:
- Structured logging
- Metric collection
- Distributed tracing
- Resource context

### 4. File Storage Pattern

Following the `observable-logging-file` pattern:
- Map-based in-memory cache
- Auto-save with dirty flag
- Heavy I/O in `init()`, not constructor
- Cleanup in `dispose()` with final save

### 5. Event-Driven CRUD

All operations are event-based:
- Validation happens automatically
- Observability is built-in
- Loose coupling between components
- Easy to extend and test

## Metrics

The demo app exposes the following metrics:

- `demo_todo_total` - Counter tracking total number of todos
- `demo_http_requests_total` - Counter tracking HTTP requests (labeled by method and path)
- `demo_http_request_duration_ms` - Histogram of HTTP request durations

## Troubleshooting

### Port Already in Use

If port 3000 is already in use, change the port in `sec-config.yaml`:

```yaml
services:
  service-demo-todo:
    config:
      http:
        port: 3001  # Or any available port
```

### Storage File Not Created

Ensure the `.temp/` directory is writable. The plugin will create it automatically if it doesn't exist.

### Events Not Working

Ensure the following plugins are enabled:
- `observable-default` (or another Observable plugin)
- `events-default` (or another Events plugin)

## Documentation

Detailed plugin documentation: `https://github.com/BetterCorp/better-service-base/blob/master/plugins/nodejs/demo-todo-app/docs/plugin.md`
This doc is used by the BSB Registry.

## Links

- GitHub: `https://github.com/BetterCorp/better-service-base/tree/master/plugins/nodejs/demo-todo-app`
- BSB Registry (package): `https://io.bsbcode.dev/packages/nodejs/@bsb/demo-todo-app`

## License

(AGPL-3.0-only OR Commercial)

## Contributing

This is a demo application for educational purposes. Feel free to use it as a reference for building your own BSB plugins!

## Support

For questions or issues, please refer to the BSB documentation or open an issue on GitHub.
