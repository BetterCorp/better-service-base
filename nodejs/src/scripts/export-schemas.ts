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
import { toJSONSchema } from 'zod';

type PluginType = 'service' | 'observable' | 'events' | 'config' | 'unknown';

const OBSERVABLE_METHODS = {
  logging: ['debug', 'info', 'warn', 'error'],
  metrics: ['createCounter', 'createGauge', 'createHistogram', 'incrementCounter', 'setGauge', 'observeHistogram'],
  tracing: ['spanStart', 'spanEnd', 'spanError'],
} as const;

const EVENTS_METHODS = [
  'onBroadcast',
  'emitBroadcast',
  'onEvent',
  'emitEvent',
  'onReturnableEvent',
  'emitEventAndReturn',
  'receiveStream',
  'sendStream',
] as const;

const CONFIG_METHODS = [
  'getObservablePlugins',
  'getEventsPlugins',
  'getServicePlugins',
  'getServicePluginDefinition',
  'getPluginConfig',
] as const;

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

function inferPluginType(pluginId: string, pluginClass: any): PluginType {
  if (pluginId.startsWith('service-')) return 'service';
  if (pluginId.startsWith('observable-')) return 'observable';
  if (pluginId.startsWith('events-')) return 'events';
  if (pluginId.startsWith('config-')) return 'config';

  const baseName = pluginClass?.prototype?.constructor?.__proto__?.name || '';
  if (baseName === 'BSBService') return 'service';
  if (baseName === 'BSBObservable') return 'observable';
  if (baseName === 'BSBEvents') return 'events';
  if (baseName === 'BSBConfig') return 'config';
  return 'unknown';
}

function hasMethod(proto: any, methodName: string): boolean {
  return typeof proto?.[methodName] === 'function';
}

function buildCapabilities(pluginType: PluginType, proto: any): Record<string, unknown> | undefined {
  if (pluginType === 'observable') {
    return {
      logging: Object.fromEntries(OBSERVABLE_METHODS.logging.map((name) => [name, hasMethod(proto, name)])),
      metrics: Object.fromEntries(OBSERVABLE_METHODS.metrics.map((name) => [name, hasMethod(proto, name)])),
      tracing: Object.fromEntries(OBSERVABLE_METHODS.tracing.map((name) => [name, hasMethod(proto, name)])),
    };
  }
  if (pluginType === 'events') {
    return {
      eventsApi: Object.fromEntries(EVENTS_METHODS.map((name) => [name, hasMethod(proto, name)])),
    };
  }
  if (pluginType === 'config') {
    return {
      configApi: Object.fromEntries(CONFIG_METHODS.map((name) => [name, hasMethod(proto, name)])),
    };
  }
  return undefined;
}

/**
 * Main export function.
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
      // Get plugin identifier from directory name
      const pluginId = path.basename(path.dirname(pluginPath));

      // Import the plugin module
      const pluginModule = await import(pluginPath);

      // Look for Plugin export
      if (!pluginModule.Plugin) {
        continue;
      }

      const Plugin = pluginModule.Plugin;

      const pluginType = inferPluginType(pluginId, Plugin);
      const pluginName = Plugin.Config?.metadata?.name || pluginId;
      const pluginVersion = Plugin.Config?.metadata?.version || '1.0.0';

      let schemas: Record<string, any>;
      if (typeof Plugin.exportSchemas === 'function' && Plugin.Config && Plugin.EventSchemas) {
        schemas = Plugin.exportSchemas();
      } else {
        schemas = {
          pluginName,
          version: pluginVersion,
          events: {},
        };
      }

      schemas.pluginType = pluginType;
      const capabilities = buildCapabilities(pluginType, Plugin.prototype);
      if (capabilities) {
        schemas.capabilities = capabilities;
      }

      if (Plugin.Config) {
        try {
          const configInstance = new Plugin.Config('', '', '', '');
          if (configInstance.validationSchema && typeof configInstance.validationSchema === 'object') {
            schemas.configSchema = toJSONSchema(configInstance.validationSchema as any);
          }
        } catch {
          // Optional: if config schema extraction fails, keep going
        }
      }

      // Write to file using plugin directory name (not display name)
      const outputPath = path.join(schemasDir, `${pluginId}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(schemas, null, 2), 'utf-8');

      // eslint-disable-next-line no-console
      console.log(`  Exported schemas for ${pluginId} (v${schemas.version}, type=${pluginType})`);
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
