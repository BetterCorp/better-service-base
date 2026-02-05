// BSB Plugin Marketplace
// Dynamically loads and displays plugins from the registry

let pluginsData = null;
let currentFilter = 'all';
let currentSearch = '';

// Load and render plugins
async function loadPlugins() {
  try {
    const response = await fetch('/assets/data/plugins-registry.json');
    pluginsData = await response.json();

    // Update stats
    document.getElementById('total-plugins').textContent = pluginsData.plugins.length;
    document.getElementById('total-categories').textContent = Object.keys(pluginsData.categories).length;
    document.getElementById('last-updated').textContent = pluginsData.lastUpdated;

    // Add category filter buttons
    addCategoryFilters();

    // Render plugins
    renderPlugins();

    // Set up event listeners
    setupEventListeners();
  } catch (error) {
    console.error('Failed to load plugins:', error);
    document.getElementById('plugins-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <p>Failed to load plugins. Please try again later.</p>
      </div>
    `;
  }
}

// Add category filter buttons
function addCategoryFilters() {
  const filterButtons = document.querySelector('.filter-buttons');

  Object.entries(pluginsData.categories).forEach(([key, cat]) => {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.setAttribute('data-filter', key);
    btn.textContent = `${cat.icon} ${cat.name}`;
    filterButtons.appendChild(btn);
  });
}

// Render all plugins grouped by category
function renderPlugins() {
  const container = document.getElementById('plugins-container');
  container.innerHTML = '';

  // Group plugins by category
  const byCategory = {};
  pluginsData.plugins.forEach(plugin => {
    if (!byCategory[plugin.category]) {
      byCategory[plugin.category] = [];
    }
    byCategory[plugin.category].push(plugin);
  });

  // Render each category
  Object.entries(pluginsData.categories).forEach(([catKey, catInfo]) => {
    const plugins = byCategory[catKey] || [];
    if (plugins.length === 0) return;

    const section = createCategorySection(catKey, catInfo, plugins);
    container.appendChild(section);
  });

  // Apply filters
  applyFilters();
}

// Create a category section
function createCategorySection(catKey, catInfo, plugins) {
  const section = document.createElement('div');
  section.className = 'category-section';
  section.setAttribute('data-category', catKey);

  section.innerHTML = `
    <div class="category-header">
      <div class="category-icon" style="background: ${catInfo.color}">
        ${catInfo.icon}
      </div>
      <div class="category-title">
        <h2>${catInfo.name}</h2>
        <p>${catInfo.description}</p>
      </div>
      <div class="category-count">${plugins.length} plugin${plugins.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="plugin-grid">
      ${plugins.map(plugin => createPluginCard(plugin)).join('')}
    </div>
  `;

  return section;
}

// Create a plugin card
function createPluginCard(plugin) {
  const categoryIcon = pluginsData.categories[plugin.category]?.icon || '🔌';

  // Determine image or placeholder
  const imageHtml = plugin.image
    ? `<img src="${plugin.image}" alt="${plugin.name}">`
    : `<div class="plugin-image placeholder">${categoryIcon}</div>`;

  // Badges
  const badges = [];
  if (plugin.version) badges.push(`<span class="plugin-badge">v${plugin.version}</span>`);
  if (plugin.official) badges.push(`<span class="plugin-badge badge-official">Official</span>`);

  // Language badges
  if (plugin.languages && plugin.languages.length > 0) {
    const langNames = {
      'nodejs': 'Node.js',
      'go': 'Go',
      'python': 'Python',
      'dotnet': '.NET',
      'rust': 'Rust'
    };
    plugin.languages.forEach(lang => {
      const displayName = langNames[lang] || lang;
      badges.push(`<span class="plugin-badge badge-lang">${displayName}</span>`);
    });
  }

  // Primary action button
  const primaryAction = plugin.links.docs
    ? `<a href="${plugin.links.docs}" class="btn-primary">View Documentation</a>`
    : '';

  // External link icon SVG
  const externalIcon = `<svg class="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

  // Secondary links (icon-based)
  const links = [];
  if (plugin.links.npm) {
    links.push(`<a href="${plugin.links.npm}" target="_blank" rel="noopener" title="View on npm">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z"/></svg>
      npm${externalIcon}
    </a>`);
  }
  if (plugin.links.github) {
    links.push(`<a href="${plugin.links.github}" target="_blank" rel="noopener" title="View on GitHub">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
      GitHub${externalIcon}
    </a>`);
  }

  const linksHtml = links.length > 0
    ? `<div class="plugin-links">${links.join('')}</div>`
    : '';

  return `
    <div class="plugin-card"
         data-plugin-id="${plugin.id}"
         data-category="${plugin.category}"
         data-official="${plugin.official}"
         data-search-text="${(plugin.name + ' ' + plugin.description + ' ' + plugin.tags.join(' ')).toLowerCase()}">
      <div class="plugin-image">
        ${imageHtml}
        <div class="plugin-badges">
          ${badges.join('')}
        </div>
      </div>
      <div class="plugin-content">
        <div class="plugin-header">
          <h3 class="plugin-name">${plugin.name}</h3>
          <code class="plugin-package">${plugin.package}</code>
        </div>
        <p class="plugin-description">${plugin.description}</p>
        <div class="plugin-tags">
          ${plugin.tags.map(tag => `<span class="plugin-tag">${tag}</span>`).join('')}
        </div>
        <div class="plugin-actions">
          ${primaryAction}
          ${linksHtml}
        </div>
      </div>
    </div>
  `;
}

// Setup event listeners
function setupEventListeners() {
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentFilter = e.target.getAttribute('data-filter');

      // Update button states
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');

      applyFilters();
    });
  });

  // Search input
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase();
    applyFilters();
  });
}

// Apply current filters
function applyFilters() {
  const cards = document.querySelectorAll('.plugin-card');
  const sections = document.querySelectorAll('.category-section');

  cards.forEach(card => {
    let show = true;

    // Category filter
    if (currentFilter !== 'all' && currentFilter !== 'official') {
      show = card.getAttribute('data-category') === currentFilter;
    }

    // Official filter
    if (currentFilter === 'official') {
      show = card.getAttribute('data-official') === 'true';
    }

    // Search filter
    if (show && currentSearch) {
      const searchText = card.getAttribute('data-search-text');
      show = searchText.includes(currentSearch);
    }

    card.classList.toggle('hidden', !show);
  });

  // Hide empty categories
  sections.forEach(section => {
    const visibleCards = section.querySelectorAll('.plugin-card:not(.hidden)');
    section.classList.toggle('hidden', visibleCards.length === 0);
  });

  // Show empty state if no results
  const hasVisibleCards = document.querySelectorAll('.plugin-card:not(.hidden)').length > 0;
  if (!hasVisibleCards) {
    const container = document.getElementById('plugins-container');
    if (!container.querySelector('.empty-state')) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <p>No plugins found matching your criteria.</p>
          <p style="font-size: 0.875rem; margin-top: 0.5rem;">Try adjusting your search or filters.</p>
        </div>
      `;
    }
  } else {
    // Remove empty state if it exists
    const emptyState = document.querySelector('.empty-state');
    if (emptyState) {
      renderPlugins(); // Re-render to show results
    }
  }
}

// Initialize on page load
loadPlugins();
