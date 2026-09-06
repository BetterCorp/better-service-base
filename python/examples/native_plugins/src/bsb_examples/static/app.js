/**
 * BSB Demo Todo App - Frontend JavaScript
 *
 * Vanilla JavaScript implementation that interacts with the BSB todo API.
 * Demonstrates real-time updates, event logging, and responsive UI.
 */

// State management
let todos = [];
let currentFilter = 'all';

// API base URL (same origin)
const API_BASE = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadTodos();
    setInterval(loadTodos, 5000); // Refresh every 5 seconds
});

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
    // Add todo form
    document.getElementById('add-todo-form').addEventListener('submit', handleAddTodo);

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', handleFilterChange);
    });

    // Clear events button
    document.getElementById('clear-events').addEventListener('click', clearEvents);
}

/**
 * Load todos from API
 */
async function loadTodos() {
    try {
        const response = await fetch(`${API_BASE}/todos`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        todos = data.todos || [];
        updateStats();
        renderTodos();
    } catch (error) {
        console.error('Failed to load todos:', error);
        logEvent('error', `Failed to load todos: ${error.message}`, 'error');
    }
}

/**
 * Handle add todo form submission
 */
async function handleAddTodo(e) {
    e.preventDefault();

    const titleInput = document.getElementById('todo-title');
    const descriptionInput = document.getElementById('todo-description');

    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();

    if (!title) return;

    try {
        const response = await fetch(`${API_BASE}/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                description: description || undefined,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || response.statusText);
        }

        const todo = await response.json();

        // Clear form
        titleInput.value = '';
        descriptionInput.value = '';

        // Log event
        logEvent('todo.created', `Created: "${todo.title}"`, 'success');

        // Reload todos
        await loadTodos();
    } catch (error) {
        console.error('Failed to add todo:', error);
        logEvent('error', `Failed to add todo: ${error.message}`, 'error');
        alert(`Failed to add todo: ${error.message}`);
    }
}

/**
 * Toggle todo completion status
 */
async function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    try {
        const response = await fetch(`${API_BASE}/todos/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                completed: !todo.completed,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || response.statusText);
        }

        const updated = await response.json();

        // Log event
        const status = updated.completed ? 'completed' : 'uncompleted';
        logEvent('todo.updated', `Marked as ${status}: "${updated.title}"`, 'info');

        // Reload todos
        await loadTodos();
    } catch (error) {
        console.error('Failed to toggle todo:', error);
        logEvent('error', `Failed to toggle todo: ${error.message}`, 'error');
    }
}

/**
 * Delete a todo
 */
async function deleteTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    if (!confirm(`Delete "${todo.title}"?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/todos/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || response.statusText);
        }

        // Log event
        logEvent('todo.deleted', `Deleted: "${todo.title}"`, 'warning');

        // Reload todos
        await loadTodos();
    } catch (error) {
        console.error('Failed to delete todo:', error);
        logEvent('error', `Failed to delete todo: ${error.message}`, 'error');
    }
}

/**
 * Handle filter button clicks
 */
function handleFilterChange(e) {
    const filter = e.target.dataset.filter;
    currentFilter = filter;

    // Update active state
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    renderTodos();
}

/**
 * Update statistics display
 */
function updateStats() {
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    const pending = total - completed;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-pending').textContent = pending;
}

/**
 * Render todos list
 */
function renderTodos() {
    const container = document.getElementById('todos-list');
    const emptyState = document.getElementById('empty-state');

    // Filter todos
    let filteredTodos = todos;
    if (currentFilter === 'pending') {
        filteredTodos = todos.filter(t => !t.completed);
    } else if (currentFilter === 'completed') {
        filteredTodos = todos.filter(t => t.completed);
    }

    // Show empty state if no todos
    if (filteredTodos.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    // Render todos
    container.innerHTML = filteredTodos
        .map(todo => createTodoElement(todo))
        .join('');

    // Attach event listeners
    filteredTodos.forEach(todo => {
        const checkbox = document.getElementById(`checkbox-${todo.id}`);
        const deleteBtn = document.getElementById(`delete-${todo.id}`);

        if (checkbox) {
            checkbox.addEventListener('change', () => toggleTodo(todo.id));
        }

        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => deleteTodo(todo.id));
        }
    });
}

/**
 * Create HTML for a todo item
 */
function createTodoElement(todo) {
    const createdDate = new Date(todo.createdAt).toLocaleDateString();
    const createdTime = new Date(todo.createdAt).toLocaleTimeString();

    return `
        <div class="todo-item ${todo.completed ? 'completed' : ''}">
            <input
                type="checkbox"
                class="todo-checkbox"
                id="checkbox-${todo.id}"
                ${todo.completed ? 'checked' : ''}
            />
            <div class="todo-content">
                <div class="todo-title">${escapeHtml(todo.title)}</div>
                ${todo.description ? `<div class="todo-description">${escapeHtml(todo.description)}</div>` : ''}
                <div class="todo-meta">Created: ${createdDate} ${createdTime}</div>
            </div>
            <div class="todo-actions">
                <button class="btn-delete" id="delete-${todo.id}">Delete</button>
            </div>
        </div>
    `;
}

/**
 * Log an event in the event log
 */
function logEvent(eventName, message, type = 'info') {
    const eventLog = document.getElementById('event-log');
    const timestamp = new Date().toLocaleTimeString();

    const eventItem = document.createElement('div');
    eventItem.className = 'event-item';
    eventItem.innerHTML = `
        <div>
            <span class="event-name">${escapeHtml(eventName)}</span>
            <span class="event-message">${escapeHtml(message)}</span>
        </div>
        <span class="event-time">${timestamp}</span>
    `;

    // Add color based on type
    if (type === 'error') {
        eventItem.style.borderLeftColor = '#ff4757';
    } else if (type === 'warning') {
        eventItem.style.borderLeftColor = '#ffa502';
    } else if (type === 'success') {
        eventItem.style.borderLeftColor = '#26de81';
    }

    // Prepend to log
    eventLog.insertBefore(eventItem, eventLog.firstChild);

    // Limit to 50 events
    while (eventLog.children.length > 50) {
        eventLog.removeChild(eventLog.lastChild);
    }
}

/**
 * Clear event log
 */
function clearEvents() {
    document.getElementById('event-log').innerHTML = '';
    logEvent('system', 'Event log cleared', 'info');
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Log initial message
logEvent('system', 'Todo app initialized', 'info');
