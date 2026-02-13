#!/usr/bin/env node
/**
 * BSB (Better-Service-Base) is an event-bus based microservice framework.
 * Copyright (C) 2016 - 2025 BetterCorp (PTY) Ltd
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Alternatively, you may obtain a commercial license for this program.
 * The commercial license allows you to use the Program in a closed-source manner,
 * including the right to create derivative works that are not subject to the terms
 * of the AGPL.
 *
 * To obtain a commercial license, please contact the copyright holders at
 * https://www.bettercorp.dev. The terms and conditions of the commercial license
 * will be provided upon request.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { ServiceBase } from "./serviceBase/serviceBase";
import * as path from "path";
/**
 * @see {@link https://bsbcode.dev/languages/nodejs/types/modules.html#cli | API: CLI}
 */

const COMMAND = process.argv[2];
const SUBCOMMAND = process.argv[3];

/**
 * Run the BSB service (default behavior).
 */
const runApp = async () => {
  const CWD = process.env.APP_DIR || process.cwd();
  const SB = new ServiceBase({
    debug: false,
    live: true,
    cwd: CWD
  });
  await SB.init();
  await SB.run();
};

/**
 * Export event schemas from all discovered plugins.
 */
const exportSchemas = async () => {
  // eslint-disable-next-line no-console
  console.log('\n=== Exporting Event Schemas ===\n');
  const scriptPath = path.join(__dirname, 'scripts', 'export-schemas');
  const { exportSchemas: runExport } = require(scriptPath);
  await runExport();
};

/**
 * Generate TypeScript client types from exported schemas.
 */
const generateClientTypes = async () => {
  // eslint-disable-next-line no-console
  console.log('\n=== Generating TypeScript Client Types ===\n');
  const scriptPath = path.join(__dirname, 'scripts', 'generate-client-types');
  const { generateClientTypes: runGenerate } = require(scriptPath);
  await runGenerate();
};

/**
 * Sync schemas: export + generate types.
 */
const syncSchemas = async () => {
  // eslint-disable-next-line no-console
  console.log('\n=== Syncing Schemas (Export + Generate Types) ===\n');
  await exportSchemas();
  await generateClientTypes();
  // eslint-disable-next-line no-console
  console.log('\n✓ Schema sync complete\n');
};

/**
 * Show CLI usage.
 */
const showUsage = () => {
  console.log(`
BSB CLI - Better Service Base Framework

Usage:
  bsb                           Run the BSB service (default)
  bsb client <command>          Client type and schema management

Client Commands (Local Schema Operations):
  bsb client sync               Export schemas and generate types (recommended)
  bsb client export             Export event schemas from all plugins to JSON
  bsb client generate           Generate TypeScript client types from schemas

Client Commands (Registry Operations):
  bsb client list               List all plugins from registry
  bsb client search <query>     Search for plugins by name or tag
  bsb client info <org/name>    Get plugin details from registry
  bsb client schema <org/name>  Get plugin event schema from registry
  bsb client install <org/name> Download schema and generate types
  bsb client publish            Publish current plugin to registry
  bsb client token generate     Generate API token for registry

Examples:
  bsb                           # Start the service
  bsb client sync               # Export schemas and generate client types
  bsb client list               # List all plugins from registry
  bsb client search todo        # Search for plugins matching "todo"
  bsb client publish            # Publish current plugin to registry

Environment Variables:
  BSB_REGISTRY_URL              Registry URL (default: http://localhost:3100)
  BSB_REGISTRY_TOKEN            API token for authentication

For more information, visit: https://bsbcode.dev
`);
};

/**
 * Spawn bsb-client-cli with arguments.
 */
const spawnClientCli = async (args: string[]) => {
  const { spawn } = require('child_process');
  const clientCliPath = path.join(__dirname, 'scripts', 'bsb-client-cli.js');

  return new Promise<void>((resolve, reject) => {
    const child = spawn('node', [clientCliPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code: number) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`bsb-client-cli exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
};


/**
 * Main entry point.
 */
async function main() {
  try {
    // Handle client commands
    if (COMMAND === 'client') {
      switch (SUBCOMMAND) {
        // Local schema operations
        case 'export':
          await exportSchemas();
          break;
        case 'generate':
        case 'generate-types':
          await generateClientTypes();
          break;
        case 'sync':
          await syncSchemas();
          break;

        // Registry operations (delegate to bsb-client-cli)
        case 'list':
          await spawnClientCli(['list']);
          break;
        case 'search':
          if (!process.argv[4]) {
            // eslint-disable-next-line no-console
            console.error('Error: search requires a query parameter\n');
            // eslint-disable-next-line no-console
            console.log('Usage: bsb client search <query>');
            process.exit(1);
          }
          await spawnClientCli(['search', process.argv[4]]);
          break;
        case 'info':
          if (!process.argv[4]) {
            // eslint-disable-next-line no-console
            console.error('Error: info requires a plugin ID\n');
            // eslint-disable-next-line no-console
            console.log('Usage: bsb client info <org/name>');
            process.exit(1);
          }
          await spawnClientCli(['info', process.argv[4]]);
          break;
        case 'schema':
          if (!process.argv[4]) {
            // eslint-disable-next-line no-console
            console.error('Error: schema requires a plugin ID\n');
            // eslint-disable-next-line no-console
            console.log('Usage: bsb client schema <org/name>');
            process.exit(1);
          }
          await spawnClientCli(['schema', process.argv[4]]);
          break;
        case 'install':
          if (!process.argv[4]) {
            // eslint-disable-next-line no-console
            console.error('Error: install requires a plugin ID\n');
            // eslint-disable-next-line no-console
            console.log('Usage: bsb client install <org/name>');
            process.exit(1);
          }
          await spawnClientCli(['install', process.argv[4]]);
          break;
        case 'publish':
          await spawnClientCli(['publish']);
          break;
        case 'token':
          if (!process.argv[4] || process.argv[4] !== 'generate') {
            // eslint-disable-next-line no-console
            console.error('Error: token command requires "generate"\n');
            // eslint-disable-next-line no-console
            console.log('Usage: bsb client token generate');
            process.exit(1);
          }
          await spawnClientCli(['token', 'generate']);
          break;

        case 'help':
        case '--help':
        case '-h':
        case undefined:
          showUsage();
          break;
        default:
          // eslint-disable-next-line no-console
          console.error(`Unknown client command: ${SUBCOMMAND}\n`);
          showUsage();
          process.exit(1);
      }
    }
    // Handle help command
    else if (COMMAND === 'help' || COMMAND === '--help' || COMMAND === '-h') {
      showUsage();
    }
    // Default: run the service
    else if (!COMMAND) {
      await runApp();
    }
    // Unknown command
    else {
      // eslint-disable-next-line no-console
      console.error(`Unknown command: ${COMMAND}\n`);
      showUsage();
      process.exit(1);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
