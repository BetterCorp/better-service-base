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

import { execSync, execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import chokidar, { FSWatcher } from 'chokidar';
import { getModuleDir, toImportUrl } from '../base/module-runtime.js';
import {
  runHook as runHookImpl,
  runHookDev as runHookDevImpl,
  type HookName,
  type HookLogger,
} from './build-hooks.js';
import { isDevIgnoredPath, resolveDevIgnorePatterns } from './dev-config.js';

interface PluginInfo {
  name: string;
  srcDir: string;
  destDir: string;
}

interface BuildCacheState {
  version: 1;
  coreSchemasHash?: string;
  schemaInputsHash?: string;
  clientInputsHash?: string;
  metadataInputsHash?: string;
}

interface BuildOptions {
  clean?: boolean;
  incremental?: boolean;
  changedPaths?: string[];
}

interface SchemaPreparationState {
  plugins: PluginInfo[];
  coreSchemasHash: string;
  schemaInputsHash: string;
  generatedSchemasHash: string;
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
const MODULE_DIR = getModuleDir(import.meta.url);
const BSB_DIR = path.join(CWD, 'src', '.bsb');
const CACHE_DIR = path.join(BSB_DIR, 'cache');
const BUILD_CACHE_PATH = path.join(CACHE_DIR, 'build-state.json');
const TSC_BUILD_INFO_PATH = path.join(CACHE_DIR, 'tsc.tsbuildinfo');
const DEV_WATCH_PATHS = [
  path.join(CWD, 'package.json'),
  path.join(CWD, 'sec-config.yaml'),
  path.join(CWD, 'src'),
];
const DEV_IGNORE_PATTERNS = resolveDevIgnorePatterns(CWD);
const SCHEMA_FILE_BASENAMES = new Set([
  'index.ts',
  'index.tsx',
  'config.ts',
  'config.tsx',
  'events.ts',
  'events.tsx',
  'schema.ts',
  'schema.tsx',
  'schemas.ts',
  'schemas.tsx',
  'types.ts',
  'types.tsx',
]);

function readPackageJson(): Record<string, any> {
  const packageJsonPath = path.join(CWD, 'package.json');
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

function normalizeChangedPath(filePath: string): string {
  const resolvedPath = path.isAbsolute(filePath) ? path.relative(CWD, filePath) : filePath;
  return normalizePath(resolvedPath);
}

function hashStrings(values: string[]): string {
  const hash = createHash('sha256');
  for (const value of values.sort()) {
    hash.update(value);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function hashFile(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function collectFilesRecursive(
  dirPath: string,
  predicate: (filePath: string) => boolean,
): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const files: string[] = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) {
          stack.push(fullPath);
        }
      } else if (entry.isFile() && predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function readBuildCache(): BuildCacheState {
  try {
    if (!fs.existsSync(BUILD_CACHE_PATH)) {
      return { version: 1 };
    }
    const parsed = JSON.parse(fs.readFileSync(BUILD_CACHE_PATH, 'utf-8')) as BuildCacheState;
    if (parsed.version === 1) {
      return parsed;
    }
  } catch {
    // Ignore malformed cache files.
  }
  return { version: 1 };
}

function writeBuildCache(cache: BuildCacheState): void {
  ensureDir(CACHE_DIR);
  fs.writeFileSync(BUILD_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

function getCoreSchemasHash(): string {
  const bsbBasePath = resolveBsbBasePath();
  if (!bsbBasePath) {
    return '';
  }

  const packageJsonPath = path.join(bsbBasePath, 'package.json');
  const inputs = [fs.existsSync(packageJsonPath) ? `pkg:${hashFile(packageJsonPath)}` : 'pkg:missing'];
  const sourcePluginsDir = path.join(bsbBasePath, 'src', 'plugins');

  if (fs.existsSync(sourcePluginsDir)) {
    inputs.push(
      ...collectFilesRecursive(sourcePluginsDir, (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.ts' && ext !== '.tsx') {
          return false;
        }
        return SCHEMA_FILE_BASENAMES.has(path.basename(filePath));
      }).map((filePath) => `${normalizePath(path.relative(bsbBasePath, filePath))}:${hashFile(filePath)}`),
    );
  } else {
    const schemaDir = path.join(bsbBasePath, 'lib', 'schemas');
    inputs.push(
      ...collectFilesRecursive(schemaDir, (filePath) => filePath.endsWith('.json'))
        .map((filePath) => `${normalizePath(path.relative(bsbBasePath, filePath))}:${hashFile(filePath)}`),
    );
  }

  return hashStrings(inputs);
}

function getSchemaInputsHash(plugins: PluginInfo[], coreSchemasHash: string): string {
  const inputs = [`core:${coreSchemasHash}`];
  const packageJsonPath = path.join(CWD, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    inputs.push(`pkg:${hashFile(packageJsonPath)}`);
  }

  for (const plugin of plugins) {
    const pluginFiles = collectFilesRecursive(plugin.srcDir, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (ext !== '.ts' && ext !== '.tsx') {
        return false;
      }
      return SCHEMA_FILE_BASENAMES.has(path.basename(filePath));
    });
    for (const filePath of pluginFiles) {
      inputs.push(`${normalizePath(path.relative(CWD, filePath))}:${hashFile(filePath)}`);
    }
  }

  return hashStrings(inputs);
}

function getGeneratedSchemasHash(): string {
  const schemaDir = path.join(CWD, 'src', '.bsb', 'schemas');
  const schemaFiles = collectFilesRecursive(schemaDir, (filePath) => filePath.endsWith('.json'));
  if (schemaFiles.length === 0) {
    return '';
  }

  return hashStrings(
    schemaFiles.map((filePath) => `${normalizePath(path.relative(CWD, filePath))}:${hashFile(filePath)}`),
  );
}

function hasGeneratedSchemas(): boolean {
  const schemaDir = path.join(CWD, 'src', '.bsb', 'schemas');
  return fs.existsSync(schemaDir) && fs.readdirSync(schemaDir).some((file) => file.endsWith('.json'));
}

function hasGeneratedClients(): boolean {
  const clientsDir = path.join(CWD, 'src', '.bsb', 'clients');
  return fs.existsSync(clientsDir) && fs.readdirSync(clientsDir).some((file) => file.endsWith('.ts'));
}

function isTsSourcePath(filePath: string): boolean {
  const normalized = normalizeChangedPath(filePath);
  return normalized.startsWith('src/') && (normalized.endsWith('.ts') || normalized.endsWith('.tsx'));
}

function isSchemaRelevantPath(filePath: string): boolean {
  const normalized = normalizeChangedPath(filePath);
  if (normalized === 'package.json') {
    return true;
  }
  if (!isTsSourcePath(normalized)) {
    return false;
  }
  return SCHEMA_FILE_BASENAMES.has(path.basename(normalized));
}

function isAssetPath(filePath: string): boolean {
  const normalized = normalizeChangedPath(filePath);
  if (!normalized.startsWith('src/plugins/')) {
    return false;
  }
  const ext = path.extname(normalized).toLowerCase();
  return ext !== '.ts' && ext !== '.tsx';
}

function isStaticAssetPath(filePath: string): boolean {
  return normalizeChangedPath(filePath).includes('/static/');
}

function isConfigPath(filePath: string): boolean {
  const normalized = normalizeChangedPath(filePath);
  return normalized === 'sec-config.yaml' || normalized === 'package.json';
}

function copySingleAssetFile(changedPath: string): boolean {
  const normalized = normalizeChangedPath(changedPath);
  if (!isAssetPath(normalized)) {
    return false;
  }

  const absoluteSource = path.join(CWD, normalized);
  const relativeToSrc = path.relative(path.join(CWD, 'src'), absoluteSource);
  const destination = path.join(CWD, 'lib', relativeToSrc);

  if (fs.existsSync(absoluteSource)) {
    ensureDir(path.dirname(destination));
    fs.copyFileSync(absoluteSource, destination);
  } else if (fs.existsSync(destination)) {
    fs.rmSync(destination, { force: true });
  }

  return true;
}

function hasLibSchemas(): boolean {
  const libSchemas = path.join(CWD, 'lib', 'schemas');
  return fs.existsSync(libSchemas) && fs.readdirSync(libSchemas).some((file) => file.endsWith('.json'));
}

function hasPluginMetadataOutputs(plugins: PluginInfo[]): boolean {
  const schemasDir = path.join(CWD, 'lib', 'schemas');
  return plugins.every((plugin) => fs.existsSync(path.join(schemasDir, `${plugin.name}.plugin.json`)));
}

function getMetadataInputsHash(plugins: PluginInfo[]): string {
  const packageJsonPath = path.join(CWD, 'package.json');
  const inputs: string[] = [];

  if (fs.existsSync(packageJsonPath)) {
    inputs.push(`pkg:${hashFile(packageJsonPath)}`);
  }

  for (const plugin of plugins) {
    const indexPath = path.join(plugin.srcDir, 'index.ts');
    if (fs.existsSync(indexPath)) {
      inputs.push(`${normalizePath(path.relative(CWD, indexPath))}:${hashFile(indexPath)}`);
    }

    const schemaPath = path.join(CWD, 'src', '.bsb', 'schemas', `${plugin.name}.json`);
    if (fs.existsSync(schemaPath)) {
      inputs.push(`${normalizePath(path.relative(CWD, schemaPath))}:${hashFile(schemaPath)}`);
    }
  }

  return hashStrings(inputs);
}

// Resolve @bsb/base package root using Node module resolution.
// Handles npm workspaces (hoisted node_modules), symlinks, and pnpm.
function resolveBsbBasePath(): string | null {
  try {
    const require = createRequire(path.join(CWD, 'package.json'));
    const pkgJsonPath = require.resolve('@bsb/base/package.json');
    return path.dirname(pkgJsonPath);
  } catch {
    return null;
  }
}

interface RestrictedPattern {
  pattern: RegExp;
  name: string;
  message: string;
  /** Only 'require' | 'worker_threads' can be overridden via bsb.allow in package.json. Not recommended. */
  allowKey?: 'require' | 'worker_threads';
  /** Auto-skipped for specific plugin types based on directory name prefix. */
  skipForPluginType?: 'observable' | 'config';
}

interface SourceViolation {
  file: string;
  line: number;
  name: string;
  message: string;
}

const RESTRICTED_PATTERNS: RestrictedPattern[] = [
  { pattern: /\bprocess\.env\b/, name: 'process.env', message: 'Use BSB config system instead', skipForPluginType: 'config' },
  { pattern: /\bprocess\.exit\b/, name: 'process.exit', message: 'Throw an error instead — BSB manages the process lifecycle' },
  { pattern: /\bprocess\.cwd\b/, name: 'process.cwd', message: 'Use the cwd provided by BSB constructor args' },
  { pattern: /\bprocess\.argv\b/, name: 'process.argv', message: 'CLI arguments are managed by BSB' },
  { pattern: /\b__dirname\b/, name: '__dirname', message: 'Use BSB-provided paths from constructor args' },
  { pattern: /\b__filename\b/, name: '__filename', message: 'Use BSB-provided paths from constructor args' },
  { pattern: /\bconsole\.\w+/, name: 'console', message: 'Use this.log (BSB observable) instead', skipForPluginType: 'observable' },
  { pattern: /['"](?:node:)?child_process['"]/, name: 'child_process', message: 'Spawning child processes is not allowed in BSB plugins' },
  { pattern: /['"](?:node:)?cluster['"]/, name: 'cluster', message: 'Cluster management is handled by BSB' },
  { pattern: /\beval\s*\(/, name: 'eval()', message: 'eval() is not allowed in BSB plugins' },
  { pattern: /\bnew\s+Function\s*\(/, name: 'new Function()', message: 'Dynamic function construction is not allowed in BSB plugins' },
  { pattern: /\bglobal\.\w/, name: 'global', message: 'Global state mutation is not allowed in BSB plugins' },
  { pattern: /\bglobalThis\.\w/, name: 'globalThis', message: 'Global state mutation is not allowed in BSB plugins' },
  { pattern: /\brequire\s*\(/, name: 'require()', message: 'Use ESM imports instead', allowKey: 'require' },
  { pattern: /['"](?:node:)?worker_threads['"]/, name: 'worker_threads', message: 'Worker threads are managed by BSB', allowKey: 'worker_threads' },
];

function validateRestrictedAPIs(plugins: PluginInfo[]): void {
  const packageJson = readPackageJson();
  const allowList: string[] = Array.isArray(packageJson.bsb?.allow) ? packageJson.bsb.allow : [];
  const allowedKeys = new Set(allowList.filter((k: string) => k === 'require' || k === 'worker_threads'));

  const activePatterns = RESTRICTED_PATTERNS.filter(
    (p) => !p.allowKey || !allowedKeys.has(p.allowKey),
  );

  if (activePatterns.length === 0) {
    return;
  }

  const violations: SourceViolation[] = [];

  for (const plugin of plugins) {
    const pluginType: 'observable' | 'config' | 'other' =
      plugin.name.startsWith('observable-') ? 'observable' :
      plugin.name.startsWith('config-') ? 'config' : 'other';

    const pluginPatterns = activePatterns.filter(
      (p) => !p.skipForPluginType || p.skipForPluginType !== pluginType,
    );

    const tsFiles = collectFilesRecursive(plugin.srcDir, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      return ext === '.ts' || ext === '.tsx';
    });

    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      let inBlockComment = false;

      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        if (inBlockComment) {
          const endIdx = line.indexOf('*/');
          if (endIdx === -1) continue;
          line = line.slice(endIdx + 2);
          inBlockComment = false;
        }

        const blockStart = line.indexOf('/*');
        if (blockStart !== -1) {
          const blockEnd = line.indexOf('*/', blockStart + 2);
          if (blockEnd !== -1) {
            line = line.slice(0, blockStart) + line.slice(blockEnd + 2);
          } else {
            line = line.slice(0, blockStart);
            inBlockComment = true;
          }
        }

        const trimmed = line.trim();
        if (trimmed.startsWith('//')) continue;
        if (trimmed.startsWith('import type ')) continue;

        const relPath = normalizePath(path.relative(CWD, filePath));
        for (const restricted of pluginPatterns) {
          if (restricted.pattern.test(line)) {
            violations.push({
              file: relPath,
              line: i + 1,
              name: restricted.name,
              message: restricted.message,
            });
          }
        }
      }
    }
  }

  if (violations.length > 0) {
    log('\n=== Restricted API Usage Detected ===\n', 'red');
    for (const v of violations) {
      log(`  ${v.file}:${v.line} — ${v.name}`, 'red');
      log(`    ${v.message}`, 'yellow');
    }
    log(`\n${violations.length} violation(s) found. BSB plugins cannot use these APIs.\n`, 'red');
    process.exit(1);
  }

  success('Source validation passed (no restricted API usage)');
}

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

// Build hook logger adapters
const buildHookLogger: HookLogger = { info, success, error, warn: (msg: string) => log(msg, 'yellow') };
const devHookLogger = { info, success, warn: (msg: string) => log(msg, 'red') };

// Run build hooks (fatal on failure -- build aborts)
function runHook(hookName: HookName): void {
  runHookImpl(hookName, CWD, buildHookLogger);
}

// Run build hooks in dev mode (non-fatal -- keeps service running on failure)
function runHookDev(hookName: HookName): boolean {
  return runHookDevImpl(hookName, CWD, devHookLogger);
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
// Spawns with --import tsx so transitive .js→.ts imports resolve correctly
// in multi-file plugins (e.g. index.ts → repository.ts → mappers.js).
async function extractSchemasFromSource(): Promise<void> {
  try {
    const bsbBase = resolveBsbBasePath();
    const extractorPath = bsbBase ? path.join(bsbBase, 'lib', 'scripts', 'extract-schemas-from-source.js') : '';

    let scriptPath = '';
    if (extractorPath && fs.existsSync(extractorPath)) {
      scriptPath = extractorPath;
    } else {
      const localCompiledPath = path.join(MODULE_DIR, 'extract-schemas-from-source.js');
      const localTsPath = path.join(MODULE_DIR, 'extract-schemas-from-source.ts');
      if (fs.existsSync(localCompiledPath)) {
        scriptPath = localCompiledPath;
      } else if (fs.existsSync(localTsPath)) {
        scriptPath = localTsPath;
      }
    }

    if (!scriptPath) {
      throw new Error('Schema extractor script not found');
    }

    info('Extracting schemas from TypeScript source');
    execFileSync(
      process.execPath,
      ['--import', 'tsx', scriptPath],
      { cwd: CWD, stdio: 'inherit' },
    );
    success('Extracted schemas from TypeScript source');
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
async function generatePluginJson(plugin: PluginInfo): Promise<void> {
  try {
    // Try to load the compiled plugin
    const pluginPath = path.join(plugin.destDir, 'index.js');
    if (!fs.existsSync(pluginPath)) {
      return; // No index.js, skip
    }

    // Clear require cache to get fresh module
    const pluginModule = await import(`${toImportUrl(pluginPath)}?t=${Date.now()}`);

    // Check if plugin has Config with metadata
    if (!pluginModule.Config || !pluginModule.Config.metadata) {
      return; // No Config metadata, skip
    }

    info(`Generating plugin metadata for ${plugin.name}`);

    const metadata = pluginModule.Config.metadata;
    const packageJson = readPackageJson();

    // Auto-detect category from plugin directory name
    const category = plugin.name.startsWith('service-') ? 'service' :
                     plugin.name.startsWith('observable-') ? 'observable' :
                     plugin.name.startsWith('events-') ? 'events' :
                     plugin.name.startsWith('config-') ? 'config' : 'other';

    // Create plugin metadata object - only include fields with actual values
    const pluginMetadata: Record<string, any> = {
      id: plugin.name,
      name: metadata.name,
      version: packageJson.version || '1.0.0',
      description: metadata.description || '',
      category,
      tags: metadata.tags || [],
      documentation: metadata.documentation || [],
      dependencies: [] as Array<{ id: string; version: string }>,
    };

    // Only include optional fields if they have real values
    if (packageJson.author) pluginMetadata.author = packageJson.author;
    if (packageJson.license) pluginMetadata.license = packageJson.license;
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
    const bsbBase = resolveBsbBasePath();
    const generatorPath = bsbBase ? path.join(bsbBase, 'lib', 'scripts', 'generate-client-types.js') : '';

    if (generatorPath && fs.existsSync(generatorPath)) {
      execSync(`node "${generatorPath}"`, { cwd: CWD, stdio: 'pipe' });
      success('Generated virtual client types');
    } else {
      // Fallback: use local compiled version or ts-node
      const localCompiledPath = path.join(MODULE_DIR, 'generate-client-types.js');
      const localTsPath = path.join(MODULE_DIR, 'generate-client-types.ts');

      if (fs.existsSync(localCompiledPath)) {
        execSync(`node "${localCompiledPath}"`, { cwd: CWD, stdio: 'pipe' });
        success('Generated virtual client types');
      } else if (fs.existsSync(localTsPath)) {
        execSync(`node --import tsx "${localTsPath}"`, { cwd: CWD, stdio: 'pipe' });
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
    const bsbBasePath = resolveBsbBasePath();
    if (!bsbBasePath) {
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
        description: meta.description || '',
        tags: meta.tags || [],
        documentation: meta.documentation || [],
        pluginPath: `src/plugins/${id}/`,
      };
      if (meta.image) {
        snippet.image = meta.image;
      }

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

// Generate root bsb-tests.json with default ignore entries
function generateRootTestsJson(plugins: Record<string, any>[]): void {
  const testsPath = path.join(CWD, 'bsb-tests.json');
  let existing: any = { nodejs: [] };
  if (fs.existsSync(testsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(testsPath, 'utf-8'));
    } catch {
      existing = { nodejs: [] };
    }
  }

  const existingEntries: Record<string, any> = {};
  if (Array.isArray(existing.nodejs)) {
    for (const entry of existing.nodejs) {
      if (entry && entry.id) {
        existingEntries[entry.id] = entry;
      }
    }
  }

  for (const plugin of plugins) {
    if (!existingEntries[plugin.id]) {
      existingEntries[plugin.id] = {
        id: plugin.id,
        skip: true,
        default: {
          config: {},
          setup: null,
          dispose: null,
        },
        tests: [],
      };
    }
  }

  const updated = {
    nodejs: Object.values(existingEntries),
  };

  fs.writeFileSync(testsPath, JSON.stringify(updated, null, 2), 'utf-8');
  success(`Generated bsb-tests.json with ${plugins.length} plugin(s)`);
}

function shouldRunSchemaPipeline(changedPaths: string[] | undefined): boolean {
  if (!changedPaths || changedPaths.length === 0) {
    return true;
  }
  return changedPaths.some(isSchemaRelevantPath);
}

function getBsbCliPath(): string {
  const bsbBase = resolveBsbBasePath();
  if (!bsbBase) {
    error('BSB CLI not found. Make sure @bsb/base is installed.');
  }

  const bsbCliPath = path.join(bsbBase!, 'lib', 'cli.js');
  if (!fs.existsSync(bsbCliPath)) {
    error(`BSB CLI entry not found at ${bsbCliPath}. @bsb/base may need rebuilding.`);
  }

  return bsbCliPath;
}

function getBsbDevPath(): string {
  const bsbBase = resolveBsbBasePath();
  if (!bsbBase) {
    error('BSB dev entry not found. Make sure @bsb/base is installed.');
  }

  const sourceDevPath = path.join(bsbBase!, 'src', 'dev.ts');
  if (fs.existsSync(sourceDevPath)) {
    return sourceDevPath;
  }

  const compiledDevPath = path.join(bsbBase!, 'lib', 'dev.js');
  if (fs.existsSync(compiledDevPath)) {
    return compiledDevPath;
  }

  error(`BSB dev entry not found in ${bsbBase}`);
}

function getTsxImportSpecifier(): string {
  try {
    const projectRequire = createRequire(path.join(CWD, 'package.json'));
    return toImportUrl(projectRequire.resolve('tsx'));
  } catch {
    error(
      [
        'BSB dev mode requires the "tsx" package in the current project or workspace.',
        'Install it as a devDependency and try again.',
        'Examples:',
        '  npm install -D tsx',
        '  npm install -D tsx --workspace <workspace-name>',
      ].join('\n'),
    );
  }
}

function typecheckDev(): boolean {
  try {
    info('Type checking TypeScript');
    execSync(
      `npx tsc --noEmit --incremental --tsBuildInfoFile "${normalizePath(TSC_BUILD_INFO_PATH)}"`,
      { cwd: CWD, stdio: 'inherit' },
    );
    success('Type checking TypeScript');
    return true;
  } catch {
    return false;
  }
}

async function prepareGeneratedArtifacts(options: BuildOptions = {}): Promise<SchemaPreparationState> {
  ensureDir(CACHE_DIR);
  const plugins = detectPluginStructure();
  const cache = readBuildCache();
  const changedPaths = options.changedPaths ?? [];
  let coreSchemasHash = getCoreSchemasHash();
  let schemaInputsHash = getSchemaInputsHash(plugins, coreSchemasHash);
  const runSchemaPipeline = shouldRunSchemaPipeline(options.changedPaths);
  const metadataInputsHash = getMetadataInputsHash(plugins);
  const coreSchemasChanged = cache.coreSchemasHash !== coreSchemasHash;
  const shouldSyncCoreSchemas = coreSchemasChanged || !hasGeneratedClients() || !hasGeneratedSchemas();

  if (shouldSyncCoreSchemas) {
    syncParentSchemas();
    coreSchemasHash = getCoreSchemasHash();
    schemaInputsHash = getSchemaInputsHash(plugins, coreSchemasHash);
  } else {
    info('Skipping core schema sync (unchanged)');
  }

  const shouldExtractSchemas = runSchemaPipeline && (
    shouldSyncCoreSchemas ||
    cache.schemaInputsHash !== schemaInputsHash ||
    !hasGeneratedSchemas()
  );

  if (shouldExtractSchemas) {
    await extractSchemasFromSource();
  } else {
    info('Skipping schema extraction (unchanged)');
  }

  const generatedSchemasHash = getGeneratedSchemasHash();
  const shouldGenerateClients = runSchemaPipeline && (
    shouldExtractSchemas ||
    cache.clientInputsHash !== generatedSchemasHash ||
    !hasGeneratedClients()
  );

  if (shouldGenerateClients) {
    generateVirtualClients();
  } else {
    info('Skipping virtual client generation (unchanged)');
  }

  writeBuildCache({
    version: 1,
    coreSchemasHash,
    schemaInputsHash,
    clientInputsHash: getGeneratedSchemasHash(),
    metadataInputsHash: changedPaths.length > 0 ? cache.metadataInputsHash : metadataInputsHash,
  });

  return {
    plugins,
    coreSchemasHash,
    schemaInputsHash,
    generatedSchemasHash: getGeneratedSchemasHash(),
  };
}

// Build the plugin
async function build(options: BuildOptions = {}): Promise<void> {
  log('\n=== Building BSB Plugin ===\n', 'bright');
  const cache = readBuildCache();
  const changedPaths = options.changedPaths ?? [];

  // Hook: beforeSchemas
  runHook('beforeSchemas');

  const { plugins, coreSchemasHash, schemaInputsHash } = await prepareGeneratedArtifacts(options);

  // Hook: afterSchemas
  runHook('afterSchemas');

  const runSchemaPipeline = shouldRunSchemaPipeline(options.changedPaths);
  const metadataInputsHash = getMetadataInputsHash(plugins);
  const packageChanged = changedPaths.some((filePath) => normalizeChangedPath(filePath) === 'package.json');
  const assetChanged = changedPaths.some(isAssetPath);

  // Step 4: Clean
  if (options.clean !== false) {
    clean();
  } else {
    info('Skipping clean for incremental rebuild');
  }

  // Step 5: Validate restricted API usage in plugin source
  validateRestrictedAPIs(plugins);

  // Hook: beforeCompile
  runHook('beforeCompile');

  // Step 6: Compile TypeScript (virtual clients in src/.bsb/clients/ compile with the project)
  if (options.incremental) {
    exec(
      `npx tsc --incremental --tsBuildInfoFile "${normalizePath(TSC_BUILD_INFO_PATH)}"`,
      'Compiling TypeScript incrementally',
    );
  } else {
    exec('npx tsc', 'Compiling TypeScript');
  }

  // Hook: afterCompile
  runHook('afterCompile');

  // Step 7: Copy non-TypeScript assets for each plugin
  const shouldCopyAllAssets = !options.changedPaths || changedPaths.length === 0 || assetChanged || !fs.existsSync(path.join(CWD, 'lib'));
  if (shouldCopyAllAssets) {
    for (const plugin of plugins) {
      copyPluginAssets(plugin);
    }
  } else {
    info('Skipping asset copy (unchanged)');
  }

  // Step 8: Copy extracted schemas to lib/schemas/
  const shouldCopySchemas = runSchemaPipeline || !hasLibSchemas();
  if (shouldCopySchemas) {
    copySchemasToLib();
  } else {
    info('Skipping schema copy (unchanged)');
  }

  // Step 9: Generate per-plugin metadata JSON (needs compiled JS for Config.metadata)
  const shouldGenerateMetadata = runSchemaPipeline ||
    packageChanged ||
    cache.metadataInputsHash !== metadataInputsHash ||
    !hasPluginMetadataOutputs(plugins);
  if (shouldGenerateMetadata) {
    for (const plugin of plugins) {
      await generatePluginJson(plugin);
    }
  } else {
    info('Skipping plugin metadata generation (unchanged)');
  }

  // Step 10: Generate root bsb-plugin.json (aggregates all per-plugin metadata)
  if (shouldGenerateMetadata || !fs.existsSync(path.join(CWD, 'bsb-plugin.json'))) {
    generateRootPluginJson();
  } else {
    info('Skipping bsb-plugin.json generation (unchanged)');
  }

  // Step 11: Generate root bsb-tests.json (default ignore entries)
  if (shouldGenerateMetadata || !fs.existsSync(path.join(CWD, 'bsb-tests.json'))) {
    generateRootTestsJson(plugins.map(p => ({ id: p.name })));
  } else {
    info('Skipping bsb-tests.json generation (unchanged)');
  }

  writeBuildCache({
    version: 1,
    coreSchemasHash,
    schemaInputsHash,
    clientInputsHash: getGeneratedSchemasHash(),
    metadataInputsHash: getMetadataInputsHash(plugins),
  });

  // Hook: afterBuild
  runHook('afterBuild');

  log('\n' + colors.green + colors.bright + '[BUILD COMPLETE]' + colors.reset + '\n');
}

// Start the BSB service
function start(): void {
  log('\n=== Starting BSB Service ===\n', 'bright');

  const bsbCliPath = getBsbCliPath();

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

function startServiceProcess(): ChildProcess {
  const bsbDevPath = getBsbDevPath();
  const tsxImportSpecifier = getTsxImportSpecifier();
  info('Starting service');
  return spawn('node', ['--import', tsxImportSpecifier, bsbDevPath], {
    cwd: CWD,
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_DIR: CWD,
      BSB_DEV_EXTERNAL_WATCH: '1',
      BSB_DEV_LOADER: 'tsx',
    },
  });
}

async function stopServiceProcess(child: ChildProcess | null): Promise<void> {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGINT');
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
    }, 2000);
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 4000);
  });
}

// Development mode with incremental rebuilds and restarts
async function dev(): Promise<void> {
  log('\n=== Development Mode ===\n', 'bright');

  let child: ChildProcess | null = null;
  let watcher: FSWatcher | null = null;
  let isRebuilding = false;
  let restartPending = false;
  const pendingChanges = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const rebuildAndRestart = async () => {
    if (isRebuilding) {
      restartPending = true;
      info('Rebuild already in progress, queueing another pass');
      return;
    }

    isRebuilding = true;
    const changedPaths = Array.from(pendingChanges);
    pendingChanges.clear();

    try {
      if (changedPaths.length > 0) {
        info(`Detected changes: ${changedPaths.join(', ')}`);
      }

      const configOnly = changedPaths.length > 0 &&
        changedPaths.every((filePath) => isConfigPath(filePath));
      const assetOnly = changedPaths.length > 0 &&
        changedPaths.every((filePath) => isAssetPath(filePath) || isConfigPath(filePath));
      const staticAssetOnly = changedPaths.length > 0 &&
        changedPaths.every((filePath) => isStaticAssetPath(filePath) || isConfigPath(filePath));
      const sourceCodeChanged = changedPaths.some(isTsSourcePath);
      const copiedAnyAsset = assetOnly
        ? changedPaths.map(copySingleAssetFile).some(Boolean)
        : false;

      if (configOnly) {
        info('Skipping rebuild (config-only change)');
      } else if (!assetOnly || !copiedAnyAsset) {
        runHookDev('beforeSchemas');
        info('Preparing generated artifacts for dev');
        await prepareGeneratedArtifacts({ changedPaths });
        runHookDev('afterSchemas');
        if (sourceCodeChanged) {
          runHookDev('beforeCompile');
          const typecheckOk = typecheckDev();
          if (!typecheckOk) {
            info('Type check failed, keeping current service instance');
            return;
          }
          runHookDev('afterCompile');
        }
      } else {
        info('Skipping TypeScript rebuild (asset/config-only change)');
      }

      if (staticAssetOnly && copiedAnyAsset && !configOnly) {
        info('Skipping restart (static asset-only change)');
        return;
      }

      info('Restarting service');
      await stopServiceProcess(child);
      child = startServiceProcess();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`Dev rebuild failed: ${message}`, 'red');
    } finally {
      isRebuilding = false;
      if (restartPending) {
        restartPending = false;
        void rebuildAndRestart();
      }
    }
  };

  const queueChange = (filePath: string) => {
    const normalizedPath = normalizeChangedPath(filePath);
    info(`Change detected: ${normalizedPath}`);
    pendingChanges.add(normalizedPath);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      void rebuildAndRestart();
    }, 200);
  };

  try {
    info(`Watching paths: ${DEV_WATCH_PATHS.map(normalizePath).join(', ')}`);
    info(`Ignoring paths: ${DEV_IGNORE_PATTERNS.map(normalizePath).join(', ')}`);
    watcher = chokidar.watch(DEV_WATCH_PATHS, {
      ignored: (watchPath) => isDevIgnoredPath(CWD, String(watchPath), DEV_IGNORE_PATTERNS),
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on('add', queueChange);
    watcher.on('change', queueChange);
    watcher.on('unlink', queueChange);

    await new Promise<void>((resolve) => {
      watcher!.once('ready', () => {
        info('Watching for changes');
        resolve();
      });
    });

    runHookDev('beforeSchemas');
    info('Preparing generated artifacts for dev');
    await prepareGeneratedArtifacts();
    runHookDev('afterSchemas');
    runHookDev('beforeCompile');
    if (typecheckDev()) {
      runHookDev('afterCompile');
      runHookDev('beforeDev');
      child = startServiceProcess();
    } else {
      info('Initial type check failed, waiting for changes');
    }

    process.on('SIGINT', async () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (watcher) {
        await watcher.close();
      }
      await stopServiceProcess(child);
      process.exit(0);
    });

    await new Promise<void>(() => {});
  } finally {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    if (watcher) {
      await watcher.close();
    }
    await stopServiceProcess(child);
  }
}

// Run tests
function test(): void {
  log('\n=== Running Tests ===\n', 'bright');

  const args = process.argv.slice(3);
  const cmd = ['npx', '@bsb/tests', '--cwd', CWD, ...args].join(' ');
  exec(cmd, 'Running tests via @bsb/tests');

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
  ${colors.green}test${colors.reset}    - Run tests via @bsb/tests (npx)
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

${colors.cyan}Build Hooks:${colors.reset}
  Configure in package.json under "bsb.hooks" to run npm scripts
  at specific points in the build/dev pipeline.

  ${colors.green}beforeSchemas${colors.reset}  - Before schema extraction (build + dev)
  ${colors.green}afterSchemas${colors.reset}   - After schema generation, before tsc (build + dev)
  ${colors.green}beforeCompile${colors.reset}  - Before TypeScript compilation (build + dev)
  ${colors.green}afterCompile${colors.reset}   - After TypeScript compilation succeeds (build + dev)
  ${colors.green}afterBuild${colors.reset}     - After full build completes (build only)
  ${colors.green}beforeDev${colors.reset}      - Once before first dev server start (dev only)

  Values are npm script names (string or string[]).

  Example:
    "bsb": {
      "hooks": {
        "afterSchemas": "generate-api-types",
        "afterCompile": ["post-bundle", "lint-output"]
      },
      "dev": {
        "ignore": ["src/generated/**"]
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
