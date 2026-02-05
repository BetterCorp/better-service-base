import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItAttrs from 'markdown-it-attrs'
import markdownItPrism from 'markdown-it-prism'
import fs from 'fs'
import path from 'path'

// Initialize markdown-it with security settings
const md = new MarkdownIt({
  html: false, // Security: Disable HTML tags in markdown
  xhtmlOut: true,
  breaks: false,
  linkify: true,
  typographer: true
})
  .use(markdownItAnchor, {
    permalink: markdownItAnchor.permalink.headerLink()
  })
  .use(markdownItAttrs)
  .use(markdownItPrism)

/**
 * Convert markdown files to HTML and inject into template
 * @param {object} plugin - Plugin metadata
 * @param {string} pluginDir - Plugin directory path
 * @param {string} templatePath - Path to HTML template
 * @returns {string} - Complete HTML page
 */
export function convertMarkdownToHtml(plugin, pluginDir, templatePath) {
  // Read template
  const template = fs.readFileSync(templatePath, 'utf-8')

  // Read and parse all documentation files
  const sections = parseSections(plugin, pluginDir)

  // Determine rendering mode based on sections
  const renderMode = determineRenderMode(sections, plugin.category)

  // Generate HTML based on render mode
  let html = template

  // Replace plugin metadata
  html = html
    .replace(/\{\{plugin\.name\}\}/g, escapeHtml(plugin.name))
    .replace(/\{\{plugin\.id\}\}/g, escapeHtml(plugin.id))
    .replace(/\{\{plugin\.description\}\}/g, escapeHtml(plugin.description))
    .replace(/\{\{plugin\.category\}\}/g, escapeHtml(plugin.category))
    .replace(/\{\{plugin\.version\}\}/g, escapeHtml(plugin.version))
    .replace(/\{\{plugin\.package\}\}/g, escapeHtml(plugin.package))

  // Replace optional fields
  if (plugin.links?.npm) {
    html = html.replace(/\{\{plugin\.links\.npm\}\}/g, escapeHtml(plugin.links.npm))
  }
  if (plugin.links?.github) {
    html = html.replace(/\{\{plugin\.links\.github\}\}/g, escapeHtml(plugin.links.github))
  }

  // Replace content based on render mode
  html = injectContent(html, sections, renderMode)

  // Generate and inject hero badges
  html = injectHeroBadges(html, plugin)

  // Generate and inject plugin tags
  html = injectPluginTags(html, plugin)

  return html
}

/**
 * Inject hero badges (languages, official, version)
 */
function injectHeroBadges(html, plugin) {
  const badges = []

  // Version badge
  if (plugin.version) {
    badges.push(`<span class="hero-badge hero-badge-version">v${escapeHtml(plugin.version)}</span>`)
  }

  // Official badge
  if (plugin.official !== undefined) {
    // Check if official is true (from plugin discovery)
    const isOfficial = plugin.official === true || plugin.official === 'true'
    if (isOfficial) {
      badges.push(`<span class="hero-badge hero-badge-official">Official</span>`)
    }
  }

  // Language badges
  if (plugin.languages && plugin.languages.length > 0) {
    const langNames = {
      'nodejs': 'Node.js',
      'go': 'Go',
      'python': 'Python',
      'dotnet': '.NET',
      'rust': 'Rust'
    }
    plugin.languages.forEach(lang => {
      const displayName = langNames[lang] || lang
      badges.push(`<span class="hero-badge hero-badge-lang">${escapeHtml(displayName)}</span>`)
    })
  }

  html = html.replace(/\{\{HERO_BADGES\}\}/g, badges.join(''))
  return html
}

/**
 * Inject plugin tags in documentation section
 */
function injectPluginTags(html, plugin) {
  let tagsHtml = ''

  if (plugin.tags && plugin.tags.length > 0) {
    const tagElements = plugin.tags.map(tag =>
      `<span class="plugin-tag">${escapeHtml(tag)}</span>`
    ).join('')

    tagsHtml = `
      <div class="section-label">Tags</div>
      <div class="plugin-tags">
        ${tagElements}
      </div>
    `
  }

  html = html.replace(/\{\{PLUGIN_TAGS\}\}/g, tagsHtml)
  return html
}

/**
 * Parse markdown sections from documentation files
 * Supports both --- separators and # Language headers
 * Now also supports multi-language plugins from same manifest
 */
function parseSections(plugin, pluginDir) {
  const sections = {}

  // If plugin has multiple language implementations, process each separately
  if (plugin.langImplementations) {
    for (const [lang, langPlugin] of Object.entries(plugin.langImplementations)) {
      const normalizedLang = normalizeLangName(lang)

      for (const docFile of langPlugin.documentation) {
        const docPath = path.join(pluginDir, langPlugin.basePath, docFile)

        if (!fs.existsSync(docPath)) {
          console.warn(`⚠️  Documentation file not found: ${docPath}`)
          continue
        }

        const markdown = fs.readFileSync(docPath, 'utf-8')

        // Try to split on horizontal rules (---) first
        const parts = markdown.split(/\n---\n/)

        if (parts.length >= 2) {
          // First section is overview (for service plugins with proxy docs)
          if (!sections.overview) {
            sections.overview = md.render(parts[0].trim())
          }

          // Remaining sections are language-specific documentation
          // Use the second part as the language documentation
          if (parts.length > 1) {
            sections[normalizedLang] = md.render(parts[1].trim())
          }
        } else {
          // Single section - use as language documentation
          sections[normalizedLang] = md.render(markdown.trim())
        }
      }
    }
  } else {
    // Legacy single-language processing
    for (const docFile of plugin.documentation) {
      const docPath = path.join(pluginDir, plugin.basePath, docFile)

      if (!fs.existsSync(docPath)) {
        console.warn(`⚠️  Documentation file not found: ${docPath}`)
        continue
      }

      const markdown = fs.readFileSync(docPath, 'utf-8')

      // Try to split on horizontal rules (---) first
      const parts = markdown.split(/\n---\n/)

      if (parts.length >= 2) {
        // First section is overview (for service plugins with proxy docs)
        sections.overview = md.render(parts[0].trim())

        // Remaining sections are language-specific
        // Try to detect language from first heading or use nodejs as default
        for (let i = 1; i < parts.length; i++) {
          const part = parts[i].trim()
          const langMatch = part.match(/^#\s+(Node\.js|nodejs|Go|Python|\.NET|dotnet|Rust)/i)

          if (langMatch) {
            const lang = normalizeLangName(langMatch[1])
            sections[lang] = md.render(part)
          } else {
            // Default to nodejs if no language header found
            sections.nodejs = md.render(part)
          }
        }
      } else {
        // Single section - detect if it has language headers or use as default
        const hasLangHeaders = markdown.match(/^#\s+(Node\.js|nodejs|Go|Python|\.NET|dotnet|Rust)/im)

        if (hasLangHeaders) {
          // Split by top-level headers
          const headerSections = splitByHeaders(markdown)
          for (const [lang, content] of Object.entries(headerSections)) {
            sections[normalizeLangName(lang)] = md.render(content)
          }
        } else {
          // No separators or headers - use as nodejs content
          sections.nodejs = md.render(markdown.trim())
        }
      }
    }
  }

  return sections
}

/**
 * Split markdown by top-level headers (# Header)
 */
function splitByHeaders(markdown) {
  const sections = {}
  const lines = markdown.split('\n')
  let currentLang = null
  let currentContent = []

  for (const line of lines) {
    const headerMatch = line.match(/^#\s+(Node\.js|nodejs|Go|Python|\.NET|dotnet|Rust)/i)

    if (headerMatch) {
      // Save previous section
      if (currentLang && currentContent.length > 0) {
        sections[currentLang] = currentContent.join('\n').trim()
      }

      // Start new section
      currentLang = headerMatch[1]
      currentContent = [line]
    } else if (currentLang) {
      currentContent.push(line)
    }
  }

  // Save final section
  if (currentLang && currentContent.length > 0) {
    sections[currentLang] = currentContent.join('\n').trim()
  }

  return sections
}

/**
 * Normalize language names to consistent format
 */
function normalizeLangName(lang) {
  const normalized = lang.toLowerCase().replace(/\s+/g, '')
  const map = {
    'node.js': 'nodejs',
    'nodejs': 'nodejs',
    'go': 'go',
    'python': 'python',
    '.net': 'dotnet',
    'dotnet': 'dotnet',
    'rust': 'rust'
  }
  return map[normalized] || normalized
}

/**
 * Determine which rendering mode to use
 * - 'single': One language, no tabs (includes overview if present)
 * - 'multi-lang': Multiple languages, language tabs only (no overview)
 * - 'service-proxy': Service with overview/usage + language proxy tabs
 */
function determineRenderMode(sections, category) {
  const languages = Object.keys(sections).filter(k => k !== 'overview')
  const hasOverview = !!sections.overview
  const isService = category === 'service'

  if (languages.length === 0) {
    return 'single' // Fallback
  } else if (languages.length === 1) {
    return 'single' // Single language - show all content without tabs
  } else if (languages.length >= 2 && hasOverview && isService) {
    return 'service-proxy' // Service with overview + proxy tabs for each language
  } else {
    return 'multi-lang' // Multiple languages - language tabs only (ignore overview)
  }
}

/**
 * Inject content into template based on render mode
 */
function injectContent(html, sections, renderMode) {
  const languages = Object.keys(sections).filter(k => k !== 'overview')

  if (renderMode === 'single') {
    // Single language - no tabs, show all content (overview + language if both exist)
    const lang = languages[0] || 'nodejs'
    let content = ''

    if (sections.overview) {
      content += sections.overview + '\n'
    }
    if (sections[lang]) {
      content += sections[lang]
    }

    html = html.replace(/\{\{CONTENT_MODE\}\}/g, 'single')
    html = html.replace(/\{\{SINGLE_CONTENT\}\}/g, content)

  } else if (renderMode === 'multi-lang') {
    // Multiple languages - show language tabs only (ignore overview)
    const tabsHtml = languages.map((lang, index) => {
      const displayName = getLangDisplayName(lang)
      const active = index === 0 ? 'active' : ''
      return `<li class="tab ${active}" onclick="showTab('${lang}')">${displayName}</li>`
    }).join('')

    const contentHtml = languages.map((lang, index) => {
      const active = index === 0 ? 'active' : ''
      return `<div class="tab-content ${active}" id="${lang}">${sections[lang]}</div>`
    }).join('')

    html = html.replace(/\{\{CONTENT_MODE\}\}/g, 'multi-lang')
    html = html.replace(/\{\{TABS_HTML\}\}/g, tabsHtml)
    html = html.replace(/\{\{TABS_CONTENT_HTML\}\}/g, contentHtml)

  } else if (renderMode === 'service-proxy') {
    // Service with proxy - overview/usage tab + language proxy tabs
    const tabsHtml = [
      '<li class="tab active" onclick="showTab(\'overview\')">Usage</li>',
      ...languages.map(lang => {
        const displayName = getLangDisplayName(lang)
        return `<li class="tab" onclick="showTab('${lang}')">${displayName} Proxy</li>`
      })
    ].join('')

    const contentHtml = [
      `<div class="tab-content active" id="overview">${sections.overview || ''}</div>`,
      ...languages.map(lang => {
        return `<div class="tab-content" id="${lang}">${sections[lang]}</div>`
      })
    ].join('')

    html = html.replace(/\{\{CONTENT_MODE\}\}/g, 'service-proxy')
    html = html.replace(/\{\{TABS_HTML\}\}/g, tabsHtml)
    html = html.replace(/\{\{TABS_CONTENT_HTML\}\}/g, contentHtml)
  }

  // Clean up any remaining placeholders
  html = html.replace(/\{\{MARKDOWN_SECTION_OVERVIEW\}\}/g, sections.overview || '')
  html = html.replace(/\{\{MARKDOWN_SECTION_NODEJS\}\}/g, sections.nodejs || '')
  html = html.replace(/\{\{CONTENT_MODE\}\}/g, 'single')
  html = html.replace(/\{\{SINGLE_CONTENT\}\}/g, sections.nodejs || '')
  html = html.replace(/\{\{TABS_HTML\}\}/g, '')
  html = html.replace(/\{\{TABS_CONTENT_HTML\}\}/g, '')

  return html
}

/**
 * Get display name for language
 */
function getLangDisplayName(lang) {
  const map = {
    'nodejs': 'Node.js',
    'go': 'Go',
    'python': 'Python',
    'dotnet': '.NET',
    'rust': 'Rust'
  }
  return map[lang] || lang
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return String(text).replace(/[&<>"']/g, m => map[m])
}
