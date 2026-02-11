/**
 * BSB Plugin JSON Generator
 *
 * Auto-generates plugin metadata JSON files from Config metadata.
 * All generated files are stored in lib/schemas/ directory:
 * - {plugin-name}.plugin.json - Individual plugin metadata
 * - plugin-registry.json - Central registry referencing all plugins
 *
 * Usage:
 *   npm run generate-plugin-json
 *
 * Output:
 *   lib/schemas/{plugin-name}.plugin.json
 *   lib/schemas/plugin-registry.json
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Plugin JSON structure for {plugin-name}.plugin.json
 */
interface BSBPluginJSON {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: string;
  category?: string;
  tags?: string[];
  entrypoint: string;
  configSchema?: string;
  dependencies?: {
    initBefore?: string[];
    initAfter?: string[];
    runBefore?: string[];
    runAfter?: string[];
  };
  // Reference to event schema JSON
  eventSchemas?: string;
}

/**
 * Central plugin registry structure
 */
interface BSBPluginRegistry {
  $schema?: string;
  version: string;
  description: string;
  plugins: Array<{
    $ref: string;  // Reference to plugin JSON file
  }>;
}

/**
 * Discover all plugin modules in the lib directory.
 * Looks for plugin entry points in:
 * - lib/plugins/*\/index.js
 */
function discoverPlugins(libDir: string): Array<{ libPath: string; pluginName: string }> {
  const plugins: Array<{ libPath: string; pluginName: string }> = [];
  const pluginsLibDir = path.join(libDir, 'plugins');

  if (!fs.existsSync(pluginsLibDir)) {
    return plugins;
  }

  const pluginDirs = fs.readdirSync(pluginsLibDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const dir of pluginDirs) {
    const libPath = path.join(pluginsLibDir, dir, 'index.js');
    if (fs.existsSync(libPath)) {
      plugins.push({ libPath, pluginName: dir });
    }
  }

  return plugins;
}

/**
 * Main generation function.
 */
async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const libDir = path.join(projectRoot, 'lib');
  const schemasDir = path.join(libDir, 'schemas');

  // Ensure lib directory exists (must run after build)
  if (!fs.existsSync(libDir)) {
    // eslint-disable-next-line no-console
    console.error('Error: lib directory not found. Run npm run build first.');
    process.exit(1);
  }

  // Ensure schemas directory exists
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }

  // Discover all plugins
  const plugins = discoverPlugins(libDir);

  if (plugins.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No plugins found to generate plugin metadata for.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Found ${plugins.length} plugin(s) to generate metadata for...`);

  let generateCount = 0;
  let errorCount = 0;
  const pluginRefs: Array<{ $ref: string }> = [];

  // Process each plugin
  for (const plugin of plugins) {
    try {
      // Import the plugin module
      const pluginModule = await import(plugin.libPath);

      // Look for Plugin export
      if (!pluginModule.Plugin) {
        continue;
      }

      const Plugin = pluginModule.Plugin;

      // Check if plugin has Config
      if (!Plugin.Config || !Plugin.Config.metadata) {
        continue;
      }

      const meta = Plugin.Config.metadata;
      const pluginName = meta.name;

      // Relative path from lib root to plugin entrypoint
      const relativeEntrypoint = path.relative(libDir, plugin.libPath).replace(/\\/g, '/');

      // Build plugin JSON
      const pluginJSON: BSBPluginJSON = {
        name: meta.name,
        version: meta.version || '1.0.0',
        description: meta.description,
        entrypoint: relativeEntrypoint,
      };

      // Add optional fields
      if (meta.author) pluginJSON.author = meta.author;
      if (meta.license) pluginJSON.license = meta.license;
      if (meta.homepage) pluginJSON.homepage = meta.homepage;
      if (meta.repository) pluginJSON.repository = meta.repository;
      if (meta.category) pluginJSON.category = meta.category;
      if (meta.tags && meta.tags.length > 0) pluginJSON.tags = meta.tags;

      // Add config schema reference (relative to lib dir)
      pluginJSON.configSchema = `${relativeEntrypoint}#${pluginName}ConfigSchema`;

      // Add event schemas reference if it exists
      const eventSchemaPath = path.join(schemasDir, `${pluginName}.json`);
      if (fs.existsSync(eventSchemaPath)) {
        pluginJSON.eventSchemas = `./${pluginName}.json`;
      }

      // Add dependencies
      const hasDeps = meta.initBeforePlugins || meta.initAfterPlugins || meta.runBeforePlugins || meta.runAfterPlugins;
      if (hasDeps) {
        pluginJSON.dependencies = {};
        if (meta.initBeforePlugins && meta.initBeforePlugins.length > 0) {
          pluginJSON.dependencies.initBefore = meta.initBeforePlugins;
        }
        if (meta.initAfterPlugins && meta.initAfterPlugins.length > 0) {
          pluginJSON.dependencies.initAfter = meta.initAfterPlugins;
        }
        if (meta.runBeforePlugins && meta.runBeforePlugins.length > 0) {
          pluginJSON.dependencies.runBefore = meta.runBeforePlugins;
        }
        if (meta.runAfterPlugins && meta.runAfterPlugins.length > 0) {
          pluginJSON.dependencies.runAfter = meta.runAfterPlugins;
        }
      }

      // Write to schemas directory
      const outputPath = path.join(schemasDir, `${pluginName}.plugin.json`);
      fs.writeFileSync(outputPath, JSON.stringify(pluginJSON, null, 2), 'utf-8');

      // Add to registry
      pluginRefs.push({ $ref: `./${pluginName}.plugin.json` });

      // eslint-disable-next-line no-console
      console.log(`  Generated ${pluginName}.plugin.json`);
      generateCount++;
    } catch (error) {
      errorCount++;
      // eslint-disable-next-line no-console
      console.error(`  Error generating for ${plugin.pluginName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate central plugin registry
  if (generateCount > 0) {
    const registry: BSBPluginRegistry = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      version: '1.0.0',
      description: 'BSB Plugin Registry - references all available plugins',
      plugins: pluginRefs,
    };

    const registryPath = path.join(schemasDir, 'plugin-registry.json');
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

    // eslint-disable-next-line no-console
    console.log(`  Generated plugin-registry.json (${generateCount} plugin references)`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nPlugin metadata generation complete: ${generateCount} generated, ${errorCount} errors`);
  // eslint-disable-next-line no-console
  console.log(`Files written to: ${schemasDir}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during plugin JSON generation:', error);
    process.exit(1);
  });
}

export { main as generatePluginJSON };
