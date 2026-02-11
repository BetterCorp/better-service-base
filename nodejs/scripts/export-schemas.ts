/**
 * BSB Schema Export Script
 *
 * Discovers all BSB plugins and exports their event schemas to JSON format
 * for cross-language client generation.
 *
 * Usage:
 *   npm run export-schemas
 *
 * Output:
 *   Writes schema JSON files to lib/schemas/{plugin-name}.json
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Discover all plugin modules in the lib directory.
 * Looks for plugin entry points in:
 * - lib/plugins/*\/index.js
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
 * Main export function.
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

  // Create schemas output directory
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }

  // Discover all plugins
  const pluginPaths = discoverPlugins(libDir);

  if (pluginPaths.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No plugins found to export schemas from.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Found ${pluginPaths.length} plugin(s) to export schemas from...`);

  let exportCount = 0;
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

      // Check if plugin has exportSchemas method
      if (typeof Plugin.exportSchemas !== 'function') {
        continue;
      }

      // Check if plugin has required static properties
      if (!Plugin.Config || !Plugin.EventSchemas) {
        continue;
      }

      // Export schemas
      const schemas = Plugin.exportSchemas();

      // Write to file
      const outputPath = path.join(schemasDir, `${schemas.pluginName}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(schemas, null, 2), 'utf-8');

      // eslint-disable-next-line no-console
      console.log(`  Exported schemas for ${schemas.pluginName} (v${schemas.version})`);
      exportCount++;
    } catch (error) {
      errorCount++;
      // eslint-disable-next-line no-console
      console.error(`  Error exporting ${path.basename(path.dirname(pluginPath))}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nSchema export complete: ${exportCount} exported, ${errorCount} errors`);
  // eslint-disable-next-line no-console
  console.log(`Schemas written to: ${schemasDir}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during schema export:', error);
    process.exit(1);
  });
}

export { main as exportSchemas };
