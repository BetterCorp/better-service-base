#!/usr/bin/env node
/**
 * BSB Plugin CLI
 *
 * Unified build and development scripts for BSB plugins.
 * Works across Windows, Linux, and macOS.
 *
 * Usage:
 *   bsb-plugin-cli build   - Clean, compile, copy static files
 *   bsb-plugin-cli dev     - Build and start in development mode
 *   bsb-plugin-cli start   - Start the BSB service
 *   bsb-plugin-cli test    - Run tests
 *   bsb-plugin-cli clean   - Remove build artifacts
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';

interface PluginInfo {
  name: string;
  srcDir: string;
  destDir: string;
}

type ColorName = 'reset' | 'bright' | 'red' | 'green' | 'yellow' | 'blue' | 'cyan';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: ColorName = 'reset'): void {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message: string): never {
  log(`ERROR: ${message}`, 'red');
  process.exit(1);
}

function success(message: string): void {
  log(`[OK] ${message}`, 'green');
}

function info(message: string): void {
  log(`→ ${message}`, 'cyan');
}

// Get the current working directory (plugin root)
const CWD = process.cwd();
const COMMAND = process.argv[2];

// Detect plugin structure
function detectPluginStructure(): PluginInfo[] {
  const srcDir = path.join(CWD, 'src');
  const pluginsDir = path.join(srcDir, 'plugins');

  if (!fs.existsSync(pluginsDir)) {
    error('No src/plugins directory found. Are you in a BSB plugin directory?');
  }

  const pluginDirs = fs.readdirSync(pluginsDir).filter((name: string) => {
    const fullPath = path.join(pluginsDir, name);
    return fs.statSync(fullPath).isDirectory();
  });

  if (pluginDirs.length === 0) {
    error('No plugin directories found in src/plugins');
  }

  // Support multiple plugins in one package
  const plugins: PluginInfo[] = pluginDirs.map((pluginName: string) => {
    return {
      name: pluginName,
      srcDir: path.join(pluginsDir, pluginName),
      destDir: path.join(CWD, 'lib', 'plugins', pluginName),
    };
  });

  return plugins;
}

// Execute command with error handling
function exec(command: string, description: string): void {
  try {
    info(description);
    execSync(command, { cwd: CWD, stdio: 'inherit' });
    success(description);
  } catch (err) {
    error(`Failed to ${description.toLowerCase()}`);
  }
}

// Clean build artifacts
function clean(): void {
  info('Cleaning build artifacts');
  const libDir = path.join(CWD, 'lib');

  if (fs.existsSync(libDir)) {
    fs.rmSync(libDir, { recursive: true, force: true });
    success('Cleaned lib directory');
  } else {
    info('Nothing to clean');
  }
}

// Recursively copy non-TypeScript files
function copyNonTypeScriptFiles(srcDir: string, destDir: string): number {
  let copiedCount = 0;

  function walkDir(currentSrc: string, currentDest: string): void {
    if (!fs.existsSync(currentSrc)) {
      return;
    }

    const entries = fs.readdirSync(currentSrc, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(currentSrc, entry.name);
      const destPath = path.join(currentDest, entry.name);

      if (entry.isDirectory()) {
        // Recursively walk subdirectories
        walkDir(srcPath, destPath);
      } else if (entry.isFile()) {
        // Check if file is NOT .ts or .tsx
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== '.ts' && ext !== '.tsx') {
          // Ensure destination directory exists
          const destDirPath = path.dirname(destPath);
          if (!fs.existsSync(destDirPath)) {
            fs.mkdirSync(destDirPath, { recursive: true });
          }

          // Copy the file
          fs.copyFileSync(srcPath, destPath);
          copiedCount++;
        }
      }
    }
  }

  walkDir(srcDir, destDir);
  return copiedCount;
}

// Copy non-TypeScript assets for a plugin
function copyPluginAssets(plugin: PluginInfo): void {
  info(`Copying non-TypeScript assets for ${plugin.name}`);

  const copiedCount = copyNonTypeScriptFiles(plugin.srcDir, plugin.destDir);

  if (copiedCount > 0) {
    success(`Copied ${copiedCount} asset file(s) for ${plugin.name}`);
  } else {
    info(`No asset files found for ${plugin.name}`);
  }
}

// Export schemas for a plugin
function exportSchemas(plugin: PluginInfo): void {
  try {
    // Try to load the compiled plugin
    const pluginPath = path.join(plugin.destDir, 'index.js');
    if (!fs.existsSync(pluginPath)) {
      return; // No index.js, skip
    }

    // Clear require cache to get fresh module
    delete require.cache[require.resolve(pluginPath)];
    const pluginModule = require(pluginPath);

    // Check if plugin has exportSchemas static method
    if (!pluginModule.Plugin || typeof pluginModule.Plugin.exportSchemas !== 'function') {
      return; // No exportSchemas method, skip
    }

    info(`Exporting schemas for ${plugin.name}`);

    // Call exportSchemas
    const schemas = pluginModule.Plugin.exportSchemas();

    // Create schemas directory
    const schemasDir = path.join(CWD, 'lib', 'schemas');
    if (!fs.existsSync(schemasDir)) {
      fs.mkdirSync(schemasDir, { recursive: true });
    }

    // Write schemas to file
    const schemaFile = path.join(schemasDir, `${plugin.name}.json`);
    fs.writeFileSync(schemaFile, JSON.stringify(schemas, null, 2), 'utf-8');

    success(`Exported schemas for ${plugin.name}`);
  } catch (err) {
    // Silently skip if export fails (plugin might not support it)
  }
}

// Generate plugin metadata JSON
function generatePluginJson(plugin: PluginInfo): void {
  try {
    // Try to load the compiled plugin
    const pluginPath = path.join(plugin.destDir, 'index.js');
    if (!fs.existsSync(pluginPath)) {
      return; // No index.js, skip
    }

    // Clear require cache to get fresh module
    delete require.cache[require.resolve(pluginPath)];
    const pluginModule = require(pluginPath);

    // Check if plugin has Config with metadata
    if (!pluginModule.Config || !pluginModule.Config.metadata) {
      return; // No Config metadata, skip
    }

    info(`Generating plugin metadata for ${plugin.name}`);

    const metadata = pluginModule.Config.metadata;

    // Auto-detect category from plugin directory name
    const category = plugin.name.startsWith('service-') ? 'service' :
                     plugin.name.startsWith('observable-') ? 'observable' :
                     plugin.name.startsWith('events-') ? 'events' :
                     plugin.name.startsWith('config-') ? 'config' : 'other';

    // Create plugin metadata object
    const pluginMetadata = {
      id: plugin.name, // Plugin identifier from directory name
      name: metadata.name, // Display name
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      author: metadata.author || '',
      license: metadata.license || '',
      homepage: metadata.homepage || '',
      repository: metadata.repository || '',
      category, // Auto-detected from directory prefix
      tags: metadata.tags || [],
      initBeforePlugins: metadata.initBeforePlugins || [],
      initAfterPlugins: metadata.initAfterPlugins || [],
      runBeforePlugins: metadata.runBeforePlugins || [],
      runAfterPlugins: metadata.runAfterPlugins || [],
    };

    // Create schemas directory
    const schemasDir = path.join(CWD, 'lib', 'schemas');
    if (!fs.existsSync(schemasDir)) {
      fs.mkdirSync(schemasDir, { recursive: true });
    }

    // Write plugin metadata
    const metadataFile = path.join(schemasDir, `${plugin.name}.plugin.json`);
    fs.writeFileSync(metadataFile, JSON.stringify(pluginMetadata, null, 2), 'utf-8');

    success(`Generated plugin metadata for ${plugin.name}`);
  } catch (err) {
    // Silently skip if generation fails
  }
}

// Generate TypeScript client types from exported schemas
function generateClientTypes(): void {
  try {
    const schemasDir = path.join(CWD, 'lib', 'schemas');

    // Check if schemas directory exists and has files
    if (!fs.existsSync(schemasDir)) {
      return; // No schemas, skip
    }

    const schemaFiles = fs.readdirSync(schemasDir).filter(f => f.endsWith('.json') && !f.endsWith('.plugin.json'));
    if (schemaFiles.length === 0) {
      return; // No schema files, skip
    }

    info('Generating TypeScript client types');

    // Create types directory
    const typesDir = path.join(CWD, 'lib', 'types');
    if (!fs.existsSync(typesDir)) {
      fs.mkdirSync(typesDir, { recursive: true });
    }

    // Use the core generator from @bsb/base
    const generatorPath = path.join(CWD, 'node_modules', '@bsb', 'base', 'lib', 'scripts', 'generate-client-types.js');

    if (fs.existsSync(generatorPath)) {
      // Call the core generator (it will process all schema files)
      execSync(`node "${generatorPath}"`, { cwd: CWD, stdio: 'pipe' });
      success(`Generated TypeScript types for ${schemaFiles.length} plugin(s)`);
    } else {
      // Fallback: use local ts-node version if available
      const localGeneratorPath = path.join(__dirname, 'generate-client-types.ts');
      if (fs.existsSync(localGeneratorPath)) {
        execSync(`node -r ts-node/register "${localGeneratorPath}"`, { cwd: CWD, stdio: 'pipe' });
        success(`Generated TypeScript types for ${schemaFiles.length} plugin(s)`);
      }
    }
  } catch (err) {
    // Silently skip if generation fails
  }
}

// Sync schemas with parent @bsb/base project
function syncParentSchemas(): void {
  try {
    // Check if @bsb/base is installed (indicates this is a plugin project)
    const bsbBasePath = path.join(CWD, 'node_modules', '@bsb', 'base');
    if (!fs.existsSync(bsbBasePath)) {
      return; // Not a plugin project, skip
    }

    // Resolve symlink to get actual path (important for monorepos)
    const bsbBaseRealPath = fs.realpathSync(bsbBasePath);

    // Check if BSB CLI exists
    const bsbCliPath = path.join(bsbBaseRealPath, 'lib', 'cli.js');
    if (!fs.existsSync(bsbCliPath)) {
      return; // BSB CLI not found, skip
    }

    info('Syncing schemas with @bsb/base core plugins');

    // Run client sync in the @bsb/base directory to export its schemas and regenerate types
    execSync(`node "${bsbCliPath}" client sync`, { cwd: bsbBaseRealPath, stdio: 'pipe' });

    success('Synced schemas with @bsb/base core plugins');
  } catch (err) {
    // Silently skip if sync fails (parent might not have schemas)
  }
}

// Build the plugin
function build(): void {
  log('\n=== Building BSB Plugin ===\n', 'bright');

  // Step 1: Sync schemas with parent @bsb/base core plugins FIRST
  // This ensures latest types are available during compilation
  syncParentSchemas();

  // Step 2: Clean
  clean();

  // Step 3: Compile TypeScript (now has latest types from parent)
  exec('npx tsc', 'Compiling TypeScript');

  // Step 4: Copy non-TypeScript assets for each plugin
  const plugins = detectPluginStructure();
  for (const plugin of plugins) {
    copyPluginAssets(plugin);
  }

  // Step 5: Export schemas for each plugin
  for (const plugin of plugins) {
    exportSchemas(plugin);
  }

  // Step 6: Generate plugin metadata JSON
  for (const plugin of plugins) {
    generatePluginJson(plugin);
  }

  // Step 7: Generate TypeScript client types (runs once for all plugins)
  generateClientTypes();

  log('\n' + colors.green + colors.bright + '[BUILD COMPLETE]' + colors.reset + '\n');
}

// Start the BSB service
function start(): void {
  log('\n=== Starting BSB Service ===\n', 'bright');

  // Find the BSB CLI
  const bsbCliPath = path.join(CWD, 'node_modules', '@bsb', 'base', 'lib', 'cli.js');

  if (!fs.existsSync(bsbCliPath)) {
    error('BSB CLI not found. Make sure @bsb/base is installed.');
  }

  info('Starting service');

  // Spawn the process and inherit stdio for real-time output
  const child = spawn('node', [bsbCliPath], {
    cwd: CWD,
    stdio: 'inherit',
  });

  // Handle process exit
  child.on('exit', (code) => {
    if (code !== 0) {
      error(`Service exited with code ${code}`);
    }
    process.exit(code);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    info('Shutting down service');
    child.kill('SIGINT');
  });
}

// Development mode (build + start)
function dev(): void {
  log('\n=== Development Mode ===\n', 'bright');

  // Build first
  build();

  // Then start
  start();
}

// Run tests
function test(): void {
  log('\n=== Running Tests ===\n', 'bright');

  // Check if test script exists in package.json
  const packageJsonPath = path.join(CWD, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    error('package.json not found');
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const testScript = packageJson.scripts?.['test:run'];

  if (!testScript) {
    log('No test:run script defined in package.json', 'yellow');
    info('Define a "test:run" script in package.json to enable testing');
    process.exit(0);
  }

  // Run the test script
  exec('npm run test:run', 'Running tests');

  log('\n' + colors.green + colors.bright + '[TESTS COMPLETE]' + colors.reset + '\n');
}

// Show usage
function usage(): void {
  console.log(`
${colors.bright}BSB Plugin CLI${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx bsb-plugin-cli <command>

${colors.cyan}Commands:${colors.reset}
  ${colors.green}build${colors.reset}   - Clean, compile TypeScript, copy static files
  ${colors.green}dev${colors.reset}     - Build and start in development mode
  ${colors.green}start${colors.reset}   - Start the BSB service
  ${colors.green}test${colors.reset}    - Run tests (requires test:run script)
  ${colors.green}clean${colors.reset}   - Remove build artifacts (lib directory)

${colors.cyan}Examples:${colors.reset}
  npx bsb-plugin-cli build
  npx bsb-plugin-cli dev
  npx bsb-plugin-cli start

${colors.cyan}Package.json Integration:${colors.reset}
  {
    "scripts": {
      "build": "bsb-plugin-cli build",
      "dev": "bsb-plugin-cli dev",
      "start": "bsb-plugin-cli start",
      "test": "bsb-plugin-cli test",
      "clean": "bsb-plugin-cli clean"
    }
  }
`);
}

// Main entry point
function main(): void {
  if (!COMMAND) {
    usage();
    process.exit(1);
  }

  switch (COMMAND) {
    case 'build':
      build();
      break;
    case 'dev':
      dev();
      break;
    case 'start':
      start();
      break;
    case 'test':
      test();
      break;
    case 'clean':
      clean();
      break;
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;
    default:
      error(`Unknown command: ${COMMAND}\n`);
      usage();
      process.exit(1);
  }
}

main();
