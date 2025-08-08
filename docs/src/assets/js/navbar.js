export function createNavbar(activePage = '') {
  const version = typeof window !== 'undefined' ? (window.__BSB_VERSION__ || '') : '';
  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <h1>BSB Docs</h1>
        <p>
          Better Service Base
          ${version ? `<span class="version-badge" title="Latest version">v${version}</span>` : ''}
        </p>
      </div>
      
      <nav class="sidebar-nav">
        <div class="nav-section">
          <div class="nav-section-title">Getting Started</div>
          <a href="/" class="nav-item ${activePage === 'overview' ? 'active' : ''}">Overview</a>
          <a href="/get-started/" class="nav-item ${activePage === 'get-started' ? 'active' : ''}">Quick Start</a>
          <a href="/architecture/" class="nav-item ${activePage === 'architecture' ? 'active' : ''}">Architecture</a>
        </div>
        
        <div class="nav-section">
          <div class="nav-section-title">Implementation</div>
          <a href="/languages/nodejs/" class="nav-item ${activePage === 'nodejs' ? 'active' : ''}">Node.js Guide</a>
          <span class="nav-item coming-soon">Go</span>
          <span class="nav-item coming-soon">Python</span>
          <span class="nav-item coming-soon">C# / .NET</span>
          <span class="nav-item coming-soon">Java</span>
        </div>
        
        <div class="nav-section">
          <div class="nav-section-title">Reference</div>
          <a href="/plugins/" class="nav-item ${activePage === 'plugins' ? 'active' : ''}">Plugin System</a>
          <a href="/languages/nodejs/types/" class="nav-item">Node.js Types</a>
        </div>
        
        <div class="nav-section">
          <div class="nav-section-title">Community</div>
          <a href="https://github.com/BetterCorp/better-service-base" class="nav-item" target="_blank">GitHub</a>
          <a href="https://bettercorp.dev" class="nav-item" target="_blank">BetterCorp</a>
        </div>
      </nav>
    </aside>
  `;
}