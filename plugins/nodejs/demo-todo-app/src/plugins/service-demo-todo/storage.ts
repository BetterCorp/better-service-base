import * as fs from 'fs/promises';
import * as path from 'path';

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

export interface TodoStorageLogger {
  info: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
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
 */
export class TodoStorage {
  private todos: Map<string, TodoItem> = new Map();
  private isDirty = false;
  private autoSaveTimer?: NodeJS.Timeout;
  private isDisposed = false;
  private filePath: string;

  constructor(
    private cwd: string,
    private config: TodoStorageConfig,
    private logger: TodoStorageLogger
  ) {
    // Resolve path relative to cwd (not absolute path operations)
    this.filePath = path.resolve(cwd, config.path);
  }

  /**
   * Initialize storage - create directory, load existing data, start auto-save.
   * Heavy I/O operations happen here, not in constructor.
   */
  async init(): Promise<void> {
    this.logger.info(`Initializing todo storage at: ${this.filePath}`);

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

      this.logger.info(`Loaded ${items.length} todos from storage`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.info('No existing storage file, starting fresh');
      } else {
        this.logger.error(`Error loading storage: ${error.message}`);
        throw error;
      }
    }

    // Start auto-save timer
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.save().catch((err) => {
          this.logger.error(`Auto-save failed: ${err.message}`);
        });
      }
    }, this.config.autoSaveInterval);

    this.logger.debug(`Auto-save enabled with ${this.config.autoSaveInterval}ms interval`);
  }

  /**
   * Create a new todo item.
   */
  create(title: string, description?: string): TodoItem {
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

    this.logger.debug(`Created todo: ${todo.id}`);
    return todo;
  }

  /**
   * Get a todo by ID.
   */
  get(id: string): TodoItem | undefined {
    this.guardDisposed();
    return this.todos.get(id);
  }

  /**
   * List all todos.
   */
  list(): TodoItem[] {
    this.guardDisposed();
    return Array.from(this.todos.values());
  }

  /**
   * Update a todo item.
   */
  update(id: string, updates: Partial<Pick<TodoItem, 'title' | 'description' | 'completed'>>): TodoItem {
    this.guardDisposed();

    const todo = this.todos.get(id);
    if (!todo) {
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

    this.logger.debug(`Updated todo: ${id}`);
    return updated;
  }

  /**
   * Delete a todo item.
   */
  delete(id: string): boolean {
    this.guardDisposed();

    const result = this.todos.delete(id);
    if (result) {
      this.isDirty = true;
      this.logger.debug(`Deleted todo: ${id}`);
    }

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

    this.logger.debug(`Saved ${items.length} todos to storage`);
  }

  /**
   * Cleanup resources - stop timer, final save.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.logger.info('Disposing todo storage');

    // Stop auto-save timer
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }

    // Final save if dirty
    if (this.isDirty) {
      this.logger.info('Performing final save');
      // Sync save for cleanup
      const items = Array.from(this.todos.values());
      const json = this.config.prettyPrint
        ? JSON.stringify(items, null, 2)
        : JSON.stringify(items);

      try {
        require('fs').writeFileSync(this.filePath, json, 'utf-8');
        this.logger.info('Final save completed');
      } catch (error: any) {
        this.logger.error(`Final save failed: ${error.message}`);
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
