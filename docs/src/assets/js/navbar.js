// BSB Documentation Navigation
// Usage: Add to page as a module script with data-page attribute:
// <script type="module" src="/assets/js/navbar.js" data-page="home"></script>

function createNavbar(activePage = '') {
  const version = typeof window !== 'undefined' ? (window.__BSB_VERSION__ || '') : '';

  return `
    <header class="top-nav">
      <div class="nav-container">
        <a href="/" class="nav-brand">
          <span class="brand-text">BSB</span>
          ${version ? `<span class="nav-version">v${version}</span>` : ''}
        </a>

        <nav class="nav-menu" id="nav-menu">
          <div class="nav-dropdown">
            <button class="nav-link ${['home', 'overview'].includes(activePage) ? 'active' : ''}">
              Learn <span class="dropdown-arrow">&#9662;</span>
            </button>
            <div class="dropdown-content">
              <a href="/" class="${activePage === 'home' ? 'active' : ''}">Home</a>
              <a href="/overview/" class="${activePage === 'overview' ? 'active' : ''}">Overview</a>
            </div>
          </div>

          <div class="nav-dropdown">
            <button class="nav-link ${activePage.startsWith('guides') ? 'active' : ''}">
              Build Services <span class="dropdown-arrow">&#9662;</span>
            </button>
            <div class="dropdown-content">
              <a href="/guides/nodejs/" class="${activePage === 'guides-nodejs' ? 'active' : ''}">Node.js</a>
              <a href="/guides/nodejs/build-hooks/" class="nav-sub-link ${activePage === 'guides-nodejs' ? '' : ''}">Build Hooks</a>
              <span class="coming-soon">Go</span>
              <span class="coming-soon">Python</span>
              <span class="coming-soon">Rust</span>
            </div>
          </div>

          <div class="nav-dropdown">
            <button class="nav-link ${activePage.startsWith('extending') ? 'active' : ''}">
              Extend BSB <span class="dropdown-arrow">&#9662;</span>
            </button>
            <div class="dropdown-content">
              <a href="/extending/nodejs/" class="${activePage === 'extending-nodejs' ? 'active' : ''}">Node.js</a>
              <span class="coming-soon">Go</span>
              <span class="coming-soon">Python</span>
            </div>
          </div>

          <a href="/core-plugins/" class="nav-link ${activePage === 'core-plugins' ? 'active' : ''}">Core Plugins</a>

          <a href="/registry/" class="nav-link ${activePage === 'registry' ? 'active' : ''}">Plugins</a>

          <div class="nav-dropdown">
            <button class="nav-link ${activePage === 'nodejs-types' ? 'active' : ''}">
              API Reference <span class="dropdown-arrow">&#9662;</span>
            </button>
            <div class="dropdown-content">
              <a href="https://types.bsbcode.dev/nodejs/" class="${activePage === 'nodejs-types' ? 'active' : ''}">Node.js</a>
              <span class="coming-soon">Go</span>
              <span class="coming-soon">Python</span>
              <span class="coming-soon">Rust</span>
            </div>
          </div>

          <a href="https://github.com/BetterCorp/better-service-base" class="nav-link nav-external" target="_blank" rel="noopener">
            GitHub
            <svg class="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </nav>

        <button class="nav-toggle" id="nav-toggle" aria-label="Toggle navigation">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>
  `;
}

function initNavbar() {
  const registryUrl = (typeof __BSB_REGISTRY_URL__ !== 'undefined' && __BSB_REGISTRY_URL__)
    ? __BSB_REGISTRY_URL__
    : '/registry/';

  document.querySelectorAll('a[href="/registry/"], a[href="/registry"]').forEach((link) => {
    if (link instanceof HTMLAnchorElement) {
      link.href = registryUrl;
    }
  });

  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('nav-menu');

  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      menu.classList.toggle('open');
      toggle.classList.toggle('open');
    });
  }

  // Handle dropdown clicks for mobile
  document.querySelectorAll('.nav-dropdown > button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.parentElement;
      const wasOpen = dropdown.classList.contains('open');
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
      if (!wasOpen) dropdown.classList.add('open');
    });
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
    }
  });
}

function initFooter() {
  const year = new Date().getFullYear();
  const buildVersion = (typeof __BSB_DOCS_BUILD_VERSION__ !== 'undefined') ? __BSB_DOCS_BUILD_VERSION__ : '';
  const buildTime = (typeof __BSB_DOCS_BUILD_TIME__ !== 'undefined') ? __BSB_DOCS_BUILD_TIME__ : '';

  const footer = document.createElement('footer');
  footer.className = 'site-footer';

  const left = document.createElement('div');
  left.className = 'site-footer-left';
  left.textContent = 'Copyright BetterCorp (PTY) Ltd 2016 - ' + year + ' - All Rights Reserved';

  const right = document.createElement('div');
  right.className = 'site-footer-right';
  if (buildVersion) {
    const parts = ['v' + buildVersion];
    if (buildTime) {
      const d = new Date(buildTime);
      if (!isNaN(d.getTime())) {
        parts.push('built ' + d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
      }
    }
    right.textContent = parts.join(' - ');
  }

  footer.appendChild(left);
  footer.appendChild(right);

  // Insert after .doc-layout (or at end of body as fallback)
  const layout = document.querySelector('.doc-layout');
  if (layout && layout.parentNode) {
    layout.parentNode.insertBefore(footer, layout.nextSibling);
  } else {
    document.body.appendChild(footer);
  }
}

// Auto-initialize when this script loads
(function() {
  // Detect active page from script tag: <script ... data-page="guides-nodejs">
  const navScript = document.querySelector('script[src*="navbar.js"][data-page]');
  const activePage = navScript ? navScript.getAttribute('data-page') || '' : '';

  // Replace inline header with generated navbar (single source of truth)
  const existingHeader = document.querySelector('header.top-nav');
  if (existingHeader) {
    const temp = document.createElement('div');
    temp.innerHTML = createNavbar(activePage);
    const newHeader = temp.firstElementChild;
    if (newHeader) {
      existingHeader.replaceWith(newHeader);
    }
  }

  // Initialize event handlers on the (now current) nav
  initNavbar();
  initFooter();

  // Fetch and display version badge in nav
  fetch('/version.txt', { cache: 'no-store' })
    .then(res => {
      if (!res.ok) return '';
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('html')) return ''; // Don't use HTML 404 pages
      return res.text();
    })
    .then(txt => {
      const version = (txt || '').trim();
      // Only use if it looks like a version (short, no HTML)
      if (version && version.length < 20 && !version.includes('<')) {
        const brand = document.querySelector('.nav-brand');
        if (brand && !brand.querySelector('.nav-version')) {
          const versionEl = document.createElement('span');
          versionEl.className = 'nav-version';
          versionEl.textContent = 'v' + version;
          brand.appendChild(versionEl);
        }
      }
    })
    .catch(() => {});
})();

// Export for manual use if needed
export { createNavbar, initNavbar };
