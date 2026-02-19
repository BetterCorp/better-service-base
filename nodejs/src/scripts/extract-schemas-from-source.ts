/**
 * BSB Schema Extraction from TypeScript Source
 *
 * Extracts event schemas directly from plugin TypeScript source files
 * without requiring compilation. This breaks the circular dependency:
 *   build needs schemas → schemas need compiled JS → JS needs build
 *
 * Approach:
 *   1. Read plugin index.ts, truncate at `export class Plugin`
 *   2. Rewrite imports to avoid pulling in runtime deps (BSBService, etc.)
 *   3. Keep local relative imports (./types, ./utils) — they may define schemas
 *   4. Append footer that calls exportEventSchemas() and outputs JSON
 *   5. Execute temp file with ts-node, capture JSON output
 *   6. Write schema JSON to src/.bsb/schemas/
 *
 * The temp file is placed in the plugin's own directory so that relative
 * imports (./types, ./storage, etc.) resolve correctly.
 */

import * as fs from 'fs';
import * as path from 'path';

const CWD = process.cwd();

// Schema-relevant identifiers from BSB
const SCHEMA_IDENTIFIERS: Set<string> = new Set([
  'createConfigSchema',
  'createEventSchemas',
  'createReturnableEvent',
  'createFireAndForgetEvent',
  'createBroadcastEvent',
  'bsb',
  'optional',
  'nullable',
  'InferBSBType',
]);

interface PluginSource {
  srcPath: string;
  dirName: string;
}

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

function resolveTsNodeRegister(): string | null {
  const searchRoots = [
    CWD,
    __dirname,
    path.join(CWD, 'node_modules', '@bsb', 'base'),
    path.join(__dirname, '..', '..'),
  ];

  for (const root of searchRoots) {
    try {
      return require.resolve('ts-node/register/transpile-only', { paths: [root] });
    } catch {
      // Try next location
    }
  }

  for (const root of searchRoots) {
    try {
      return require.resolve('ts-node/register', { paths: [root] });
    } catch {
      // Try next location
    }
  }

  return null;
}

/**
 * Detect whether this is a self-build (@bsb/base project) or an external plugin.
 */
function detectProjectType(): 'self' | 'external' {
  const packageJsonPath = path.join(CWD, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name === '@bsb/base') {
        return 'self';
      }
    } catch {
      // ignore
    }
  }
  return 'external';
}

/**
 * Discover plugin source files from src/plugins/<plugin>/index.ts.
 */
function discoverPlugins(): PluginSource[] {
  const pluginsDir = path.join(CWD, 'src', 'plugins');
  const results: PluginSource[] = [];

  if (!fs.existsSync(pluginsDir)) {
    return results;
  }

  const dirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const indexPath = path.join(pluginsDir, dir, 'index.ts');
    if (!fs.existsSync(indexPath)) continue;

    results.push({ srcPath: indexPath, dirName: dir });
  }

  return results;
}

function inferPluginType(pluginDirName: string, sourceContent: string): PluginType {
  if (pluginDirName.startsWith('service-')) return 'service';
  if (pluginDirName.startsWith('observable-')) return 'observable';
  if (pluginDirName.startsWith('events-')) return 'events';
  if (pluginDirName.startsWith('config-')) return 'config';

  if (/extends\s+BSBService\b/.test(sourceContent)) return 'service';
  if (/extends\s+BSBObservable\b/.test(sourceContent)) return 'observable';
  if (/extends\s+BSBEvents\b/.test(sourceContent)) return 'events';
  if (/extends\s+BSBConfig\b/.test(sourceContent)) return 'config';
  return 'unknown';
}

function extractPluginClassBody(sourceContent: string): string {
  const classMatch = sourceContent.match(/export\s+(?:default\s+)?class\s+Plugin\b/);
  if (!classMatch || classMatch.index === undefined) return '';

  const classStart = classMatch.index;
  const openBrace = sourceContent.indexOf('{', classStart);
  if (openBrace < 0) return '';

  let depth = 0;
  for (let i = openBrace; i < sourceContent.length; i++) {
    const ch = sourceContent[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return sourceContent.slice(openBrace + 1, i);
      }
    }
  }

  return '';
}

function classHasMethod(classBody: string, methodName: string): boolean {
  const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const methodRegex = new RegExp(`\\b(?:public\\s+|protected\\s+|private\\s+|static\\s+|override\\s+|async\\s+)*(?:readonly\\s+)?${escaped}\\s*\\(`);
  return methodRegex.test(classBody);
}

function buildCapabilities(pluginType: PluginType, classBody: string): Record<string, unknown> | undefined {
  if (pluginType === 'observable') {
    const logging = Object.fromEntries(OBSERVABLE_METHODS.logging.map((name) => [name, classHasMethod(classBody, name)]));
    const metrics = Object.fromEntries(OBSERVABLE_METHODS.metrics.map((name) => [name, classHasMethod(classBody, name)]));
    const tracing = Object.fromEntries(OBSERVABLE_METHODS.tracing.map((name) => [name, classHasMethod(classBody, name)]));
    return { logging, metrics, tracing };
  }

  if (pluginType === 'events') {
    return {
      eventsApi: Object.fromEntries(EVENTS_METHODS.map((name) => [name, classHasMethod(classBody, name)])),
    };
  }

  if (pluginType === 'config') {
    return {
      configApi: Object.fromEntries(CONFIG_METHODS.map((name) => [name, classHasMethod(classBody, name)])),
    };
  }

  return undefined;
}

/**
 * Parse an import statement to extract identifiers and source path.
 * Handles named, default, namespace (import *), type-only, and side-effect imports.
 */
function parseImportLine(line: string): {
  identifiers: string[];
  source: string;
  isTypeOnly: boolean;
  isNamespace: boolean;
  raw: string;
} | null {
  const trimmed = line.trim();

  // Type-only: import type { A } from "path"
  const typeMatch = trimmed.match(/^import\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
  if (typeMatch) {
    const identifiers = typeMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    return { identifiers, source: typeMatch[2], isTypeOnly: true, isNamespace: false, raw: trimmed };
  }

  // Namespace: import * as X from "path"
  const nsMatch = trimmed.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
  if (nsMatch) {
    return { identifiers: [nsMatch[1]], source: nsMatch[2], isTypeOnly: false, isNamespace: true, raw: trimmed };
  }

  // Named: import { A, B } from "path"
  const namedMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
  if (namedMatch) {
    const identifiers = namedMatch[1].split(',').map(s => {
      const parts = s.trim().split(/\s+as\s+/);
      return parts[parts.length - 1].trim();
    }).filter(Boolean);
    return { identifiers, source: namedMatch[2], isTypeOnly: false, isNamespace: false, raw: trimmed };
  }

  // Default: import X from "path"
  const defaultMatch = trimmed.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
  if (defaultMatch) {
    return { identifiers: [defaultMatch[1]], source: defaultMatch[2], isTypeOnly: false, isNamespace: false, raw: trimmed };
  }

  // Side-effect: import "path"
  const sideEffectMatch = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
  if (sideEffectMatch) {
    return { identifiers: [], source: sideEffectMatch[1], isTypeOnly: false, isNamespace: false, raw: trimmed };
  }

  return null;
}

/**
 * Rewrite a BSB import (from ../../base or @bsb/base) to targeted sub-module imports.
 * For self-build: rewrites to specific sub-modules (../../base/PluginConfig, ../../interfaces/schema-types).
 * For external: keeps @bsb/base but filters to only schema-relevant identifiers.
 */
function rewriteBsbImport(identifiers: string[], projectType: 'self' | 'external'): string[] {
  const schemaIds = identifiers.filter(id => SCHEMA_IDENTIFIERS.has(id));
  if (schemaIds.length === 0) return [];

  if (projectType === 'external') {
    // External plugins: keep importing from @bsb/base, just filter identifiers
    return [`import { ${schemaIds.join(', ')} } from '@bsb/base';`];
  }

  // Self-build: split into targeted sub-module imports
  const byModule: Record<string, string[]> = {};
  for (const id of schemaIds) {
    let target: string;
    if (id === 'createConfigSchema') {
      target = '../../base/PluginConfig';
    } else if (['createEventSchemas', 'createReturnableEvent', 'createFireAndForgetEvent', 'createBroadcastEvent'].includes(id)) {
      target = '../../interfaces/schema-events';
    } else {
      target = '../../interfaces/schema-types';
    }
    if (!byModule[target]) byModule[target] = [];
    byModule[target].push(id);
  }

  const lines: string[] = [];
  for (const [mod, ids] of Object.entries(byModule)) {
    lines.push(`import { ${ids.join(', ')} } from "${mod}";`);
  }
  return lines;
}

/**
 * Normalize multiline imports into single lines.
 * Joins imports that span multiple lines (e.g., import {\n  A,\n  B,\n} from 'x')
 * into a single line so that parseImportLine() can handle them.
 */
function normalizeMultilineImports(lines: string[]): string[] {
  const result: string[] = [];
  let buffer: string[] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (buffer !== null) {
      // We're inside a multiline import — keep buffering
      buffer.push(trimmed);
      // Check if this line closes the import (has } and from)
      if (trimmed.includes('}') && /from\s+['"]/.test(trimmed)) {
        // Join all buffered lines into one and emit
        result.push(buffer.join(' '));
        buffer = null;
      }
      continue;
    }

    // Detect start of a multiline import: starts with 'import' has '{' but no '}'
    if (/^\s*import\s/.test(line) && trimmed.includes('{') && !trimmed.includes('}')) {
      buffer = [trimmed];
      continue;
    }

    // Regular line — pass through
    result.push(line);
  }

  // If we ended while still buffering (malformed import), flush as-is
  if (buffer !== null) {
    for (const l of buffer) {
      result.push(l);
    }
  }

  return result;
}

/**
 * Check if an import source is a local relative import (./types, ./storage, etc.)
 */
function isLocalRelativeImport(source: string): boolean {
  return source.startsWith('./') || source.startsWith('../');
}

/**
 * Check if an import source is a BSB base import.
 */
function isBsbBaseImport(source: string): boolean {
  return (
    source === '@bsb/base' ||
    source === '../../base' ||
    source === '../../base/index' ||
    source.startsWith('@bsb/base/')
  );
}

/**
 * Check if a relative import is schema-related (schema-events, schema-types).
 */
function isSchemaModuleImport(source: string): boolean {
  return source.includes('schema-events') || source.includes('schema-types');
}

/**
 * Extract schema-relevant source code from a plugin's index.ts.
 * Truncates at the class declaration and rewrites imports.
 */
function extractSchemaSource(sourceContent: string, pluginDirName: string, projectType: 'self' | 'external'): string {
  // Normalize multiline imports into single lines before processing
  const lines = normalizeMultilineImports(sourceContent.split('\n'));

  // Find the Plugin class declaration line (not helper classes like Config)
  const classLineIndex = lines.findIndex(line =>
    /^\s*export\s+(default\s+)?class\s+Plugin\b/.test(line)
  );

  // Take everything before the class
  const relevantLines = classLineIndex >= 0
    ? lines.slice(0, classLineIndex)
    : lines;

  // Two-pass approach:
  // Pass 1: separate imports from body lines
  // Pass 2: filter local ./ imports by checking if their identifiers are used in the body

  const resolvedImports: string[] = [];
  const pendingLocalImports: Array<{ line: string; identifiers: string[] }> = [];
  const bodyLines: string[] = [];

  for (const line of relevantLines) {
    const trimmed = line.trim();

    // Skip require() calls for non-schema modules
    if (/\brequire\s*\(/.test(trimmed)) {
      if (/schema|zod/.test(trimmed)) {
        bodyLines.push(line);
      }
      continue;
    }

    // Handle import lines
    if (trimmed.startsWith('import ')) {
      const parsed = parseImportLine(trimmed);
      if (!parsed) {
        continue;
      }

      // Type-only imports: drop them (not needed for runtime extraction)
      if (parsed.isTypeOnly) {
        continue;
      }

      // Keep zod imports as-is
      if (parsed.source === 'zod') {
        resolvedImports.push(line);
        continue;
      }

      // Keep schema module imports as-is
      if (isSchemaModuleImport(parsed.source)) {
        resolvedImports.push(line);
        continue;
      }

      // Rewrite BSB base imports (../../base or @bsb/base)
      if (isBsbBaseImport(parsed.source)) {
        const rewritten = rewriteBsbImport(parsed.identifiers, projectType);
        for (const l of rewritten) {
          resolvedImports.push(l);
        }
        continue;
      }

      // Local relative imports (./types, ./storage, etc.)
      // Defer decision — we'll check if identifiers are used in body text
      if (isLocalRelativeImport(parsed.source)) {
        // Skip imports from parent plugin dirs (../service-*) — cross-plugin deps
        if (parsed.source.startsWith('../')) {
          continue;
        }
        // Queue for usage check
        pendingLocalImports.push({ line, identifiers: parsed.identifiers });
        continue;
      }

      // Drop everything else (node:*, other packages, etc.)
      continue;
    }

    // Keep all non-import lines (const declarations, comments, etc.)
    bodyLines.push(line);
  }

  // Pass 2: filter local imports — only keep those whose identifiers are referenced in body
  const bodyText = bodyLines.join('\n');
  for (const pending of pendingLocalImports) {
    const isUsed = pending.identifiers.some(id => {
      // Use word boundary check to avoid false positives
      const regex = new RegExp(`\\b${id}\\b`);
      return regex.test(bodyText);
    });
    if (isUsed) {
      resolvedImports.push(pending.line);
    }
  }

  // Build final output: imports first, then body
  const outputLines = [...resolvedImports, ...bodyLines];

  // Append the extraction footer
  const exportEventSchemasImport = projectType === 'self'
    ? `import { exportEventSchemas } from "../../interfaces/schema-events";`
    : `import { exportEventSchemas } from '@bsb/base';`;

  outputLines.push('');
  outputLines.push('// --- Schema extraction footer (auto-generated) ---');
  outputLines.push(exportEventSchemasImport);
  outputLines.push('');
  outputLines.push(`let _Config: any;`);
  outputLines.push(`let _EventSchemas: any;`);
  outputLines.push(`try { _Config = eval('Config'); } catch { _Config = undefined; }`);
  outputLines.push(`try { _EventSchemas = eval('EventSchemas'); } catch { _EventSchemas = undefined; }`);
  outputLines.push(`if (!_Config && (module as any)?.exports?.Config) { _Config = (module as any).exports.Config; }`);
  outputLines.push(`if (!_EventSchemas && (module as any)?.exports?.EventSchemas) { _EventSchemas = (module as any).exports.EventSchemas; }`);
  outputLines.push('');
  outputLines.push(`const _pluginName = _Config && _Config.metadata`);
  outputLines.push(`  ? (_Config as any).metadata.name`);
  outputLines.push(`  : ${JSON.stringify(pluginDirName)};`);
  outputLines.push(`const _pluginVersion = _Config && _Config.metadata && _Config.metadata.version`);
  outputLines.push(`  ? (_Config as any).metadata.version`);
  outputLines.push(`  : "1.0.0";`);
  outputLines.push('');
  outputLines.push('const _schemaResult = (_EventSchemas)');
  outputLines.push('  ? exportEventSchemas(_pluginName, _pluginVersion, _EventSchemas as any)');
  outputLines.push('  : { pluginName: _pluginName, version: _pluginVersion, events: {} };');
  outputLines.push('');
  outputLines.push('// Extract config schema as JSON Schema if Config has a Zod validationSchema');
  outputLines.push('try {');
  outputLines.push('  if (_Config) {');
  outputLines.push('    const _configInstance = new (_Config as any)("", "", "", "");');
  outputLines.push('    if (_configInstance.validationSchema && typeof _configInstance.validationSchema === "object") {');
  outputLines.push('      const _zod = require("zod");');
  outputLines.push('      const _toJSONSchema = _zod.toJSONSchema || (_zod.z && _zod.z.toJSONSchema);');
  outputLines.push('      if (typeof _toJSONSchema === "function") {');
  outputLines.push('        (_schemaResult as any).configSchema = _toJSONSchema(_configInstance.validationSchema);');
  outputLines.push('      }');
  outputLines.push('    }');
  outputLines.push('  }');
  outputLines.push('} catch (_e) {');
  outputLines.push('  // Config schema extraction is optional - skip on error');
  outputLines.push('}');
  outputLines.push('');
  outputLines.push('(module as any).exports.__BSB_SCHEMA_RESULT = _schemaResult;');
  outputLines.push('');

  return outputLines.join('\n');
}

/**
 * Detect plugin dependencies by scanning for .bsb/clients/ imports.
 * Returns structured dependency objects with org-qualified ID and version
 * read from the dependency's schema JSON.
 */
function detectClientDependencies(sourceContent: string): Array<{ id: string; version: string }> {
  const lines = normalizeMultilineImports(sourceContent.split('\n'));
  const pluginIds = new Set<string>();

  for (const line of lines) {
    const parsed = parseImportLine(line.trim());
    if (!parsed) continue;

    // Match any relative import ending in .bsb/clients/{pluginId}
    const match = parsed.source.match(/\.bsb\/clients\/([^/]+)$/);
    if (match) {
      pluginIds.add(match[1]);
    }
  }

  if (pluginIds.size === 0) return [];

  // Read orgId from package.json (bsb.orgId field)
  const pkgJsonPath = path.join(CWD, 'package.json');
  let orgId = '_';
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      orgId = pkg.bsb?.orgId || '_';
    } catch {
      // use default
    }
  }

  // Resolve each plugin ID to a structured dependency
  const schemasDir = path.join(CWD, 'src', '.bsb', 'schemas');
  const deps: Array<{ id: string; version: string }> = [];

  for (const pluginId of pluginIds) {
    // Read the dependency's schema to get its version
    let version = '1.0.0';
    const schemaPath = path.join(schemasDir, `${pluginId}.json`);
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        version = schema.version || '1.0.0';
      } catch {
        // use fallback
      }
    }
    deps.push({ id: `${orgId}/${pluginId}`, version });
  }

  return deps;
}

/**
 * Main extraction function.
 */
async function main() {
  const projectType = detectProjectType();
  const plugins = discoverPlugins();
  const tsNodeRegisterPath = resolveTsNodeRegister();

  if (plugins.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No plugins found in src/plugins.');
    return;
  }

  if (!tsNodeRegisterPath) {
    // eslint-disable-next-line no-console
    console.log('Skipping schema extraction: ts-node/register is not available in this project.');
    return;
  }

  // Create output directory
  const schemasDir = path.join(CWD, 'src', '.bsb', 'schemas');
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }

  // Register ts-node once so temp TypeScript files can be required in-process.
  // This avoids spawning child processes (more reliable on restricted Windows environments).
  require(tsNodeRegisterPath);

  let extracted = 0;
  let errors = 0;

  // Track temp files for cleanup
  const tempFiles: string[] = [];

  for (const plugin of plugins) {
    try {
      const sourceContent = fs.readFileSync(plugin.srcPath, 'utf-8');

      const pluginType = inferPluginType(plugin.dirName, sourceContent);
      const classBody = extractPluginClassBody(sourceContent);
      const capabilities = buildCapabilities(pluginType, classBody);

      const tempSource = extractSchemaSource(sourceContent, plugin.dirName, projectType);

      // Place temp file in the plugin's directory so relative imports resolve
      const pluginDir = path.dirname(plugin.srcPath);
      const tempFile = path.join(pluginDir, `_bsb_extract_temp_.ts`);
      tempFiles.push(tempFile);

      fs.writeFileSync(tempFile, tempSource, 'utf-8');

      // Execute extraction in-process via ts-node/register
      delete require.cache[require.resolve(tempFile)];
      const loaded = require(tempFile) as { __BSB_SCHEMA_RESULT?: Record<string, unknown> };
      if (!loaded || !loaded.__BSB_SCHEMA_RESULT || typeof loaded.__BSB_SCHEMA_RESULT !== 'object') {
        throw new Error('Schema extraction did not return a result');
      }

      // Parse and write the schema JSON
      const schemaExport = loaded.__BSB_SCHEMA_RESULT as Record<string, unknown>;
      schemaExport.pluginType = pluginType;
      if (capabilities) {
        schemaExport.capabilities = capabilities;
      }

      // Auto-detect dependencies from .bsb/clients/ imports
      const deps = detectClientDependencies(sourceContent);
      if (deps.length > 0) {
        schemaExport.dependencies = deps;
      }

      const schemaFile = path.join(schemasDir, `${plugin.dirName}.json`);
      fs.writeFileSync(schemaFile, JSON.stringify(schemaExport, null, 2), 'utf-8');

      // eslint-disable-next-line no-console
      console.log(`  Extracted schema for ${plugin.dirName} (v${schemaExport.version})`);
      extracted++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`  Error extracting schema for ${plugin.dirName}: ${message}`);
    }
  }

  // Cleanup temp files (opt-out for debugging)
  if (process.env.BSB_KEEP_EXTRACT_TEMP !== '1') {
    for (const tempFile of tempFiles) {
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch {
        // Non-fatal
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nSchema extraction complete: ${extracted} extracted, ${errors} errors`);
  // eslint-disable-next-line no-console
  console.log(`Schemas written to: ${schemasDir}`);

  if (errors > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during schema extraction:', error);
    process.exit(1);
  });
}

export { main as extractSchemasFromSource };
