// Multi-language code block selector with localStorage persistence
// Usage: Wrap code blocks in a .code-group with .code-tabs buttons

const STORAGE_KEY = 'bsb-docs-preferred-lang';

// Get preferred language from localStorage
function getPreferredLang() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'typescript';
  } catch {
    return 'typescript';
  }
}

// Set preferred language in localStorage
function setPreferredLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage not available
  }
}

// Initialize all code groups on the page
function initCodeTabs() {
  const preferredLang = getPreferredLang();

  // Find all code groups
  document.querySelectorAll('.code-group').forEach(group => {
    const tabs = group.querySelector('.code-tabs');
    const codeBlocks = group.querySelectorAll('pre[data-lang]');

    if (!tabs || codeBlocks.length === 0) return;

    // Get available languages in this group
    const availableLangs = Array.from(codeBlocks).map(pre => pre.dataset.lang);

    // Determine which language to show (prefer saved, fallback to first available)
    let activeLang = availableLangs.includes(preferredLang)
      ? preferredLang
      : availableLangs[0];

    // Set initial active state
    updateActiveCode(group, activeLang);

    // Add click handlers to tabs
    tabs.querySelectorAll('.code-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const lang = tab.dataset.lang;
        if (lang) {
          setPreferredLang(lang);
          // Update ALL code groups on the page
          document.querySelectorAll('.code-group').forEach(g => {
            updateActiveCode(g, lang);
          });
        }
      });
    });
  });
}

// Update which code block and tab is active in a group
function updateActiveCode(group, lang) {
  const tabs = group.querySelector('.code-tabs');
  const codeBlocks = group.querySelectorAll('pre[data-lang]');

  // Check if this language exists in the group
  const availableLangs = Array.from(codeBlocks).map(pre => pre.dataset.lang);
  if (!availableLangs.includes(lang)) {
    lang = availableLangs[0]; // Fallback to first
  }

  // Update tabs
  if (tabs) {
    tabs.querySelectorAll('.code-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.lang === lang);
    });
  }

  // Update code blocks
  codeBlocks.forEach(pre => {
    pre.classList.toggle('active', pre.dataset.lang === lang);
  });
}

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCodeTabs);
} else {
  initCodeTabs();
}

// Export for manual use
export { initCodeTabs, getPreferredLang, setPreferredLang };
