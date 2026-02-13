/**
 * BSB Registry UI Client-Side Application
 */

// State
const state = {
    plugins: [],
    filteredPlugins: [],
    currentPage: 1,
    pageSize: 12,
    searchQuery: '',
    category: null,
    sort: 'recent',
};

// API Base URL (proxied through UI server to avoid CORS)
const API_BASE = '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadStats();
    loadPlugins();
});

// Event Listeners
function initEventListeners() {
    // Search
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Category filters
    document.querySelectorAll('.filter-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            const category = e.target.dataset.category;
            handleCategoryFilter(category);
        });
    });

    // Sort
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        state.sort = e.target.value;
        sortPlugins();
        renderPlugins();
    });

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('pluginModal').addEventListener('click', (e) => {
        if (e.target.id === 'pluginModal') closeModal();
    });
}

// Load stats from API
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
        if (!response.ok) throw new Error('Failed to fetch stats');

        const stats = await response.json();

        document.getElementById('totalPlugins').textContent = stats.totalPlugins || 0;
        document.getElementById('totalLanguages').textContent = Object.keys(stats.byLanguage || {}).length || 0;
        document.getElementById('totalDownloads').textContent = formatNumber(stats.totalDownloads || 0);
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load plugins from API
async function loadPlugins() {
    showLoading();

    try {
        const response = await fetch(`${API_BASE}/plugins?limit=1000`);
        if (!response.ok) throw new Error('Failed to fetch plugins');

        const data = await response.json();
        state.plugins = data.results || [];
        state.filteredPlugins = [...state.plugins];

        sortPlugins();
        renderPlugins();
    } catch (error) {
        console.error('Error loading plugins:', error);
        showError('Failed to load plugins. Make sure the registry API is running.');
    }
}

// Search plugins
async function handleSearch() {
    const query = document.getElementById('searchInput').value.trim();
    state.searchQuery = query;
    state.currentPage = 1;

    if (!query) {
        state.filteredPlugins = [...state.plugins];
        renderPlugins();
        return;
    }

    showLoading();

    try {
        const response = await fetch(`${API_BASE}/plugins/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        state.filteredPlugins = data.results || [];

        document.getElementById('sectionTitle').textContent = `Search Results for "${query}"`;
        renderPlugins();
    } catch (error) {
        console.error('Error searching:', error);
        showError('Search failed');
    }
}

// Filter by category
function handleCategoryFilter(category) {
    state.category = category;
    state.currentPage = 1;

    if (!category) {
        state.filteredPlugins = [...state.plugins];
    } else {
        state.filteredPlugins = state.plugins.filter(p => p.category === category);
    }

    document.getElementById('sectionTitle').textContent = `${capitalize(category)} Plugins`;

    // Update active state
    document.querySelectorAll('.filter-tag').forEach(tag => {
        tag.classList.toggle('active', tag.dataset.category === category);
    });

    sortPlugins();
    renderPlugins();
}

// Sort plugins
function sortPlugins() {
    state.filteredPlugins.sort((a, b) => {
        switch (state.sort) {
            case 'name':
                return a.id.localeCompare(b.id);
            case 'popular':
                return (b.downloads || 0) - (a.downloads || 0);
            case 'recent':
            default:
                return new Date(b.updatedAt) - new Date(a.updatedAt);
        }
    });
}

// Render plugins
function renderPlugins() {
    const container = document.getElementById('pluginList');
    const plugins = getPaginatedPlugins();

    if (plugins.length === 0) {
        container.innerHTML = '<div class="loading">No plugins found</div>';
        return;
    }

    container.innerHTML = plugins.map(plugin => `
        <div class="plugin-card" onclick="showPluginDetail('${plugin.id}')">
            <div class="plugin-header">
                <div>
                    <div class="plugin-name">${escapeHtml(plugin.name)}</div>
                    <div class="plugin-id">${escapeHtml(plugin.id)}</div>
                </div>
                <div class="plugin-version">v${escapeHtml(plugin.version)}</div>
            </div>

            <p class="plugin-description">${escapeHtml(plugin.description || 'No description')}</p>

            <div class="plugin-meta">
                <span>${plugin.language}</span>
                <span>&middot;</span>
                <span>${formatNumber(plugin.downloads || 0)} downloads</span>
                <span>&middot;</span>
                <span>${plugin.eventCount || 0} events</span>
            </div>

            <div class="plugin-tags">
                <span class="tag category">${escapeHtml(plugin.category)}</span>
                <span class="tag language">${escapeHtml(plugin.language)}</span>
                ${(plugin.tags || []).slice(0, 3).map(tag =>
                    `<span class="tag">${escapeHtml(tag)}</span>`
                ).join('')}
            </div>
        </div>
    `).join('');

    renderPagination();
}

// Get paginated plugins
function getPaginatedPlugins() {
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    return state.filteredPlugins.slice(start, end);
}

// Render pagination
function renderPagination() {
    const container = document.getElementById('pagination');
    const totalPages = Math.ceil(state.filteredPlugins.length / state.pageSize);

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 2 && i <= state.currentPage + 2)) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }

    container.innerHTML = pages.map(page => {
        if (page === '...') {
            return '<span class="page-btn disabled">...</span>';
        }
        return `
            <button
                class="page-btn ${page === state.currentPage ? 'active' : ''}"
                onclick="goToPage(${page})"
            >
                ${page}
            </button>
        `;
    }).join('');
}

// Navigate to page
function goToPage(page) {
    state.currentPage = page;
    renderPlugins();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Show plugin detail modal
async function showPluginDetail(pluginId) {
    const modal = document.getElementById('pluginModal');
    const modalBody = document.getElementById('modalBody');

    modalBody.innerHTML = '<div class="loading">Loading plugin details...</div>';
    modal.classList.add('active');

    try {
        const response = await fetch(`${API_BASE}/plugins/${pluginId}`);
        if (!response.ok) throw new Error('Failed to fetch plugin details');

        const plugin = await response.json();

        modalBody.innerHTML = `
            <h2>${escapeHtml(plugin.name)}</h2>
            <p class="plugin-id">${escapeHtml(plugin.id)} @ v${escapeHtml(plugin.version)}</p>

            <p>${escapeHtml(plugin.description)}</p>

            <div class="plugin-meta" style="margin: 1rem 0;">
                <span><strong>Language:</strong> ${escapeHtml(plugin.language)}</span>
                <span>&middot;</span>
                <span><strong>Category:</strong> ${escapeHtml(plugin.category)}</span>
                <span>&middot;</span>
                <span><strong>Events:</strong> ${plugin.eventCount || 0}</span>
            </div>

            ${plugin.author ? `<p><strong>Author:</strong> ${escapeHtml(plugin.author)}</p>` : ''}
            ${plugin.license ? `<p><strong>License:</strong> ${escapeHtml(plugin.license)}</p>` : ''}
            ${plugin.homepage ? `<p><strong>Homepage:</strong> <a href="${escapeHtml(plugin.homepage)}" target="_blank">${escapeHtml(plugin.homepage)}</a></p>` : ''}
            ${plugin.repository ? `<p><strong>Repository:</strong> <a href="${escapeHtml(plugin.repository)}" target="_blank">${escapeHtml(plugin.repository)}</a></p>` : ''}

            <h3 style="margin-top: 2rem;">Installation</h3>
            <pre style="background: var(--bg); padding: 1rem; border-radius: 0.5rem; overflow-x: auto;">npx bsb client install ${escapeHtml(plugin.id)}</pre>

            ${plugin.package?.nodejs ? `
                <h3 style="margin-top: 2rem;">NPM Package</h3>
                <pre style="background: var(--bg); padding: 1rem; border-radius: 0.5rem; overflow-x: auto;">npm install ${escapeHtml(plugin.package.nodejs)}</pre>
            ` : ''}

            <div style="margin-top: 2rem;">
                <h3>Tags</h3>
                <div class="plugin-tags">
                    ${(plugin.tags || []).map(tag =>
                        `<span class="tag">${escapeHtml(tag)}</span>`
                    ).join('')}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error loading plugin details:', error);
        modalBody.innerHTML = '<div class="error">Failed to load plugin details</div>';
    }
}

// Close modal
function closeModal() {
    document.getElementById('pluginModal').classList.remove('active');
}

// Show loading state
function showLoading() {
    document.getElementById('pluginList').innerHTML = '<div class="loading">Loading plugins...</div>';
}

// Show error
function showError(message) {
    document.getElementById('pluginList').innerHTML =
        `<div class="error">${escapeHtml(message)}</div>`;
}

// Utility functions
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
