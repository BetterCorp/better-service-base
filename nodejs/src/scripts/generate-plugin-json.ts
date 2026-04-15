/**
 * BSB Plugin Metadata Generation Script
 *
 * Discovers publishable core plugins and generates plugin metadata JSON files.
 *
 * Usage:
 *   npm run generate-plugin-json
 *
 * Output:
 *   - lib/schemas/{plugin-name}.plugin.json
 *   - bsb-plugin.json (registry-facing root manifest)
 */

import * as fs from 'fs';
import * as path from 'path';
import { getCategoryFromPluginName } from '../base/PluginConfig.js';
import { getModuleDir, isMainModule, toImportUrl } from '../base/module-runtime.js';

type PluginMeta = {
  name: string;
  description: string;
  tags: string[];
  documentation: string[];
  image?: string;
  homepage?: string;
  repository?: string;
};

const CORE_PLUGIN_OVERRIDES: Record<string, PluginMeta> = {
  'config-default': {
    name: 'config-default',
    description: 'Default configuration plugin for BSB profile and plugin resolution.',
    tags: ['core', 'config', 'default'],
    documentation: ['./docs/core-plugins/config-default.md'],
  },
  'events-default': {
    name: 'events-default',
    description: 'In-process events plugin with emit, returnable, and broadcast support.',
    tags: ['core', 'events', 'default'],
    documentation: ['./docs/core-plugins/events-default.md'],
  },
  'observable-default': {
    name: 'observable-default',
    description: 'Default console-based observable plugin for logs and diagnostics.',
    tags: ['core', 'observable', 'default'],
    documentation: ['./docs/core-plugins/observable-default.md'],
  },
};

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

function shouldPublishPlugin(pluginId: string): boolean {
  if (pluginId.startsWith('service-')) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(CORE_PLUGIN_OVERRIDES, pluginId);
}

function buildRootManifestEntries(
  pluginMetaFiles: Array<Record<string, any>>,
  packageJson: Record<string, any>,
): Array<Record<string, any>> {
  return pluginMetaFiles.map((meta) => {
    const id = meta.id as string;
    const entry: Record<string, any> = {
      id,
      name: meta.name,
      basePath: './',
      description: meta.description || '',
      tags: meta.tags || [],
      documentation: meta.documentation || [],
      pluginPath: `src/plugins/${id}/`,
    };
    if (meta.image) {
      entry.image = meta.image;
    }

    const repoUrl = meta.repository || packageJson.repository?.url || packageJson.repository || '';
    if (repoUrl) {
      entry.links = { github: typeof repoUrl === 'string' ? repoUrl : '' };
    }

    return entry;
  });
}

/**
 * Main generation function.
 */
async function main() {
  const projectRoot = path.resolve(getModuleDir(import.meta.url), '..', '..');
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

  const packageJsonPath = path.join(projectRoot, 'package.json');
  let packageJson: Record<string, any> = {};
  if (fs.existsSync(packageJsonPath)) {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
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
  const generatedPluginMetadata: Array<Record<string, any>> = [];

  // Process each plugin
  for (const pluginPath of pluginPaths) {
    try {
      const pluginName = path.basename(path.dirname(pluginPath));
      if (!shouldPublishPlugin(pluginName)) {
        continue;
      }

      // Import the plugin module
      const pluginModule = await import(toImportUrl(pluginPath));

      // Look for Plugin export
      if (!pluginModule.Plugin) {
        continue;
      }

      const Plugin = pluginModule.Plugin;
      const metadata = (Plugin.Config && Plugin.Config.metadata)
        ? Plugin.Config.metadata
        : CORE_PLUGIN_OVERRIDES[pluginName];

      if (!metadata) {
        continue;
      }

      // Read version from package.json if available
      const version = packageJson.version || '1.0.0';

      // Create plugin metadata object - only include fields with actual values
      const pluginMetadata: Record<string, any> = {
        id: pluginName,
        name: metadata.name,
        version,
        description: metadata.description || '',
        category: getCategoryFromPluginName(pluginName),
        tags: metadata.tags || [],
        documentation: Array.isArray(metadata.documentation) ? metadata.documentation : [],
        dependencies: [] as Array<{ id: string; version: string }>,
      };

      // Only include optional fields if they have real values
      if (packageJson.author) pluginMetadata.author = packageJson.author;
      if (packageJson.license) pluginMetadata.license = packageJson.license;
      if (metadata.homepage) pluginMetadata.homepage = metadata.homepage;
      if (metadata.repository) pluginMetadata.repository = metadata.repository;
      if (metadata.image) pluginMetadata.image = metadata.image;

      // Read auto-detected dependencies and config schema from schema JSON
      const schemaJsonPath = path.join(schemasDir, `${pluginName}.json`);
      if (fs.existsSync(schemaJsonPath)) {
        try {
          const schema = JSON.parse(fs.readFileSync(schemaJsonPath, 'utf-8'));
          if (Array.isArray(schema.dependencies) && schema.dependencies.length > 0) {
            pluginMetadata.dependencies = schema.dependencies;
          }
          if (schema.configSchema && typeof schema.configSchema === 'object') {
            pluginMetadata.configSchema = schema.configSchema;
          }
        } catch {
          // Non-fatal, skip malformed schema
        }
      }

      // Write to file
      const outputPath = path.join(schemasDir, `${pluginName}.plugin.json`);
      fs.writeFileSync(outputPath, JSON.stringify(pluginMetadata, null, 2), 'utf-8');
      generatedPluginMetadata.push(pluginMetadata);

      // eslint-disable-next-line no-console
      console.log(`  Generated metadata for ${metadata.name} (v${version})`);
      generatedCount++;
    } catch (error) {
      errorCount++;
      // eslint-disable-next-line no-console
      console.error(`  Error generating metadata for ${path.basename(path.dirname(pluginPath))}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Generate root bsb-plugin.json manifest for registry publish workflow
  if (generatedPluginMetadata.length > 0) {
    const rootPluginJson = {
      nodejs: buildRootManifestEntries(generatedPluginMetadata, packageJson),
    };
    fs.writeFileSync(
      path.join(projectRoot, 'bsb-plugin.json'),
      JSON.stringify(rootPluginJson, null, 2),
      'utf-8',
    );
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
if (isMainModule(import.meta.url)) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during metadata generation:', error);
    process.exit(1);
  });
}

export { main as generatePluginMetadata };
