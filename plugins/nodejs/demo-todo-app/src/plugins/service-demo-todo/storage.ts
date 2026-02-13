import * as fs from 'fs/promises';
import * as path from 'path';
import { Observable } from '@bsb/base';

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoStorageConfig {
  path: string;
  autoSaveInterval: number;
  prettyPrint: boolean;
}

/**
 * File-based todo storage client following observable-logging-file pattern.
 *
 * Key patterns:
 * - Map-based in-memory cache for performance
 * - Auto-save mechanism with dirty flag
 * - Heavy I/O in init(), not constructor
 * - Proper cleanup in dispose() with final save
 * - Path resolution using cwd
 * - Observable passed to methods for logging (never stored as class variable)
 */
export class TodoStorage {
  private todos: Map<string, TodoItem> = new Map();
  private isDirty = false;
  private autoSaveTimer?: NodeJS.Timeout;
  private isDisposed = false;
  private filePath: string;

  constructor(
    private cwd: string,
    private config: TodoStorageConfig
  ) {
    // Resolve path relative to cwd (not absolute path operations)
    this.filePath = path.resolve(this.cwd, this.config.path);
  }

  /**
   * Initialize storage - create directory, load existing data, start auto-save.
   * Heavy I/O operations happen here, not in constructor.
   */
  async init(obs: Observable): Promise<void> {
    obs.log.info('Initializing todo storage at: {filePath}', { filePath: this.filePath });

    // Ensure directory exists
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    // Load existing data if file exists
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const items: TodoItem[] = JSON.parse(data);

      // Populate map
      for (const item of items) {
        this.todos.set(item.id, item);
      }

      obs.log.info('Loaded {count} todos from storage', { count: items.length });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        obs.log.info('No existing storage file, starting fresh');
      } else {
        obs.log.error('Error loading storage: {message}', { message: error.message });
        throw error;
      }
    }

    // Start auto-save timer (errors silently ignored since no obs in timer callback)
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.save().catch(() => {
          // Silently ignore auto-save errors (no obs available in timer callback)
        });
      }
    }, this.config.autoSaveInterval);

    obs.log.info('Auto-save enabled with {interval}ms interval', { interval: this.config.autoSaveInterval });
  }

  /**
   * Create a new todo item.
   */
  create(obs: Observable, title: string, description?: string): TodoItem {
    const span = obs.startSpan('storage:create', { operation: 'create' });
    this.guardDisposed();

    const now = new Date().toISOString();
    const todo: TodoItem = {
      id: this.generateId(),
      title,
      description,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    this.todos.set(todo.id, todo);
    this.isDirty = true;

    span.log.debug('Created todo: {todoId}', { todoId: todo.id });
    span.end({ todo_id: todo.id });
    return todo;
  }

  /**
   * Get a todo by ID.
   */
  get(obs: Observable, id: string): TodoItem | undefined {
    const span = obs.startSpan('storage:get', { operation: 'get', todo_id: id });
    this.guardDisposed();

    const todo = this.todos.get(id);
    span.end({ found: !!todo });
    return todo;
  }

  /**
   * List all todos.
   */
  list(obs: Observable): TodoItem[] {
    const span = obs.startSpan('storage:list', { operation: 'list' });
    this.guardDisposed();

    const todos = Array.from(this.todos.values());
    span.end({ count: todos.length });
    return todos;
  }

  /**
   * Update a todo item.
   */
  update(obs: Observable, id: string, updates: Partial<Pick<TodoItem, 'title' | 'description' | 'completed'>>): TodoItem {
    const span = obs.startSpan('storage:update', { operation: 'update', todo_id: id });
    this.guardDisposed();

    const todo = this.todos.get(id);
    if (!todo) {
      span.end({ success: false, error: 'not_found' });
      throw new Error(`Todo not found: ${id}`);
    }

    // Apply updates
    const updated: TodoItem = {
      ...todo,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.todos.set(id, updated);
    this.isDirty = true;

    span.log.debug('Updated todo: {todoId}', { todoId: id });
    span.end({ success: true });
    return updated;
  }

  /**
   * Delete a todo item.
   */
  delete(obs: Observable, id: string): boolean {
    const span = obs.startSpan('storage:delete', { operation: 'delete', todo_id: id });
    this.guardDisposed();

    const result = this.todos.delete(id);
    if (result) {
      this.isDirty = true;
      span.log.debug('Deleted todo: {todoId}', { todoId: id });
    }

    span.end({ success: result });
    return result;
  }

  /**
   * Get statistics about todos.
   */
  getStats(): { total: number; completed: number; pending: number; timestamp: string } {
    this.guardDisposed();

    const all = Array.from(this.todos.values());
    const completed = all.filter((t) => t.completed).length;

    return {
      total: all.length,
      completed,
      pending: all.length - completed,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Manually save todos to disk.
   * Note: Called from auto-save timer and dispose, so no obs available for logging.
   */
  async save(): Promise<void> {
    if (!this.isDirty) {
      return;
    }

    this.guardDisposed();

    const items = Array.from(this.todos.values());
    const json = this.config.prettyPrint
      ? JSON.stringify(items, null, 2)
      : JSON.stringify(items);

    await fs.writeFile(this.filePath, json, 'utf-8');
    this.isDirty = false;
  }

  /**
   * Cleanup resources - stop timer, final save.
   * Note: No obs available during disposal, errors fail silently.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    // Stop auto-save timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }

    // Final save if dirty (silently fails if error)
    if (this.isDirty) {
      try {
        const items = Array.from(this.todos.values());
        const json = this.config.prettyPrint
          ? JSON.stringify(items, null, 2)
          : JSON.stringify(items);
        require('fs').writeFileSync(this.filePath, json, 'utf-8');
      } catch {
        // Silently fail - no obs available for logging during disposal
      }
    }

    this.isDisposed = true;
  }

  /**
   * Generate a simple UUID v4.
   */
  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Guard against operations after disposal.
   */
  private guardDisposed(): void {
    if (this.isDisposed) {
      throw new Error('TodoStorage has been disposed');
    }
  }
}
