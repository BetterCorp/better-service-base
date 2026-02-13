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
 *   bsb-client publish              - Publish current plugin to registry
 *   bsb-client schema <org/name>    - Get plugin event schema
 *   bsb-client info <org/name>      - Get plugin details
 *   bsb-client token generate       - Generate a new API token
 *
 * Environment:
 *   BSB_REGISTRY_URL    - Registry URL (default: https://registry.bsbcode.dev)
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
const REGISTRY_URL = process.env.BSB_REGISTRY_URL || 'http://localhost:3100';
const REGISTRY_TOKEN = process.env.BSB_REGISTRY_TOKEN;

const COMMAND = process.argv[2];
const ARGS = process.argv.slice(3);

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
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          }
        } catch (err) {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`Failed to parse response: ${data}`));
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

/**
 * List plugins from registry
 */
async function listPlugins(): Promise<void> {
  info('Fetching plugins from registry...');

  try {
    const result = await registryRequest('GET', '/api/plugins?limit=100');

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
    const result = await registryRequest('GET', `/api/plugins/search?q=${encodeURIComponent(query)}`);

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
    error('Please provide a plugin ID: bsb-client info <org/name>');
  }

  const [org, name] = pluginId.split('/');
  if (!org || !name) {
    error('Invalid plugin ID format. Expected: org/name');
  }

  info(`Fetching plugin info for ${pluginId}...`);

  try {
    const plugin = await registryRequest('GET', `/api/plugins/${org}/${name}`);

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
    error('Please provide a plugin ID: bsb-client schema <org/name>');
  }

  const [org, name] = pluginId.split('/');
  if (!org || !name) {
    error('Invalid plugin ID format. Expected: org/name');
  }

  info(`Fetching schema for ${pluginId}...`);

  try {
    // Get plugin to find latest version
    const plugin = await registryRequest('GET', `/api/plugins/${org}/${name}`);
    const schema = await registryRequest('GET', `/api/plugins/${org}/${name}/${plugin.version}/schema`);

    log(`\nEvent Schema for ${pluginId} @ ${plugin.version}:\n`, 'bright');
    log(JSON.stringify(schema, null, 2), 'reset');

    success('Schema retrieved');
  } catch (err: any) {
    error(`Failed to get schema: ${err.message}`);
  }
}

/**
 * Publish plugin to registry
 */
async function publishPlugin(): Promise<void> {
  if (!REGISTRY_TOKEN) {
    error('BSB_REGISTRY_TOKEN environment variable not set. Get a token from the registry admin.');
  }

  info('Publishing plugin to registry...');

  try {
    // Read package.json
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (!fs.existsSync(pkgPath)) {
      error('No package.json found in current directory');
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    // Read bsb-plugin.json (generated by exportSchemas)
    const pluginJsonPath = path.join(process.cwd(), 'bsb-plugin.json');
    if (!fs.existsSync(pluginJsonPath)) {
      error('No bsb-plugin.json found. Run "bsb plugin export" first to generate schemas.');
    }

    const pluginData = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));

    // Read README.md
    const readmePath = path.join(process.cwd(), 'README.md');
    const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8') : 'No README available';

    // Extract org/name from package name (e.g., @bettercorp/service-demo-todo -> bettercorp/service-demo-todo)
    let org: string;
    let name: string;

    if (pkg.name.startsWith('@')) {
      const parts = pkg.name.substring(1).split('/');
      org = parts[0];
      name = parts[1] || pkg.name;
    } else {
      org = 'default';
      name = pkg.name;
    }

    // Prepare publish request
    const publishRequest = {
      org,
      name,
      version: pkg.version,
      language: 'nodejs',
      metadata: {
        displayName: pluginData.metadata?.name || name,
        description: pkg.description || '',
        category: pluginData.metadata?.category || 'other',
        tags: pkg.keywords || [],
        author: pkg.author,
        license: pkg.license,
        homepage: pkg.homepage,
        repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url,
      },
      eventSchema: JSON.stringify(pluginData.eventSchema),
      documentation: {
        readme,
      },
      package: {
        nodejs: pkg.name,
      },
      visibility: 'public',
    };

    info(`Publishing ${org}/${name} @ ${pkg.version}...`);

    const result = await registryRequest('POST', '/api/plugins', publishRequest, true);

    log('');
    success(`Plugin published: ${result.pluginId} @ ${result.version}`);
    log(`  ${result.message}`, 'reset');
  } catch (err: any) {
    error(`Failed to publish plugin: ${err.message}`);
  }
}

/**
 * Install plugin from registry (download schema and generate types)
 */
async function installPlugin(pluginId: string): Promise<void> {
  if (!pluginId) {
    error('Please provide a plugin ID: bsb-client install <org/name>');
  }

  const [org, name] = pluginId.split('/');
  if (!org || !name) {
    error('Invalid plugin ID format. Expected: org/name');
  }

  info(`Installing plugin ${pluginId}...`);

  try {
    // Get plugin metadata
    const plugin = await registryRequest('GET', `/api/plugins/${org}/${name}`);

    // Get plugin schema
    const schema = await registryRequest('GET', `/api/plugins/${org}/${name}/${plugin.version}/schema`);

    // Create directories
    const schemasDir = path.join(process.cwd(), 'lib', 'schemas', 'remote');
    const typesDir = path.join(process.cwd(), 'lib', 'types', 'remote');

    if (!fs.existsSync(schemasDir)) {
      fs.mkdirSync(schemasDir, { recursive: true });
    }
    if (!fs.existsSync(typesDir)) {
      fs.mkdirSync(typesDir, { recursive: true });
    }

    // Save schema
    const schemaFile = path.join(schemasDir, `${name}.json`);
    fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2), 'utf-8');
    success(`Downloaded schema for ${pluginId}`);

    // Generate TypeScript types by calling the generator
    const generatorPath = path.join(__dirname, 'generate-client-types.js');
    if (fs.existsSync(generatorPath)) {
      // Generate types for the specific schema
      const { execSync } = require('child_process');
      try {
        execSync(`node "${generatorPath}"`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          env: { ...process.env, BSB_SCHEMA_FILE: schemaFile }
        });
        success(`Generated TypeScript types for ${pluginId}`);
      } catch (err) {
        warn('Failed to generate types automatically. Run "bsb client generate" manually.');
      }
    }

    // Check if npm package exists and suggest installation
    if (plugin.package?.nodejs) {
      log('');
      info(`To install the npm package, run:`);
      log(`  npm install ${plugin.package.nodejs}`, 'cyan');
    }

    log('');
    success(`Plugin ${pluginId} @ ${plugin.version} installed`);
    log(`  Schema: ${schemaFile}`, 'reset');
    log(`  Import types: import type { Plugin } from '@bsb/base/types/remote/${name}'`, 'reset');
  } catch (err: any) {
    error(`Failed to install plugin: ${err.message}`);
  }
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
    log('  bsb-client info <org/name>       - Get plugin details');
    log('  bsb-client schema <org/name>     - Get plugin event schema');
    log('  bsb-client install <org/name>    - Download schema and generate types');
    log('  bsb-client publish               - Publish current plugin to registry');
    log('  bsb-client token generate        - Generate a new API token');
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
