#!/usr/bin/env node
/**
 * BSB Client CLI
 *
 * Commands for interacting with BSB Registry.
 * Provides plugin publishing, searching, and discovery.
 *
 * Usage:
 *   bsb-client list                 - List all plugins from registry
 *   bsb-client search <query>       - Search plugins
 *   bsb-client publish              - Publish current plugin(s) to registry
 *   bsb-client schema <name>        - Get plugin event schema
 *   bsb-client info <name>          - Get plugin details
 *   bsb-client install <name>       - Download schema and generate types
 *   bsb-client token generate       - Generate a new API token
 *
 * Environment:
 *   BSB_REGISTRY_URL    - Registry URL (default: https://io.bsbcode.dev)
 *   BSB_REGISTRY_TOKEN  - API token for authentication
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

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

function warn(message: string): void {
  log(`[WARN] ${message}`, 'yellow');
}

// Get registry URL from env or use default
const REGISTRY_URL = process.env.BSB_REGISTRY_URL || 'https://io.bsbcode.dev';
const REGISTRY_TOKEN = process.env.BSB_REGISTRY_TOKEN;
const VALID_CATEGORIES = new Set(['service', 'observable', 'events', 'config']);

const COMMAND = process.argv[2];
const ARGS = process.argv.slice(3);

/**
 * Parse a plugin ID into org and name.
 * Accepts both "org/name" and plain "name" formats.
 * When no org is provided, defaults to "_" (unaffiliated).
 */
function parsePluginId(pluginId: string): { org: string; name: string } {
  if (pluginId.includes('/')) {
    const [org, ...rest] = pluginId.split('/');
    return { org, name: rest.join('/') };
  }
  return { org: '_', name: pluginId };
}

/**
 * Format a plugin ID for display.
 * Hides the "_" sentinel org for unaffiliated plugins.
 */
function displayPluginId(org: string, name: string): string {
  return org === '_' ? name : `${org}/${name}`;
}

type RootPluginManifest = {
  nodejs?: Array<{
    id: string;
    name?: string;
    basePath?: string;
    image?: string;
    description?: string;
    tags?: string[];
    documentation?: string[];
    configSchema?: Record<string, unknown>;
    category?: string;
    author?: string | Record<string, unknown>;
    license?: string;
    homepage?: string;
    repository?: string;
    links?: Record<string, string>;
  }>;
};

function normalizeIgnoredPluginId(raw: string, org: string): string {
  const value = raw.trim();
  if (value.startsWith(`${org}/`)) {
    return value.substring(org.length + 1);
  }
  if (value.startsWith('_/')) {
    return value.substring(2);
  }
  return value;
}

function isPng(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((byte, idx) => buffer[idx] === byte);
}

function resolveCategory(pluginMeta: { id: string; category?: string }): string {
  const raw = (pluginMeta.category || pluginMeta.id.split('-')[0] || '').toLowerCase();
  if (!VALID_CATEGORIES.has(raw)) {
    throw new Error(
      `Invalid category "${raw}" for plugin "${pluginMeta.id}". Valid categories: service, observable, events, config.`
    );
  }
  return raw;
}

function resolveImagePath(pluginMeta: { basePath?: string; image?: string }): string | null {
  if (!pluginMeta.image) return null;
  const basePath = pluginMeta.basePath || '.';
  return path.resolve(process.cwd(), basePath, pluginMeta.image);
}

function formatRegistryError(parsed: any, statusCode?: number, raw?: string): string {
  if (!parsed || typeof parsed !== 'object') {
    return raw && raw.trim().length > 0
      ? raw
      : `HTTP ${statusCode ?? 'error'}`;
  }

  const base = parsed.error || `HTTP ${statusCode ?? 'error'}`;
  const code = parsed.code ? ` [${parsed.code}]` : '';

  if (Array.isArray(parsed.details) && parsed.details.length > 0) {
    const detailText = parsed.details
      .map((detail: any) => {
        const path = detail?.path ? String(detail.path) : '<root>';
        const message = detail?.message ? String(detail.message) : 'Invalid value';
        return `${path}: ${message}`;
      })
      .join('; ');
    return `${base}${code} - ${detailText}`;
  }

  if (parsed.message && typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
    return `${base}${code} - ${parsed.message}`;
  }

  return `${base}${code}`;
}

/**
 * Make HTTP request to registry
 */
async function registryRequest(
  method: string,
  path: string,
  body?: any,
  requireAuth: boolean = false
): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, REGISTRY_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(requireAuth && REGISTRY_TOKEN ? { Authorization: `Bearer ${REGISTRY_TOKEN}` } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(formatRegistryError(parsed, res.statusCode, data)));
          }
        } catch (err) {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(formatRegistryError(undefined, res.statusCode, data)));
          }
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function uploadPluginImage(org: string, pluginName: string, imagePath: string): Promise<any> {
  if (!REGISTRY_TOKEN) {
    throw new Error('BSB_REGISTRY_TOKEN environment variable not set');
  }
  if (!imagePath.toLowerCase().endsWith('.png')) {
    throw new Error(`Only PNG images are supported for upload: ${imagePath}`);
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  if (!isPng(imageBuffer)) {
    throw new Error(`Image is not a valid PNG file: ${imagePath}`);
  }

  const boundary = `----bsb-boundary-${Date.now().toString(16)}`;
  const fileName = path.basename(imagePath);
  const multipartHeader =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${fileName}"\r\n` +
    `Content-Type: image/png\r\n\r\n`;
  const multipartFooter = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(multipartHeader, 'utf-8'),
    imageBuffer,
    Buffer.from(multipartFooter, 'utf-8'),
  ]);

  return new Promise((resolve, reject) => {
    const uploadPath = `/plugins/${encodeURIComponent(org)}/${encodeURIComponent(pluginName)}/image`;
    const url = new URL(uploadPath, REGISTRY_URL);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${REGISTRY_TOKEN}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: any = {};
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            // Keep raw payload fallback for error messages
          }

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.error || data || `HTTP ${res.statusCode}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * List plugins from registry
 */
async function listPlugins(): Promise<void> {
  info('Fetching plugins from registry...');

  try {
    const result = await registryRequest('GET', '/plugins?limit=100');

    if (result.results.length === 0) {
      warn('No plugins found in registry');
      return;
    }

    log(`\nFound ${result.total} plugins:\n`, 'bright');

    result.results.forEach((plugin: any) => {
      log(`  ${plugin.id} @ ${plugin.version}`, 'cyan');
      log(`    ${plugin.description}`, 'reset');
      log(`    Language: ${plugin.language} | Category: ${plugin.category}`, 'reset');
      log('');
    });

    success(`Listed ${result.results.length} plugins`);
  } catch (err: any) {
    error(`Failed to list plugins: ${err.message}`);
  }
}

/**
 * Search plugins
 */
async function searchPlugins(query: string): Promise<void> {
  if (!query) {
    error('Please provide a search query: bsb-client search <query>');
  }

  info(`Searching for "${query}"...`);

  try {
    const result = await registryRequest('GET', `/plugins?query=${encodeURIComponent(query)}&limit=100`);

    if (result.results.length === 0) {
      warn(`No plugins found matching "${query}"`);
      return;
    }

    log(`\nFound ${result.total} matches:\n`, 'bright');

    result.results.forEach((plugin: any) => {
      log(`  ${plugin.id} @ ${plugin.version}`, 'cyan');
      log(`    ${plugin.description}`, 'reset');
      log(`    Language: ${plugin.language} | Category: ${plugin.category}`, 'reset');
      log('');
    });

    success(`Found ${result.results.length} matches`);
  } catch (err: any) {
    error(`Failed to search plugins: ${err.message}`);
  }
}

/**
 * Get plugin info
 */
async function getPluginInfo(pluginId: string): Promise<void> {
  if (!pluginId) {
    error('Please provide a plugin ID: bsb-client info <name> or bsb-client info <org/name>');
  }

  const { org, name } = parsePluginId(pluginId);
  const display = displayPluginId(org, name);

  info(`Fetching plugin info for ${display}...`);

  try {
    const result = await registryRequest('GET', `/plugins/${org}/${name}`);
    const plugin = result.plugin || result;

    log(`\nPlugin: ${plugin.displayName}\n`, 'bright');
    log(`  ID:           ${plugin.id}`, 'reset');
    log(`  Version:      ${plugin.version}`, 'reset');
    log(`  Language:     ${plugin.language}`, 'reset');
    log(`  Category:     ${plugin.category}`, 'reset');
    log(`  Description:  ${plugin.description}`, 'reset');
    log(`  Author:       ${plugin.author || 'N/A'}`, 'reset');
    log(`  License:      ${plugin.license || 'N/A'}`, 'reset');
    log(`  Homepage:     ${plugin.homepage || 'N/A'}`, 'reset');
    log(`  Repository:   ${plugin.repository || 'N/A'}`, 'reset');
    log(`  Events:       ${plugin.eventCount} total`, 'reset');
    log(`  Downloads:    ${plugin.downloads || 0}`, 'reset');
    log('');

    success('Plugin info retrieved');
  } catch (err: any) {
    error(`Failed to get plugin info: ${err.message}`);
  }
}

/**
 * Get plugin schema
 */
async function getPluginSchema(pluginId: string): Promise<void> {
  if (!pluginId) {
    error('Please provide a plugin ID: bsb-client schema <name> or bsb-client schema <org/name>');
  }

  const { org, name } = parsePluginId(pluginId);
  const display = displayPluginId(org, name);

  info(`Fetching schema for ${display}...`);

  try {
    // Get plugin to find latest version
    const result = await registryRequest('GET', `/plugins/${org}/${name}`);
    const plugin = result.plugin || result;
    const schema = await registryRequest('GET', `/plugins/${org}/${name}/${plugin.version}/schema`);

    log(`\nEvent Schema for ${pluginId} @ ${plugin.version}:\n`, 'bright');
    log(JSON.stringify(schema, null, 2), 'reset');

    success('Schema retrieved');
  } catch (err: any) {
    error(`Failed to get schema: ${err.message}`);
  }
}

/**
 * Publish plugin(s) to registry.
 * Iterates over all plugins in bsb-plugin.json and publishes each separately.
 * Org is read from package.json "bsb.orgId" field, defaulting to "_" (unaffiliated).
 */
async function publishPlugin(): Promise<void> {
  if (!REGISTRY_TOKEN) {
    error('BSB_REGISTRY_TOKEN environment variable not set. Get a token from the registry admin.');
  }

  info('Publishing plugin(s) to registry...');

  try {
    // Read package.json
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) {
      error('No package.json found in current directory');
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    // Read publish manifest from bsb-plugin.json
    const manifestPath = path.join(process.cwd(), 'bsb-plugin.json');
    if (!fs.existsSync(manifestPath)) {
      error('No bsb-plugin.json found. Run "bsb-plugin-cli build" first.');
    }
    const manifest: RootPluginManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const plugins = Array.isArray(manifest.nodejs) ? manifest.nodejs : [];
    if (plugins.length === 0) {
      error('No Node.js plugins found in bsb-plugin.json');
    }

    // Schemas are still sourced from generated lib/schemas/{plugin}.json
    const schemasDir = path.join(process.cwd(), 'lib', 'schemas');
    if (!fs.existsSync(schemasDir)) {
      error('No lib/schemas/ directory found. Run "bsb-plugin-cli build" first.');
    }

    // Read project README.md as fallback documentation
    const readmePath = path.join(process.cwd(), 'README.md');
    const readmeContent = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8') : undefined;

    // Org from package.json bsb.orgId, default to "_" (unaffiliated)
    const org: string = pkg.bsb?.orgId || '_';
    const publishIgnoreRaw = pkg.bsb?.publishIgnore;
    const publishIgnore = new Set<string>(
      Array.isArray(publishIgnoreRaw)
        ? publishIgnoreRaw
            .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry: string) => normalizeIgnoredPluginId(entry, org))
        : []
    );

    let published = 0;
    let skipped = 0;
    let errors = 0;

    for (const pluginMeta of plugins) {
      const pluginName: string = pluginMeta.id;
      const display = displayPluginId(org, pluginName);
      if (publishIgnore.has(pluginName)) {
        info(`Skipping ${display} (listed in package.json bsb.publishIgnore)`);
        skipped++;
        continue;
      }

      try {
        const category = resolveCategory({ id: pluginName, category: pluginMeta.category });
        const imagePath = resolveImagePath({ basePath: pluginMeta.basePath, image: pluginMeta.image });

        // Read event schema from lib/schemas/{pluginId}.json
        const schemaPath = path.join(schemasDir, `${pluginName}.json`);
        let eventSchema: Record<string, any> = { pluginName, version: pkg.version, events: {} };
        let configSchema: Record<string, any> | undefined;
        let schemaDeps: Array<{ id: string; version: string }> | undefined;

        if (fs.existsSync(schemaPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
            eventSchema = {
              pluginName: parsed.pluginName || pluginName,
              version: parsed.version || pkg.version,
              events: parsed.events || {},
            };
            if (parsed.capabilities && typeof parsed.capabilities === 'object') {
              eventSchema.capabilities = parsed.capabilities;
            }
            if (Array.isArray(parsed.dependencies) && parsed.dependencies.length > 0) {
              eventSchema.dependencies = parsed.dependencies;
              schemaDeps = parsed.dependencies;
            }
            if (parsed.configSchema && typeof parsed.configSchema === 'object') {
              configSchema = parsed.configSchema;
            }
          } catch {
            // Non-fatal -- use defaults
          }
        }

        // Fallback: configSchema from plugin.json
        if (!configSchema && pluginMeta.configSchema && typeof pluginMeta.configSchema === 'object') {
          configSchema = pluginMeta.configSchema;
        }

        // Read documentation files listed in plugin metadata
        const documentation: string[] = [];
        const docPaths: string[] = Array.isArray(pluginMeta.documentation) ? pluginMeta.documentation : [];
        for (const docPath of docPaths) {
          const fullPath = path.resolve(process.cwd(), docPath);
          if (fs.existsSync(fullPath)) {
            documentation.push(fs.readFileSync(fullPath, 'utf-8'));
          } else {
            warn(`Documentation file not found: ${docPath}`);
          }
        }

        // Fallback to project README.md
        if (documentation.length === 0) {
          if (readmeContent) {
            documentation.push(readmeContent);
          } else {
            error(`No documentation found for ${display}. Add documentation paths to Config metadata or provide a README.md.`);
          }
        }

        const publishRequest: Record<string, any> = {
          org,
          name: pluginName,
          version: pkg.version,
          language: 'nodejs',
          metadata: {
            displayName: pluginMeta.name || pluginName,
            description: pluginMeta.description || pkg.description || '',
            category,
            tags: pluginMeta.tags || pkg.keywords || [],
            author: pluginMeta.author || pkg.author,
            license: pluginMeta.license || pkg.license,
            homepage: pluginMeta.homepage || pkg.homepage,
            repository: pluginMeta.repository || (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url),
          },
          eventSchema,
          documentation,
          package: {
            nodejs: pkg.name,
          },
          visibility: 'public',
        };

        if (configSchema) {
          publishRequest.configSchema = configSchema;
        }

        // Top-level dependencies (registry gives these priority over eventSchema.dependencies)
        if (schemaDeps) {
          publishRequest.dependencies = schemaDeps;
        }

        info(`Publishing ${display} @ ${pkg.version}...`);

        const result = await registryRequest('POST', '/plugins', publishRequest, true);
        if (imagePath) {
          info(`Uploading image for ${display}...`);
          await uploadPluginImage(org, pluginName, imagePath);
        }

        success(`Published: ${display} @ ${result.version}${imagePath ? ' (with image)' : ''}`);
        published++;
      } catch (err: any) {
        log(`  Failed to publish ${display}: ${err.message}`, 'red');
        errors++;
      }
    }

    log('');
    if (published > 0) {
      success(`Published ${published} plugin(s)${skipped > 0 ? `, ${skipped} skipped` : ''}${errors > 0 ? `, ${errors} failed` : ''}`);
    }
    if (published === 0 && skipped > 0 && errors === 0) {
      success(`No plugins published (${skipped} skipped via package.json bsb.publishIgnore).`);
    }
    if (errors > 0 && published === 0) {
      error(`All ${errors} plugin(s) failed to publish`);
    }
  } catch (err: any) {
    error(`Failed to publish plugin: ${err.message}`);
  }
}

/**
 * Ensure the project's .gitignore contains the src/.bsb/ entry.
 */
function ensureGitignore(): void {
  const projectRoot = process.cwd();
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const bsbDir = path.join(projectRoot, 'src', '.bsb');
  let relativeBsbDir = path.relative(projectRoot, bsbDir).replace(/\\/g, '/');
  if (!relativeBsbDir.endsWith('/')) {
    relativeBsbDir += '/';
  }

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const alreadyIgnored = lines.some(line => {
        const trimmed = line.trim();
        return trimmed === relativeBsbDir ||
          trimmed === relativeBsbDir.replace(/\/$/, '') ||
          trimmed === '.bsb/' ||
          trimmed === '.bsb' ||
          trimmed === 'src/.bsb/' ||
          trimmed === 'src/.bsb';
      });

      if (!alreadyIgnored) {
        const newline = content.endsWith('\n') ? '' : '\n';
        fs.writeFileSync(gitignorePath, content + newline + relativeBsbDir + '\n', 'utf-8');
        success(`Added '${relativeBsbDir}' to .gitignore`);
      }
    } else {
      fs.writeFileSync(gitignorePath, relativeBsbDir + '\n', 'utf-8');
      success(`Created .gitignore with '${relativeBsbDir}'`);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Install plugin from registry (download schema and generate virtual client)
 */
async function installPlugin(pluginId: string): Promise<void> {
  if (!pluginId) {
    error('Please provide a plugin ID: bsb-client install <name> or bsb-client install <org/name>');
  }

  const { org, name } = parsePluginId(pluginId);
  const display = displayPluginId(org, name);

  info(`Installing plugin ${display}...`);

  try {
    // Get plugin metadata
    const detailResult = await registryRequest('GET', `/plugins/${org}/${name}`);
    const plugin = detailResult.plugin || detailResult;

    // Get plugin schema
    const schema = await registryRequest('GET', `/plugins/${org}/${name}/${plugin.version}/schema`);

    // Create directories for remote schemas and virtual clients
    const schemasDir = path.join(process.cwd(), 'src', '.bsb', 'schemas');
    const clientsDir = path.join(process.cwd(), 'src', '.bsb', 'clients');

    if (!fs.existsSync(schemasDir)) {
      fs.mkdirSync(schemasDir, { recursive: true });
    }
    if (!fs.existsSync(clientsDir)) {
      fs.mkdirSync(clientsDir, { recursive: true });
    }

    // Ensure .gitignore covers the generated directory
    ensureGitignore();

    // Save schema
    const schemaFile = path.join(schemasDir, `${name}.json`);
    fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2), 'utf-8');
    success(`Downloaded schema for ${display}`);

    // Generate virtual client by calling the generator
    const generatorPath = path.join(__dirname, 'generate-client-types.js');
    if (fs.existsSync(generatorPath)) {
      const { execSync } = require('child_process');
      try {
        execSync(`node "${generatorPath}"`, {
          cwd: process.cwd(),
          stdio: 'pipe',
        });
        success(`Generated virtual client for ${display}`);
      } catch (err) {
        warn('Failed to generate virtual client automatically. Run your build to regenerate.');
      }
    }

    log('');
    success(`Plugin ${display} @ ${plugin.version} installed`);
    log(`  Schema: ${schemaFile}`, 'reset');
    log(`  Import: import ${pluginNameToClassName(name)} from './.bsb/clients/${name}'`, 'reset');
  } catch (err: any) {
    error(`Failed to install plugin: ${err.message}`);
  }
}

/**
 * Convert plugin key/ID to PascalCase client class name.
 * Strips non-alphanumeric characters to ensure valid TypeScript identifiers.
 */
function pluginNameToClassName(pluginId: string): string {
  let name = pluginId;
  if (name.startsWith('service-')) {
    name = name.substring('service-'.length);
  }
  const pascal = name
    .replace(/[^a-zA-Z0-9-]/g, '')
    .split('-')
    .filter(part => part.length > 0)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return pascal + 'Client';
}

/**
 * Generate API token
 */
async function generateToken(): Promise<void> {
  warn('Token generation is not yet implemented.');
  warn('Please contact the registry administrator to obtain an API token.');
}

/**
 * Main CLI handler
 */
async function main(): Promise<void> {
  if (!COMMAND) {
    log('BSB Client CLI - Plugin Registry Commands', 'bright');
    log('');
    log('Usage:', 'cyan');
    log('  bsb-client list                  - List all plugins from registry');
    log('  bsb-client search <query>        - Search plugins');
    log('  bsb-client info <name>           - Get plugin details');
    log('  bsb-client schema <name>         - Get plugin event schema');
    log('  bsb-client install <name>        - Download schema and generate types');
    log('  bsb-client publish               - Publish current plugin(s) to registry');
    log('  bsb-client token generate        - Generate a new API token');
    log('');
    log('Plugin IDs:', 'cyan');
    log('  Use plain name:    bsb-client info service-bsb-registry');
    log('  Or with org:       bsb-client info myorg/service-bsb-registry');
    log('');
    log('Environment:', 'cyan');
    log(`  BSB_REGISTRY_URL    = ${REGISTRY_URL}`);
    log(`  BSB_REGISTRY_TOKEN  = ${REGISTRY_TOKEN ? '***' + REGISTRY_TOKEN.substring(REGISTRY_TOKEN.length - 4) : '(not set)'}`);
    log('');
    process.exit(0);
  }

  switch (COMMAND) {
    case 'list':
      await listPlugins();
      break;

    case 'search':
      await searchPlugins(ARGS[0]);
      break;

    case 'info':
      await getPluginInfo(ARGS[0]);
      break;

    case 'schema':
      await getPluginSchema(ARGS[0]);
      break;

    case 'install':
      await installPlugin(ARGS[0]);
      break;

    case 'publish':
      await publishPlugin();
      break;

    case 'token':
      if (ARGS[0] === 'generate') {
        await generateToken();
      } else {
        error('Unknown token command. Use: bsb-client token generate');
      }
      break;

    default:
      error(`Unknown command: ${COMMAND}`);
  }
}

// Run CLI
main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
});

