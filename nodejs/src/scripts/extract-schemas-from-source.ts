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
import { createRequire } from 'node:module';
import ts from 'typescript';
import { isMainModule, toImportUrl } from '../base/module-runtime.js';

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
  'PLUGIN_LANGUAGES',
  'normalizePluginLanguage',
]);
const TRUSTED_SCHEMA_PACKAGES = new Set(['anyvali', 'os', 'node:os', 'path', 'node:path']);

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

function extractStaticSchemaBinding(classBody: string, propertyName: 'Config' | 'EventSchemas'): string | undefined {
  const match = classBody.match(new RegExp(
    `\\b(?:public\\s+|protected\\s+|private\\s+|override\\s+|readonly\\s+)*static\\s+` +
    `(?:readonly\\s+)?${propertyName}\\s*(?::[^=;\\r\\n]+)?=\\s*([^;\\r\\n]+)`,
  ));
  if (!match) return undefined;

  const expression = match[1].trim();
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expression)) {
    throw new Error(
      `Plugin static ${propertyName} must reference an identifier or namespace member; received ${expression}`,
    );
  }
  return expression;
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
function resolveBsbBaseEntryImport(projectRoot: string): string {
  const require = createRequire(path.join(projectRoot, 'package.json'));
  const pkgJsonPath = require.resolve('@bsb/base/package.json');
  const packageRoot = path.dirname(pkgJsonPath);
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
    exports?: string | Record<string, unknown>;
    main?: string;
  };

  let entry = 'lib/index.js';
  if (pkg.exports && typeof pkg.exports === 'object') {
    const exportRoot = (pkg.exports as Record<string, unknown>)['.'];
    if (typeof exportRoot === 'string') {
      entry = exportRoot;
    } else if (exportRoot && typeof exportRoot === 'object') {
      const maybeDefault = (exportRoot as Record<string, unknown>).default;
      if (typeof maybeDefault === 'string') {
        entry = maybeDefault;
      }
    }
  } else if (typeof pkg.exports === 'string') {
    entry = pkg.exports;
  } else if (typeof pkg.main === 'string' && pkg.main.length > 0) {
    entry = pkg.main;
  }

  return toImportUrl(path.join(packageRoot, entry));
}

function readProjectPackageVersion(projectRoot: string): string {
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: string };
    if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
      return packageJson.version;
    }
  } catch {
    // Fall back when running outside a normal package root.
  }

  return '1.0.0';
}

function rewriteBsbImport(
  identifiers: string[],
  projectType: 'self' | 'external',
  bsbBaseImportPath: string,
): string[] {
  const schemaIds = identifiers.filter(id => SCHEMA_IDENTIFIERS.has(id));
  if (schemaIds.length === 0) return [];

  if (projectType === 'external') {
    // External plugins: resolve @bsb/base once, then use stable file:// import for temp modules.
    return [`import { ${schemaIds.join(', ')} } from '${bsbBaseImportPath}';`];
  }

  // Self-build: split into targeted sub-module imports
  const byModule: Record<string, string[]> = {};
  for (const id of schemaIds) {
    let target: string;
    if (id === 'createConfigSchema') {
      target = '../../base/PluginConfig.js';
    } else if (['createEventSchemas', 'createReturnableEvent', 'createFireAndForgetEvent', 'createBroadcastEvent'].includes(id)) {
      target = '../../interfaces/schema-events.js';
    } else if (['PLUGIN_LANGUAGES', 'normalizePluginLanguage'].includes(id)) {
      target = '../../interfaces/plugin-language.js';
    } else {
      target = '../../interfaces/schema-types.js';
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

function toImportPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function resolveLocalImportSource(baseDir: string, source: string): string {
  if (!isLocalRelativeImport(source)) {
    return source;
  }

  if (/\.(?:js|mjs|cjs)$/.test(source)) {
    const resolvedFile = path.resolve(baseDir, source);
    const extensionVariants = [
      resolvedFile.replace(/\.(?:js|mjs|cjs)$/i, '.ts'),
      resolvedFile.replace(/\.(?:js|mjs|cjs)$/i, '.tsx'),
    ];
    const sourceVariant = extensionVariants.find((candidate) => fs.existsSync(candidate));
    if (sourceVariant) {
      const relative = path.relative(baseDir, sourceVariant);
      const normalized = toImportPath(relative);
      return normalized.startsWith('.') ? normalized : `./${normalized}`;
    }
    return source;
  }

  if (/\.(?:ts|tsx|json|node)$/.test(source)) {
    return source;
  }

  const resolvedBase = path.resolve(baseDir, source);
  const candidates = [
    `${resolvedBase}.ts`,
    `${resolvedBase}.tsx`,
    `${resolvedBase}.js`,
    `${resolvedBase}.mjs`,
    path.join(resolvedBase, 'index.ts'),
    path.join(resolvedBase, 'index.tsx'),
    path.join(resolvedBase, 'index.js'),
    path.join(resolvedBase, 'index.mjs'),
  ];

  const matched = candidates.find((candidate) => fs.existsSync(candidate));
  if (!matched) {
    return source;
  }

  const relative = path.relative(baseDir, matched);
  const normalized = toImportPath(relative);
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
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

const SELF_SCHEMA_IMPORTS = new Set([
  '../../base/PluginConfig.js',
  '../../interfaces/plugin-language.js',
  '../../interfaces/schema-events.js',
  '../../interfaces/schema-types.js',
]);
const FORBIDDEN_SCHEMA_MEMBERS = new Set(['constructor', '__proto__', 'prototype']);
const REACHABLE_SCHEMA_METHODS = new Set([
  'export',
  'next',
  'return',
  'throw',
  'toJSON',
  'toString',
  'valueOf',
]);
const PURE_PATH_CALLS = new Set(['basename', 'dirname', 'extname', 'isAbsolute', 'join', 'normalize', 'parse', 'relative', 'resolve']);

function schemaImportCallable(source: string, imported: string, namespace: boolean, trustedImports: ReadonlySet<string>): boolean {
  if (isLocalRelativeImport(source) || trustedImports.has(source)) return true;
  if (source === 'anyvali') return true;
  if (source === 'os' || source === 'node:os') return !namespace && imported === 'hostname';
  if (source === 'path' || source === 'node:path') return !namespace && PURE_PATH_CALLS.has(imported);
  if (source === '@bsb/base') return !namespace && SCHEMA_IDENTIFIERS.has(imported);
  return false;
}

function assertNoSchemaDecorators(node: ts.Node, filePath: string): void {
  if (ts.canHaveDecorators(node) && (ts.getDecorators(node)?.length ?? 0) > 0) {
    throw new Error(`Schema extraction refused a decorator in ${filePath}`);
  }
}

function schemaCallRoot(expression: ts.Expression): string | null {
  let current: ts.Expression = expression;
  while (true) {
    if (ts.isIdentifier(current)) return current.text;
    if (ts.isPropertyAccessExpression(current)) {
      if (FORBIDDEN_SCHEMA_MEMBERS.has(current.name.text)) return null;
      current = current.expression;
      continue;
    }
    if (ts.isElementAccessExpression(current)) {
      const key = current.argumentExpression;
      if (!ts.isStringLiteralLike(key) || FORBIDDEN_SCHEMA_MEMBERS.has(key.text)) return null;
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)) {
      current = current.expression;
      continue;
    }
    return null;
  }
}

function schemaDirectCalleeKey(expression: ts.Expression): string | null {
  let current: ts.Expression = expression;
  while (ts.isParenthesizedExpression(current)
      || ts.isAsExpression(current)
      || ts.isTypeAssertionExpression(current)
      || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  if (ts.isIdentifier(current)) return current.text;
  if (ts.isPropertyAccessExpression(current) && ts.isIdentifier(current.expression)) {
    return `${current.expression.text}.${current.name.text}`;
  }
  if (ts.isElementAccessExpression(current) && ts.isIdentifier(current.expression)
    && ts.isStringLiteralLike(current.argumentExpression)) {
    return `${current.expression.text}.${current.argumentExpression.text}`;
  }
  return null;
}

function schemaBindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : schemaBindingNames(element.name));
}

function assertSafeSchemaInitializer(
  node: ts.Node,
  filePath: string,
  allowedCalls: ReadonlySet<string>,
  directOnlyCalls: ReadonlySet<string> = new Set(),
): void {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)
    || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    for (const parameter of node.parameters) {
      assertNoSchemaDecorators(parameter, filePath);
      if (schemaBindingNames(parameter.name).some((name) => allowedCalls.has(name))) {
        throw new Error(`Schema extraction refused a shadowed callable binding in ${filePath}`);
      }
      assertSafeSchemaInitializer(parameter.name, filePath, allowedCalls, directOnlyCalls);
      if (parameter.initializer) assertSafeSchemaInitializer(parameter.initializer, filePath, allowedCalls, directOnlyCalls);
    }
    if (!node.body) return;
    if (!ts.isBlock(node.body)) {
      assertSafeSchemaInitializer(node.body, filePath, allowedCalls, directOnlyCalls);
      return;
    }
    for (const statement of node.body.statements) {
      if (ts.isReturnStatement(statement)) {
        if (statement.expression) assertSafeSchemaInitializer(statement.expression, filePath, allowedCalls, directOnlyCalls);
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (schemaBindingNames(declaration.name).some((name) => allowedCalls.has(name))) {
            throw new Error(`Schema extraction refused a shadowed callable binding in ${filePath}`);
          }
          assertSafeSchemaInitializer(declaration.name, filePath, allowedCalls, directOnlyCalls);
          if (declaration.initializer) assertSafeSchemaInitializer(declaration.initializer, filePath, allowedCalls, directOnlyCalls);
        }
        continue;
      }
      throw new Error(`Schema extraction refused an executable helper statement in ${filePath}`);
    }
    return;
  }
  if (ts.isNewExpression(node) || ts.isAwaitExpression(node) || ts.isYieldExpression(node)
    || ts.isTaggedTemplateExpression(node) || ts.isDeleteExpression(node)) {
    throw new Error(`Schema extraction refused executable expression in ${filePath}`);
  }
  if (ts.isBinaryExpression(node)
    && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
    && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    throw new Error(`Schema extraction refused an assignment expression in ${filePath}`);
  }
  if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
    throw new Error(`Schema extraction refused an update expression in ${filePath}`);
  }
  if (ts.isCallExpression(node)) {
    const root = schemaCallRoot(node.expression);
    const calleeKey = schemaDirectCalleeKey(node.expression);
    if (!root || !allowedCalls.has(root)
      || (directOnlyCalls.has(root)
        && (calleeKey === null || (calleeKey !== root && !directOnlyCalls.has(calleeKey))))) {
      throw new Error(`Schema extraction refused call to ${root ?? 'an unknown function'} in ${filePath}`);
    }
  }
  ts.forEachChild(node, (child) => assertSafeSchemaInitializer(child, filePath, allowedCalls, directOnlyCalls));
}

function pruneUnreferencedSchemaFunctions(source: string): string {
  const sourceFile = ts.createSourceFile('_bsb_schema_prune_.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const removals: Array<{ start: number; end: number }> = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    let referenced = false;
    const visit = (node: ts.Node): void => {
      if (referenced || node === statement) return;
      if (ts.isIdentifier(node) && node.text === statement.name!.text) {
        referenced = true;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    if (!referenced) removals.push({ start: statement.getStart(sourceFile), end: statement.end });
  }
  return removals.sort((a, b) => b.start - a.start)
    .reduce((value, range) => value.slice(0, range.start) + value.slice(range.end), source);
}

function resolveSchemaImportFile(baseDir: string, source: string): string | null {
  const rewritten = resolveLocalImportSource(baseDir, source);
  const candidate = path.resolve(baseDir, rewritten);
  return fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : null;
}

function schemaCallableExports(filePath: string): Set<string> {
  const sourceFile = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exported = new Set<string>();
  const isExported = (node: ts.Node): boolean => ts.canHaveModifiers(node)
    && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && isExported(statement)) {
      exported.add(statement.name.text);
      continue;
    }
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer
        && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
        exported.add(declaration.name.text);
      }
    }
  }
  return exported;
}

function schemaIdentifierUsed(source: string, identifier: string, includeFunctionBodies = true): boolean {
  const sourceFile = ts.createSourceFile(
    '_bsb_schema_usage_.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const isTypeOnlyReference = (node: ts.Identifier): boolean => {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (ts.isExpressionWithTypeArguments(current)
        && ts.isHeritageClause(current.parent)
        && current.parent.token === ts.SyntaxKind.ExtendsKeyword
        && ts.isClassLike(current.parent.parent)) {
        return false;
      }
      if (ts.isTypeNode(current)) return true;
      if (ts.isExpression(current) || ts.isStatement(current) || ts.isSourceFile(current)) return false;
      current = current.parent;
    }
    return false;
  };
  let used = false;
  const visit = (node: ts.Node): void => {
    if (used) return;
    if (!includeFunctionBodies && ts.isFunctionLike(node)) return;
    if (ts.isIdentifier(node) && node.text === identifier && !isTypeOnlyReference(node)) {
      used = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return used;
}

function assertSafeSchemaModule(
  sourceContent: string,
  filePath: string,
  trustedImports: ReadonlySet<string>,
  visited = new Set<string>(),
): void {
  const canonical = path.resolve(filePath);
  if (visited.has(canonical)) return;
  visited.add(canonical);
  const sourceFile = ts.createSourceFile(
    canonical,
    sourceContent,
    ts.ScriptTarget.Latest,
    true,
    canonical.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const allowedCalls = new Set(SCHEMA_IDENTIFIERS);
  const directOnlyCalls = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const source = statement.moduleSpecifier.text;
    const trusted = source === '@bsb/base' || trustedImports.has(source)
      || TRUSTED_SCHEMA_PACKAGES.has(source) || isLocalRelativeImport(source);
    if (!trusted || !statement.importClause) continue;
    if (statement.importClause.name
      && !isLocalRelativeImport(source)
      && schemaImportCallable(source, 'default', false, trustedImports)) {
      allowedCalls.add(statement.importClause.name.text);
      if (isLocalRelativeImport(source)) directOnlyCalls.add(statement.importClause.name.text);
    }
    const bindings = statement.importClause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)
      && schemaImportCallable(source, '*', true, trustedImports)) {
      allowedCalls.add(bindings.name.text);
      if (isLocalRelativeImport(source)) {
        directOnlyCalls.add(bindings.name.text);
        const imported = resolveSchemaImportFile(path.dirname(canonical), source);
        if (imported) {
          for (const callable of schemaCallableExports(imported)) {
            directOnlyCalls.add(`${bindings.name.text}.${callable}`);
          }
        }
      }
    }
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const imported = element.propertyName?.text ?? element.name.text;
        if (isLocalRelativeImport(source)) {
          const importedFile = resolveSchemaImportFile(path.dirname(canonical), source);
          if (!importedFile || !schemaCallableExports(importedFile).has(imported)) continue;
        }
        if (schemaImportCallable(source, imported, false, trustedImports)) {
          allowedCalls.add(element.name.text);
          if (isLocalRelativeImport(source)) directOnlyCalls.add(element.name.text);
        }
      }
    }
  }
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      if (allowedCalls.has(statement.name.text)) {
        throw new Error(`Schema extraction refused a shadowed callable binding in ${canonical}`);
      }
      allowedCalls.add(statement.name.text);
      directOnlyCalls.add(statement.name.text);
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer
        && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
        if (allowedCalls.has(declaration.name.text)) {
          throw new Error(`Schema extraction refused a shadowed callable binding in ${canonical}`);
        }
        allowedCalls.add(declaration.name.text);
        directOnlyCalls.add(declaration.name.text);
      }
    }
  }
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const source = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
      if (source === '@bsb/base' || trustedImports.has(source) || TRUSTED_SCHEMA_PACKAGES.has(source)) continue;
      if (!isLocalRelativeImport(source)) {
        throw new Error(`Schema extraction refused package import ${source || '<dynamic>'} in ${canonical}`);
      }
      const imported = resolveSchemaImportFile(path.dirname(canonical), source);
      if (!imported) throw new Error(`Schema extraction could not validate local import ${source} in ${canonical}`);
      assertSafeSchemaModule(fs.readFileSync(imported, 'utf-8'), imported, trustedImports, visited);
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.moduleSpecifier || statement.isTypeOnly) continue;
      const source = ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : '';
      if (source === '@bsb/base' || trustedImports.has(source) || TRUSTED_SCHEMA_PACKAGES.has(source)) continue;
      if (!isLocalRelativeImport(source)) {
        throw new Error(`Schema extraction refused package re-export ${source || '<dynamic>'} in ${canonical}`);
      }
      const exported = resolveSchemaImportFile(path.dirname(canonical), source);
      if (!exported) throw new Error(`Schema extraction could not validate local re-export ${source} in ${canonical}`);
      assertSafeSchemaModule(fs.readFileSync(exported, 'utf-8'), exported, trustedImports, visited);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const declared = schemaBindingNames(declaration.name);
        if (declared.some((name) => allowedCalls.has(name)
          && !(ts.isIdentifier(declaration.name)
            && declaration.initializer
            && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))))) {
          throw new Error(`Schema extraction refused a shadowed callable binding in ${canonical}`);
        }
        assertSafeSchemaInitializer(declaration.name, canonical, allowedCalls, directOnlyCalls);
        if (declaration.initializer) assertSafeSchemaInitializer(declaration.initializer, canonical, allowedCalls, directOnlyCalls);
      }
      continue;
    }
    if (ts.isClassDeclaration(statement)) {
      if (statement.name && allowedCalls.has(statement.name.text)) {
        throw new Error(`Schema extraction refused a shadowed callable binding in ${canonical}`);
      }
      assertNoSchemaDecorators(statement, canonical);
      for (const clause of statement.heritageClauses ?? []) {
        for (const type of clause.types) assertSafeSchemaInitializer(type.expression, canonical, allowedCalls, directOnlyCalls);
      }
      for (const member of statement.members) {
        assertNoSchemaDecorators(member, canonical);
        if (ts.isClassStaticBlockDeclaration(member)) {
          throw new Error(`Schema extraction refused a static block in ${canonical}`);
        }
        if (member.name && ts.isComputedPropertyName(member.name)) {
          assertSafeSchemaInitializer(member.name.expression, canonical, allowedCalls, directOnlyCalls);
        }
        if (ts.isPropertyDeclaration(member) && member.initializer) {
          assertSafeSchemaInitializer(member.initializer, canonical, allowedCalls, directOnlyCalls);
        }
        const methodName = member.name && (ts.isIdentifier(member.name) || ts.isStringLiteralLike(member.name))
          ? member.name.text
          : member.name && ts.isComputedPropertyName(member.name) && ts.isStringLiteralLike(member.name.expression)
            ? member.name.expression.text
            : null;
        if (ts.isConstructorDeclaration(member) || ts.isGetAccessorDeclaration(member)
          || ts.isSetAccessorDeclaration(member)
          || (ts.isMethodDeclaration(member)
            && (methodName === null || REACHABLE_SCHEMA_METHODS.has(methodName)))) {
          assertSafeSchemaInitializer(member, canonical, allowedCalls, directOnlyCalls);
        }
      }
      continue;
    }
    if (ts.isFunctionDeclaration(statement)) {
      assertNoSchemaDecorators(statement, canonical);
      assertSafeSchemaInitializer(statement, canonical, allowedCalls, directOnlyCalls);
      continue;
    }
    if (ts.isEnumDeclaration(statement)) {
      for (const member of statement.members) {
        if (member.initializer) assertSafeSchemaInitializer(member.initializer, canonical, allowedCalls, directOnlyCalls);
      }
      continue;
    }
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
      || ts.isEmptyStatement(statement)) {
      continue;
    }
    throw new Error(`Schema extraction refused executable top-level statement in ${canonical}`);
  }
}

/**
 * Extract schema-relevant source code from a plugin's index.ts.
 * Truncates at the class declaration and rewrites imports.
 */
function extractSchemaSource(
  sourceContent: string,
  pluginDirName: string,
  projectType: 'self' | 'external',
  sourceDir: string,
  bsbBaseImportPath: string,
  packageVersion: string,
): string {
  const classBody = extractPluginClassBody(sourceContent);
  const configBinding = extractStaticSchemaBinding(classBody, 'Config');
  const eventSchemasBinding = extractStaticSchemaBinding(classBody, 'EventSchemas');

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
  const pendingLocalImports: Array<{ line: string; identifiers: string[]; source: string }> = [];
  const pendingPackageImports: Array<{ line: string; identifiers: string[] }> = [];
  const bodyLines: string[] = [];

  for (const line of relevantLines) {
    const trimmed = line.trim();

    // Skip require() calls for non-schema modules
    if (/\brequire\s*\(/.test(trimmed)) {
      if (/schema/.test(trimmed)) {
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

      // Keep schema module imports as-is
      if (projectType === 'self' && SELF_SCHEMA_IMPORTS.has(parsed.source)) {
        resolvedImports.push(line);
        continue;
      }

      // Rewrite BSB base imports (../../base or @bsb/base)
      if (isBsbBaseImport(parsed.source)) {
        const rewritten = rewriteBsbImport(parsed.identifiers, projectType, bsbBaseImportPath);
        for (const l of rewritten) {
          resolvedImports.push(l);
        }
        continue;
      }

      // Local relative imports (./types, ./storage, etc.)
      // Defer decision — we'll check if identifiers are used in body text
      if (isLocalRelativeImport(parsed.source)) {
        // Queue for usage check
        pendingLocalImports.push({ line, identifiers: parsed.identifiers, source: parsed.source });
        continue;
      }

      // Keep package imports only when their bindings are used by schema declarations.
      if (TRUSTED_SCHEMA_PACKAGES.has(parsed.source)) {
        resolvedImports.push(line);
      } else if (parsed.identifiers.length > 0) {
        pendingPackageImports.push({ line, identifiers: parsed.identifiers });
      }
      continue;
    }

    // Keep all non-import lines (const declarations, comments, etc.)
    bodyLines.push(line);
  }

  // Pass 2: filter local imports — only keep those whose identifiers are referenced in body
  const bodyText = [bodyLines.join('\n'), configBinding, eventSchemasBinding].filter(Boolean).join('\n');
  for (const pending of pendingLocalImports) {
    const isUsed = pending.identifiers.some((id) => schemaIdentifierUsed(bodyText, id));
    if (isUsed) {
      resolvedImports.push(
        pending.line.replace(
          pending.source,
          resolveLocalImportSource(sourceDir, pending.source),
        ),
      );
    }
  }

  for (const pending of pendingPackageImports) {
    // Runtime helpers declared before Plugin are copied into the extraction module but are
    // never invoked. Their dependencies must not make arbitrary packages executable at build time.
    const isUsed = pending.identifiers.some((id) => schemaIdentifierUsed(bodyText, id, false));
    if (isUsed) {
      resolvedImports.push(pending.line);
    }
  }

  // Build final output: imports first, then body
  let outputLines = [...resolvedImports, ...bodyLines];
  outputLines = pruneUnreferencedSchemaFunctions(outputLines.join('\n')).split('\n');
  assertSafeSchemaModule(
    outputLines.join('\n'),
    path.join(sourceDir, '_bsb_extract_input_.ts'),
    new Set(projectType === 'self' ? SELF_SCHEMA_IMPORTS : [bsbBaseImportPath]),
  );

  // Append the extraction footer
  const exportEventSchemasImport = projectType === 'self'
    ? `import { exportEventSchemas } from "../../interfaces/schema-events.js";`
    : `import { exportEventSchemas } from '${bsbBaseImportPath}';`;

  outputLines.push('');
  outputLines.push('// --- Schema extraction footer (auto-generated) ---');
  outputLines.push(exportEventSchemasImport);
  outputLines.push('');
  outputLines.push(`let _Config: any;`);
  outputLines.push(`let _EventSchemas: any;`);
  outputLines.push(configBinding
    ? `_Config = ${configBinding};`
    : `try { _Config = eval('Config'); } catch { _Config = undefined; }`);
  outputLines.push(eventSchemasBinding
    ? `_EventSchemas = ${eventSchemasBinding};`
    : `try { _EventSchemas = eval('EventSchemas'); } catch { _EventSchemas = undefined; }`);
  outputLines.push('');
  outputLines.push(`const _pluginId = ${JSON.stringify(pluginDirName)};`);
  outputLines.push(`const _metadata = _Config && _Config.metadata ? (_Config as any).metadata : {};`);
  outputLines.push(`if (_metadata.id && _metadata.id !== _pluginId) {`);
  outputLines.push(`  throw new Error(\`Plugin metadata id \${_metadata.id} does not match plugin directory \${_pluginId}\`);`);
  outputLines.push(`}`);
  outputLines.push(`const _displayName = typeof _metadata.name === 'string' && _metadata.name.trim() ? _metadata.name.trim() : _pluginId;`);
  outputLines.push(`const _pluginVersion = ${JSON.stringify(packageVersion)};`);
  outputLines.push('');
  outputLines.push('const _schemaResult = (_EventSchemas)');
  outputLines.push('  ? exportEventSchemas(_pluginId, _EventSchemas as any)');
  outputLines.push('  : { pluginId: _pluginId, pluginName: _pluginId, events: {} };');
  outputLines.push('(_schemaResult as any).pluginId = _pluginId;');
  outputLines.push('(_schemaResult as any).pluginName = _pluginId;');
  outputLines.push('if (_displayName !== _pluginId) (_schemaResult as any).displayName = _displayName;');
  outputLines.push('(_schemaResult as any).version = _pluginVersion;');
  outputLines.push('');
  outputLines.push('// Extract config schema if Config exposes an AnyVali validation schema');
  outputLines.push('if (_Config) {');
  outputLines.push('  const _configInstance = new (_Config as any)("", "", "", "");');
  outputLines.push('  if (_configInstance.validationSchema && typeof _configInstance.validationSchema === "object") {');
  outputLines.push('    const _schema = _configInstance.validationSchema;');
  outputLines.push('    const _exportSchema = _schema?.export;');
  outputLines.push('    if (typeof _exportSchema !== "function") {');
  outputLines.push('      throw new Error("Config validationSchema does not expose export()");');
  outputLines.push('    }');
  outputLines.push('    (_schemaResult as any).configSchema = _exportSchema.call(_schema, "extended");');
  outputLines.push('    if (Array.isArray(_metadata.envOverridePaths) && _metadata.envOverridePaths.length > 0) {');
  outputLines.push('      const _extensions = (_schemaResult as any).configSchema.extensions ?? {};');
  outputLines.push('      (_schemaResult as any).configSchema.extensions = { ..._extensions, bsb: { ...(_extensions.bsb ?? {}), envOverridePaths: _metadata.envOverridePaths } };');
  outputLines.push('    }');
  outputLines.push('  }');
  outputLines.push('}');
  outputLines.push('');
  outputLines.push('export const __BSB_SCHEMA_RESULT = _schemaResult;');
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
  const packageVersion = readProjectPackageVersion(CWD);
  const bsbBaseImportPath = projectType === 'external'
    ? resolveBsbBaseEntryImport(CWD)
    : '';

  if (plugins.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No plugins found in src/plugins.');
    return;
  }

  // Create output directory
  const schemasDir = path.join(CWD, 'src', '.bsb', 'schemas');
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }

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

      // Place temp file in the plugin's directory so relative imports resolve
      const pluginDir = path.dirname(plugin.srcPath);
      const tempSource = extractSchemaSource(
        sourceContent,
        plugin.dirName,
        projectType,
        pluginDir,
        bsbBaseImportPath,
        packageVersion,
      );
      const tempFile = path.join(pluginDir, `_bsb_extract_temp_.ts`);
      tempFiles.push(tempFile);

      fs.writeFileSync(tempFile, tempSource, 'utf-8');

      const loaded = await import(
        `${toImportUrl(tempFile)}?t=${Date.now()}`
      ) as { __BSB_SCHEMA_RESULT?: Record<string, unknown> };
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
if (isMainModule(import.meta.url)) {
  main().catch(error => {
    // eslint-disable-next-line no-console
    console.error('Fatal error during schema extraction:', error);
    process.exit(1);
  });
}

export { extractSchemaSource, main as extractSchemasFromSource };
