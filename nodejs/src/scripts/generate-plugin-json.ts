/**
 * BSB Plugin Metadata Generation Script
 *
 * Discovers all BSB plugins and generates plugin metadata JSON files
 * for plugin discovery and marketplace listing.
 *
 * Usage:
 *   npm run generate-plugin-json
 *
 * Output:
 *   Writes plugin metadata files to lib/schemas/{plugin-name}.plugin.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCategoryFromPluginName } from '../base/PluginConfig';

/**
 * Discover all plugin modules in the lib directory.
 * Looks for plugin entry points in lib/plugins/{plugin-name}/index.js
 */
function discoverPlugins(libDir: string): string[] {
  const pluginPaths: string[] = [];
  const pluginsDir = path.join(libDir, 'plugins');

  if (!fs.existsSync(pluginsDir)) {
    return pluginPaths;
  }

  const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const dir of pluginDirs) {
    const indexPath = path.join(pluginsDir, dir, 'index.js');
    if (fs.existsSync(indexPath)) {
      pluginPaths.push(indexPath);
    }
  }

  return pluginPaths;
}

/**
 * Main generation function.
 */
async function main() {
  const projectRoot = path.resolve(__dirname, '..', '..');
  const libDir = path.join(projectRoot, 'lib');
  const schemasDir = path.join(libDir, 'schemas');

  // Ensure lib directory exists (must run after build)
  if (!fs.existsSync(libDir)) {
    // eslint-disable-next-line no-console
    console.error('Error: lib directory not found. Run npm run build first.');
    process.exit(1);
  }

  // Create schemas output directory
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }

  // Discover all plugins
  const pluginPaths = discoverPlugins(libDir);

  if (pluginPaths.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No plugins found to generate metadata from.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Found ${pluginPaths.length} plugin(s) to generate metadata from...`);

  let generatedCount = 0;
  let errorCount = 0;

  // Process each plugin
  for (const pluginPath of pluginPaths) {
    try {
      // Import the plugin module
      const pluginModule = await import(pluginPath);

      // Look for Plugin export
      if (!pluginModule.Plugin) {
        continue;
      }

      const Plugin = pluginModule.Plugin;

      // Check if plugin has Config with metadata
      if (!Plugin.Config || !Plugin.Config.metadata) {
        continue;
      }

      const metadata = Plugin.Config.metadata;
      const pluginName = path.basename(path.dirname(pluginPath));

      // Read version from package.json if available
      let version = metadata.version || '1.0.0';
      const packageJsonPath = path.join(projectRoot, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        version = packageJson.version || version;
      }

      // Create plugin metadata object
      const pluginMetadata = {
        id: pluginName, // Plugin identifier from directory name
        name: metadata.name, // Display name
        version,
        description: metadata.description || '',
        author: metadata.author || '',
        license: metadata.license || '',
        homepage: metadata.homepage || '',
        repository: metadata.repository || '',
        category: getCategoryFromPluginName(pluginName), // Auto-detect from directory prefix
        tags: metadata.tags || [],
        initBeforePlugins: metadata.initBeforePlugins || [],
        initAfterPlugins: metadata.initAfterPlugins || [],
        runBeforePlugins: metadata.runBeforePlugins || [],
        runAfterPlugins: metadata.runAfterPlugins || [],
      };

      // Write to file
      const outputPath = path.join(schemasDir, `${pluginName}.plugin.json`);
      fs.writeFileSync(outputPath, JSON.stringify(pluginMetadata, null, 2), 'utf-8');

      // eslint-disable-next-line no-console
      console.log(`  Generated metadata for ${metadata.name} (v${version})`);
      generatedCount++;
    } catch (error) {
      errorCount++;
      // eslint-disable-next-line no-console
      console.error(`  Error generating metadata for ${path.basename(path.dirname(pluginPath))}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nMetadata generation complete: ${generatedCount} generated, ${errorCount} errors`);
  // eslint-disable-next-line no-console
  console.log(`Metadata files written to: ${schemasDir}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during metadata generation:', error);
    process.exit(1);
  });
}

export { main as generatePluginMetadata };
