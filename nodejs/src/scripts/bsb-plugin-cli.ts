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
import { execSync, execFileSync, spawn } from 'child_process';

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

// Extract schemas directly from TypeScript source (pre-compilation)
async function extractSchemasFromSource(): Promise<void> {
  try {
    const runExtractorModule = async (scriptPath: string): Promise<void> => {
      delete require.cache[require.resolve(scriptPath)];
      const mod = require(scriptPath);
      const run = mod.extractSchemasFromSource || mod.main || mod.default;
      if (typeof run !== 'function') {
        throw new Error(`Extractor entry function not found: ${scriptPath}`);
      }
      await run();
    };

    // Use the extraction script
    const extractorPath = path.join(CWD, 'node_modules', '@bsb', 'base', 'lib', 'scripts', 'extract-schemas-from-source.js');

    if (fs.existsSync(extractorPath)) {
      info('Extracting schemas from TypeScript source');
      await runExtractorModule(extractorPath);
      success('Extracted schemas from TypeScript source');
    } else {
      // Fallback: use local compiled version or ts-node
      const localCompiledPath = path.join(__dirname, 'extract-schemas-from-source.js');
      const localTsPath = path.join(__dirname, 'extract-schemas-from-source.ts');

      if (fs.existsSync(localCompiledPath)) {
        info('Extracting schemas from TypeScript source');
        await runExtractorModule(localCompiledPath);
        success('Extracted schemas from TypeScript source');
      } else if (fs.existsSync(localTsPath)) {
        info('Extracting schemas from TypeScript source');
        execFileSync(
          process.execPath,
          ['-r', 'ts-node/register', localTsPath],
          { cwd: CWD, stdio: ['pipe', 'pipe', 'inherit'] }
        );
        success('Extracted schemas from TypeScript source');
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`  Schema extraction failed: ${message}`, 'yellow');
  }
}

// Copy schemas from src/.bsb/schemas/ to lib/schemas/ (post-compilation)
function copySchemasToLib(): void {
  const srcSchemas = path.join(CWD, 'src', '.bsb', 'schemas');
  const libSchemas = path.join(CWD, 'lib', 'schemas');

  if (!fs.existsSync(srcSchemas)) {
    return;
  }

  if (!fs.existsSync(libSchemas)) {
    fs.mkdirSync(libSchemas, { recursive: true });
  }

  const files = fs.readdirSync(srcSchemas).filter(f => f.endsWith('.json'));
  for (const file of files) {
    fs.copyFileSync(path.join(srcSchemas, file), path.join(libSchemas, file));
  }

  if (files.length > 0) {
    success(`Copied ${files.length} schema(s) to lib/schemas/`);
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

    // Create plugin metadata object - only include fields with actual values
    const pluginMetadata: Record<string, any> = {
      id: plugin.name,
      name: metadata.name,
      version: metadata.version || '1.0.0',
      description: metadata.description || '',
      category,
      tags: metadata.tags || [],
      documentation: metadata.documentation || [],
      dependencies: [] as Array<{ id: string; version: string }>,
    };

    // Only include optional fields if they have real values
    if (metadata.author) pluginMetadata.author = metadata.author;
    if (metadata.license) pluginMetadata.license = metadata.license;
    if (metadata.homepage) pluginMetadata.homepage = metadata.homepage;
    if (metadata.repository) pluginMetadata.repository = metadata.repository;
    if (metadata.image) pluginMetadata.image = metadata.image;

    // Read auto-detected dependencies and config schema from schema JSON
    const schemaPath = path.join(CWD, 'src', '.bsb', 'schemas', `${plugin.name}.json`);
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        if (Array.isArray(schema.dependencies) && schema.dependencies.length > 0) {
          pluginMetadata.dependencies = schema.dependencies;
        }
        if (schema.configSchema && typeof schema.configSchema === 'object') {
          pluginMetadata.configSchema = schema.configSchema;
        }
      } catch {
        // Non-fatal — schema may be malformed
      }
    }

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

// Generate virtual client TypeScript files from exported schemas
function generateVirtualClients(): void {
  try {
    const localSchemasDir = path.join(CWD, 'lib', 'schemas');
    const remoteSchemasDir = path.join(CWD, 'src', '.bsb', 'schemas');

    // Check if any schema source exists
    const hasLocal = fs.existsSync(localSchemasDir) &&
      fs.readdirSync(localSchemasDir).some(f => f.endsWith('.json') && !f.endsWith('.plugin.json'));
    const hasRemote = fs.existsSync(remoteSchemasDir) &&
      fs.readdirSync(remoteSchemasDir).some(f => f.endsWith('.json'));

    if (!hasLocal && !hasRemote) {
      return; // No schemas, skip
    }

    info('Generating virtual client types');

    // Use the core generator from @bsb/base
    const generatorPath = path.join(CWD, 'node_modules', '@bsb', 'base', 'lib', 'scripts', 'generate-client-types.js');

    if (fs.existsSync(generatorPath)) {
      execSync(`node "${generatorPath}"`, { cwd: CWD, stdio: 'pipe' });
      success('Generated virtual client types');
    } else {
      // Fallback: use local compiled version or ts-node
      const localCompiledPath = path.join(__dirname, 'generate-client-types.js');
      const localTsPath = path.join(__dirname, 'generate-client-types.ts');

      if (fs.existsSync(localCompiledPath)) {
        execSync(`node "${localCompiledPath}"`, { cwd: CWD, stdio: 'pipe' });
        success('Generated virtual client types');
      } else if (fs.existsSync(localTsPath)) {
        execSync(`node -r ts-node/register "${localTsPath}"`, { cwd: CWD, stdio: 'pipe' });
        success('Generated virtual client types');
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

// Generate root bsb-plugin.json as a registry-facing snippet
// This follows the hand-written schema format (id, name, basePath, image, description, tags, documentation, pluginPath, links)
// NOT a dump of the full per-plugin .plugin.json metadata
function generateRootPluginJson(): void {
  const schemasDir = path.join(CWD, 'lib', 'schemas');
  if (!fs.existsSync(schemasDir)) {
    return;
  }

  const pluginJsonFiles = fs.readdirSync(schemasDir)
    .filter((f: string) => f.endsWith('.plugin.json'));

  if (pluginJsonFiles.length === 0) {
    return;
  }

  info('Generating bsb-plugin.json');

  // Read package.json for links
  let packageJson: Record<string, any> = {};
  const packageJsonPath = path.join(CWD, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    } catch {
      // Non-fatal
    }
  }

  const plugins: Record<string, any>[] = [];
  for (const file of pluginJsonFiles) {
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(schemasDir, file), 'utf-8'));
      const id = meta.id as string;

      // Build the snippet entry following the hand-written schema
      const snippet: Record<string, any> = {
        id,
        name: meta.name,
        basePath: './',
        image: meta.image || `./${id}.png`,
        description: meta.description || '',
        tags: meta.tags || [],
        documentation: meta.documentation || [],
        pluginPath: `src/plugins/${id}/`,
      };

      // Add links from package.json repository or metadata
      const repoUrl = meta.repository || packageJson.repository?.url || packageJson.repository || '';
      if (repoUrl) {
        snippet.links = { github: typeof repoUrl === 'string' ? repoUrl : '' };
      }

      plugins.push(snippet);
    } catch {
      // Skip malformed files
    }
  }

  if (plugins.length === 0) {
    return;
  }

  const rootPluginJson = { nodejs: plugins };
  fs.writeFileSync(
    path.join(CWD, 'bsb-plugin.json'),
    JSON.stringify(rootPluginJson, null, 2),
    'utf-8'
  );

  success(`Generated bsb-plugin.json with ${plugins.length} plugin(s)`);
}

// Build the plugin
async function build(): Promise<void> {
  log('\n=== Building BSB Plugin ===\n', 'bright');

  // Step 1: Sync schemas with parent @bsb/base core plugins FIRST
  // This ensures latest types are available during compilation
  syncParentSchemas();

  // Step 2: Extract schemas from TypeScript source (pre-compilation)
  // This reads TS files directly, no compiled JS needed — breaks circular dependency
  await extractSchemasFromSource();

  // Step 3: Generate virtual clients from extracted schemas
  // These will be compiled alongside the project in step 5
  generateVirtualClients();

  // Step 4: Clean
  clean();

  // Step 5: Compile TypeScript (virtual clients in src/.bsb/clients/ compile with the project)
  exec('npx tsc', 'Compiling TypeScript');

  // Step 6: Copy non-TypeScript assets for each plugin
  const plugins = detectPluginStructure();
  for (const plugin of plugins) {
    copyPluginAssets(plugin);
  }

  // Step 7: Copy extracted schemas to lib/schemas/
  copySchemasToLib();

  // Step 8: Generate per-plugin metadata JSON (needs compiled JS for Config.metadata)
  for (const plugin of plugins) {
    generatePluginJson(plugin);
  }

  // Step 9: Generate root bsb-plugin.json (aggregates all per-plugin metadata)
  generateRootPluginJson();

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
async function dev(): Promise<void> {
  log('\n=== Development Mode ===\n', 'bright');

  // Build first
  await build();

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
async function main(): Promise<void> {
  if (!COMMAND) {
    usage();
    process.exit(1);
  }

  switch (COMMAND) {
    case 'build':
      await build();
      break;
    case 'dev':
      await dev();
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

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  error(message);
});
