import { glob } from 'glob'
import { ManifestSchema } from './schema.js'
import { convertMarkdownToHtml } from './markdown-converter.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Main plugin discovery function
 * @param {object} options - Configuration options
 * @param {string} options.pluginsDir - Path to plugins directory
 * @param {string} options.tempDir - Path to temp output directory
 * @param {string} options.publicDir - Path to public directory
 * @returns {Promise<object>} - Discovery results with input pages and plugin list
 */
export async function discoverPlugins(options) {
  const { pluginsDir, tempDir, publicDir } = options

  const results = {
    plugins: [],
    inputPages: {},
    errors: []
  }

  try {
    // Find all bsb-plugin.json manifest files
    const manifestFiles = await glob('**/bsb-plugin.json', {
      cwd: pluginsDir,
      absolute: true
    })

    console.log(`📦 Found ${manifestFiles.length} manifest files`)

    // Process each manifest
    for (const manifestPath of manifestFiles) {
      try {
        await processManifest(manifestPath, pluginsDir, tempDir, publicDir, results)
      } catch (error) {
        const relativePath = path.relative(pluginsDir, manifestPath)
        console.error(`❌ Error processing ${relativePath}:`, error.message)
        results.errors.push({ manifest: relativePath, error: error.message })
      }
    }

    // Generate plugins registry JSON
    generatePluginsRegistry(results.plugins, publicDir)

    console.log(`✅ Successfully processed ${results.plugins.length} plugins`)

  } catch (error) {
    console.error('❌ Plugin discovery failed:', error)
    throw error
  }

  return results
}

/**
 * Process a single manifest file
 * Merges multi-language plugins from the same manifest into single entries
 */
async function processManifest(manifestPath, pluginsDir, tempDir, publicDir, results) {
  const pluginDir = path.dirname(manifestPath)
  const manifestContent = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

  // Validate manifest with Zod
  const manifest = ManifestSchema.parse(manifestContent)

  // Merge plugins by ID across languages in the same manifest
  const pluginsByLang = {}

  // Collect all plugin definitions grouped by language
  const languages = ['nodejs', 'go', 'python', 'dotnet', 'rust']
  for (const lang of languages) {
    if (manifest[lang]) {
      for (const plugin of manifest[lang]) {
        if (!pluginsByLang[plugin.id]) {
          pluginsByLang[plugin.id] = {}
        }
        pluginsByLang[plugin.id][lang] = plugin
      }
    }
  }

  // Process each unique plugin (may have multiple language implementations)
  for (const [pluginId, langImplementations] of Object.entries(pluginsByLang)) {
    try {
      await processMultiLangPlugin(pluginId, langImplementations, pluginDir, tempDir, publicDir, results)
    } catch (error) {
      console.error(`⚠️  Skipping plugin ${pluginId}:`, error.message)
      results.errors.push({ plugin: pluginId, error: error.message })
    }
  }
}

/**
 * Process a plugin with potential multi-language implementations
 * @param {string} pluginId - Plugin ID
 * @param {object} langImplementations - Object with language keys and plugin definitions
 */
async function processMultiLangPlugin(pluginId, langImplementations, pluginDir, tempDir, publicDir, results) {
  // Check for duplicates from other manifests
  const existingPlugin = results.plugins.find(p => p.id === pluginId)
  if (existingPlugin) {
    console.warn(`⚠️  Duplicate plugin ID "${pluginId}" found in multiple manifests. Ignoring second occurrence.`)
    return
  }

  console.log(`  Processing plugin: ${pluginId} (${Object.keys(langImplementations).join(', ')})`)

  // Use first language implementation for base metadata
  const languages = Object.keys(langImplementations)
  const baseLang = languages[0]
  const basePlugin = langImplementations[baseLang]

  // Auto-detect category from plugin ID
  const category = pluginId.split('-')[0]
  const validCategories = ['observable', 'service', 'events', 'config']
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category "${category}" derived from plugin ID "${pluginId}". Plugin IDs must start with: ${validCategories.join(', ')}`)
  }

  // Read package.json for version and package name
  const packageJsonPath = path.join(pluginDir, basePlugin.basePath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`)
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const version = packageJson.version
  const packageName = packageJson.name

  // Determine if official
  const isOfficial = pluginDir.includes('service-base/plugins/nodejs') || pluginDir.includes('service-base\\plugins\\nodejs')

  // Copy image to public directory
  let imagePath = '/assets/images/plugin-placeholder.png'
  if (basePlugin.image) {
    const imageSrc = path.join(pluginDir, basePlugin.basePath, basePlugin.image)
    if (fs.existsSync(imageSrc)) {
      const imageExt = path.extname(basePlugin.image)
      const imageDest = path.join(publicDir, 'assets', 'images', 'plugins', `${pluginId}${imageExt}`)
      fs.mkdirSync(path.dirname(imageDest), { recursive: true })
      fs.copyFileSync(imageSrc, imageDest)
      imagePath = `/assets/images/plugins/${pluginId}${imageExt}`
    } else {
      console.warn(`⚠️  Image not found for ${pluginId}: ${imageSrc}`)
    }
  }

  // Build links object
  const pluginUrl = `/plugins/${category}/${pluginId}/`
  const links = {
    ...basePlugin.links,
    npm: `https://www.npmjs.com/package/${packageName}`,
    github: basePlugin.links?.github || '',
    docs: pluginUrl
  }

  // Prepare plugin data with all language implementations
  const pluginData = {
    ...basePlugin,
    id: pluginId,
    category: category,
    version: version,
    package: packageName,
    imagePath: imagePath,
    languages: languages,
    langImplementations: langImplementations,
    official: isOfficial,
    links: links
  }

  // Convert markdown to HTML (now handles multiple languages)
  const templatePath = path.join(__dirname, 'templates', 'plugin-page.html')
  const html = convertMarkdownToHtml(pluginData, pluginDir, templatePath)

  // Write HTML to output directory
  const outputDir = path.join(tempDir, 'plugins', category, pluginId)
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'index.html')
  fs.writeFileSync(outputPath, html, 'utf-8')

  // Add to Vite input pages
  const inputKey = `plugins-${category}-${pluginId}`
  results.inputPages[inputKey] = outputPath

  // Add to plugin list for registry (reuse links and pluginUrl from above)
  results.plugins.push({
    id: pluginId,
    name: basePlugin.name,
    category: category,
    description: basePlugin.description,
    tags: basePlugin.tags,
    image: imagePath,
    official: isOfficial,
    version: version,
    package: packageName,
    links: links,
    url: pluginUrl,
    languages: languages // NEW: Track which languages are available
  })
}

/**
 * Process a single plugin (legacy - kept for backwards compatibility)
 */
async function processPlugin(plugin, pluginDir, tempDir, publicDir, results) {
  console.log(`  Processing plugin: ${plugin.id}`)

  // Auto-detect category from plugin ID (e.g., "observable-syslog" -> "observable")
  const category = plugin.id.split('-')[0]
  const validCategories = ['observable', 'service', 'events', 'config']
  if (!validCategories.includes(category)) {
    throw new Error(`Invalid category "${category}" derived from plugin ID "${plugin.id}". Plugin IDs must start with: ${validCategories.join(', ')}`)
  }

  // Read package.json to get version and package name
  const packageJsonPath = path.join(pluginDir, plugin.basePath, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found at ${packageJsonPath}`)
  }
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  const version = packageJson.version
  const packageName = packageJson.name

  // Determine if official (in main BSB repo)
  const isOfficial = pluginDir.includes('service-base/plugins/nodejs') || pluginDir.includes('service-base\\plugins\\nodejs')

  // Copy image to public directory (served by Vite, but gitignored)
  let imagePath = '/assets/images/plugin-placeholder.png'
  if (plugin.image) {
    const imageSrc = path.join(pluginDir, plugin.basePath, plugin.image)
    if (fs.existsSync(imageSrc)) {
      const imageExt = path.extname(plugin.image)
      const imageDest = path.join(publicDir, 'assets', 'images', 'plugins', `${plugin.id}${imageExt}`)
      fs.mkdirSync(path.dirname(imageDest), { recursive: true })
      fs.copyFileSync(imageSrc, imageDest)
      imagePath = `/assets/images/plugins/${plugin.id}${imageExt}`
    } else {
      console.warn(`⚠️  Image not found for ${plugin.id}: ${imageSrc}`)
    }
  }

  // Prepare plugin data for template
  const pluginData = {
    ...plugin,
    category: category,
    version: version,
    package: packageName,
    imagePath: imagePath
  }

  // Convert markdown to HTML
  const templatePath = path.join(__dirname, 'templates', 'plugin-page.html')
  const html = convertMarkdownToHtml(pluginData, pluginDir, templatePath)

  // Write HTML to output directory
  // Generate to plugins/<category>/<plugin-id> for clean URLs at /plugins/<category>/<plugin-id>/
  const outputDir = path.join(tempDir, 'plugins', category, plugin.id)
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, 'index.html')
  fs.writeFileSync(outputPath, html, 'utf-8')

  // Add to Vite input pages
  const inputKey = `plugins-${category}-${plugin.id}`
  results.inputPages[inputKey] = outputPath

  // Add to plugin list for registry
  const pluginUrl = `/plugins/${category}/${plugin.id}/`

  // Build links object with npm from package name
  const links = {
    ...plugin.links,
    npm: `https://www.npmjs.com/package/${packageName}`,
    docs: pluginUrl
  }

  results.plugins.push({
    id: plugin.id,
    name: plugin.name,
    category: category,
    description: plugin.description,
    tags: plugin.tags,
    image: imagePath,
    official: isOfficial,
    version: version,
    package: packageName,
    links: links,
    url: pluginUrl
  })
}

/**
 * Generate plugins-registry.json
 */
function generatePluginsRegistry(plugins, publicDir) {
  const registryPath = path.join(publicDir, 'assets', 'data', 'plugins-registry.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })

  const registry = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    lastUpdated: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    categories: {
      observable: {
        name: 'Observable',
        description: 'Logging and observability plugins for monitoring and debugging',
        icon: '📊',
        color: 'rgba(59, 130, 246, 0.1)'
      },
      service: {
        name: 'Service',
        description: 'Service plugins that provide core functionality and capabilities',
        icon: '⚙️',
        color: 'rgba(16, 185, 129, 0.1)'
      },
      events: {
        name: 'Events',
        description: 'Event bus plugins for inter-service communication',
        icon: '📡',
        color: 'rgba(245, 158, 11, 0.1)'
      },
      config: {
        name: 'Config',
        description: 'Configuration management plugins for different sources',
        icon: '⚙️',
        color: 'rgba(139, 92, 246, 0.1)'
      }
    },
    plugins: plugins
  }

  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8')
  console.log(`📄 Generated plugins registry: ${registryPath}`)
}
