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
 *   bsb-client publish --target URL --plugin ID --token TOKEN - Publish one plugin to Vault
 *   bsb-client schema <name>        - Get plugin event schema
 *   bsb-client info <name>          - Get plugin details
 *   bsb-client install <name>       - Download schema and generate types
 *   bsb-client token generate       - Generate a new API token
 *
 * Environment:
 *   BSB_REGISTRY_URL    - Registry URL (default: https://io.bsbcode.dev)
 *   BSB_REGISTRY_TOKEN  - API token for authentication
 */

import { execSync } from "node:child_process";
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import * as http from 'node:http';
import { getModuleDir } from '../base/module-runtime.js';
import { retryRegistryPublish } from './registry-retry.js';

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
const REGISTRY_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.BSB_REGISTRY_TIMEOUT_MS || '30000', 10);
const VALID_CATEGORIES = new Set(['service', 'observable', 'events', 'config']);

const COMMAND = process.argv[2];
const ARGS = process.argv.slice(3);
const MODULE_DIR = getModuleDir(import.meta.url);

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

function resolveCategory(pluginId: string): string {
  const raw = (pluginId.split('-')[0] || '').toLowerCase();
  if (!VALID_CATEGORIES.has(raw)) {
    throw new Error(
      `Invalid category "${raw}" for plugin "${pluginId}". Valid categories: service, observable, events, config.`
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

  const base = parsed.error || parsed.statusMessage || parsed.message || `HTTP ${statusCode ?? 'error'}`;
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
  requireAuth: boolean = false,
  baseUrl: string = REGISTRY_URL,
  token: string | undefined = REGISTRY_TOKEN,
): Promise<any> {
  if (requireAuth && !token) {
    throw new Error('Publish token is required');
  }

  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
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
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    req.setTimeout(REGISTRY_REQUEST_TIMEOUT_MS, () => {
      const err = new Error(`Registry request timed out after ${REGISTRY_REQUEST_TIMEOUT_MS}ms`);
      (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      req.destroy(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function uploadPluginImage(
  org: string,
  pluginName: string,
  imagePath: string,
  baseUrl: string = REGISTRY_URL,
  token: string | undefined = REGISTRY_TOKEN,
): Promise<any> {
  if (!token) {
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
    const url = new URL(uploadPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
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
          'Authorization': `Bearer ${token}`,
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
    req.setTimeout(REGISTRY_REQUEST_TIMEOUT_MS, () => {
      const err = new Error(`Registry image upload timed out after ${REGISTRY_REQUEST_TIMEOUT_MS}ms`);
      (err as NodeJS.ErrnoException).code = 'ETIMEDOUT';
      req.destroy(err);
    });
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
function parsePublishOptions(args: string[]): { target?: string; token?: string; plugin?: string; allowInsecure: boolean } {
  const options: { target?: string; token?: string; plugin?: string; allowInsecure: boolean } = { allowInsecure: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--allow-insecure') {
      options.allowInsecure = true;
      continue;
    }
    if (argument !== '--target' && argument !== '--token' && argument !== '--plugin') {
      throw new Error(`Unknown publish option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
    options[argument.slice(2) as 'target' | 'token' | 'plugin'] = value;
    index += 1;
  }
  return options;
}

async function publishPlugin(): Promise<void> {
  try {
    const options = parsePublishOptions(ARGS);
    const token = options.token ?? REGISTRY_TOKEN;
    if (!token) throw new Error('Provide --token or set BSB_REGISTRY_TOKEN');
    const vaultTarget = token.startsWith('bv_p_');
    const target = options.target ?? REGISTRY_URL;
    if (vaultTarget && !options.target) throw new Error('Vault publishing requires --target <vault-url>');
    const targetUrl = new URL(target);
    if (targetUrl.protocol !== 'https:' && targetUrl.protocol !== 'http:') throw new Error('Publish target must use HTTP or HTTPS');
    const loopback = targetUrl.hostname === 'localhost' || targetUrl.hostname === '127.0.0.1' || targetUrl.hostname === '[::1]';
    if (vaultTarget && targetUrl.protocol !== 'https:' && !loopback && !options.allowInsecure) {
      throw new Error('Vault publishing requires HTTPS; use --allow-insecure only for development');
    }
    info(`Publishing plugin(s) to ${vaultTarget ? 'Vault' : 'registry'}...`);

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
    const allPlugins = Array.isArray(manifest.nodejs) ? manifest.nodejs : [];
    const requestedPlugin = options.plugin ? normalizeIgnoredPluginId(options.plugin, pkg.bsb?.orgId || '_') : undefined;
    const plugins = requestedPlugin ? allPlugins.filter((plugin) => plugin.id === requestedPlugin) : allPlugins;
    if (plugins.length === 0) {
      throw new Error(requestedPlugin
        ? `Plugin ${options.plugin} was not found in bsb-plugin.json`
        : 'No Node.js plugins found in bsb-plugin.json');
    }
    if (vaultTarget && allPlugins.length > 1 && !requestedPlugin) {
      throw new Error('Vault publish tokens authorize one plugin; select it with --plugin <plugin-id>');
    }

    // Schemas are still sourced from generated lib/schemas/{plugin}.json
    const schemasDir = path.join(process.cwd(), 'lib', 'schemas');
    if (!fs.existsSync(schemasDir)) {
      error('No lib/schemas/ directory found. Run "bsb-plugin-cli build" first.');
    }

    // Read project README.md as fallback documentation
    const readmePath = path.join(process.cwd(), 'README.md');
    const readmeContent = !vaultTarget && fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8') : undefined;

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
        const category = resolveCategory(pluginName);
        const imagePath = vaultTarget ? null : resolveImagePath({ basePath: pluginMeta.basePath, image: pluginMeta.image });

        // Read event schema from lib/schemas/{pluginId}.json
        const schemaPath = path.join(schemasDir, `${pluginName}.json`);
        let eventSchema: Record<string, any> = { pluginId: pluginName, pluginName, version: pkg.version, events: {} };
        let configSchema: Record<string, any> | undefined;
        let schemaDeps: Array<{ id: string; version: string }> | undefined;

        if (fs.existsSync(schemaPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
            const displayName = typeof parsed.displayName === 'string' && parsed.displayName.trim()
              ? parsed.displayName.trim()
              : typeof parsed.pluginName === 'string' && parsed.pluginName !== pluginName
                ? parsed.pluginName
                : undefined;
            eventSchema = {
              pluginId: pluginName,
              pluginName,
              ...(displayName ? { displayName } : {}),
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
        if (!vaultTarget) {
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
              throw new Error(`No documentation found for ${display}. Add documentation paths to Config metadata or provide a README.md.`);
            }
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
            author: pkg.author,
            license: pkg.license,
            homepage: pluginMeta.homepage || pkg.homepage,
            repository: pluginMeta.repository || (typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url),
          },
          eventSchema,
          package: {
            nodejs: pkg.name,
          },
        };

        if (!vaultTarget) {
          delete publishRequest.eventSchema.pluginId;
          delete publishRequest.eventSchema.displayName;
          publishRequest.documentation = documentation;
          publishRequest.visibility = 'public';
        }

        if (configSchema) {
          publishRequest.configSchema = configSchema;
        }

        // Top-level dependencies (registry gives these priority over eventSchema.dependencies)
        if (schemaDeps) {
          publishRequest.dependencies = schemaDeps;
        }

        info(`Publishing ${display} @ ${pkg.version}...`);

        const result = await retryRegistryPublish(
          () => registryRequest('POST', vaultTarget ? '/api/plugins/publish' : '/plugins', publishRequest, true, target, token),
          {
            onRetry: (attempt, maxAttempts, err, delayMs) => {
              warn(`Publish failed with a network error (${err.message}); waiting ${Math.ceil(delayMs / 1000)}s before retry ${attempt}/${maxAttempts}...`);
            },
          }
        );
        if (imagePath) {
          info(`Uploading image for ${display}...`);
          await retryRegistryPublish(
            () => uploadPluginImage(org, pluginName, imagePath, target, token),
            {
              onRetry: (attempt, maxAttempts, err, delayMs) => {
                warn(`Image upload failed with a network error (${err.message}); waiting ${Math.ceil(delayMs / 1000)}s before retry ${attempt}/${maxAttempts}...`);
              },
            }
          );
        }

        const publishedVersion = result.plugin?.version ?? result.version ?? pkg.version;
        success(`${result.status === 'unchanged' ? 'Unchanged' : 'Published'}: ${display} @ ${publishedVersion}${imagePath ? ' (with image)' : ''}`);
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
    const generatorPath = path.join(MODULE_DIR, 'generate-client-types.js');
    if (fs.existsSync(generatorPath)) {
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
    log(`  Import: import ${pluginNameToClassName(name)} from './.bsb/clients/${name}.js'`, 'reset');
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
    log('  bsb-client publish --target URL --plugin ID --token TOKEN - Publish one plugin directly to Vault');
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

