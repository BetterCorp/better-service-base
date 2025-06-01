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
import * as chokidar from 'chokidar';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

let currentSB: ServiceBase | null = null;
let restartTimeout: NodeJS.Timeout | null = null;
let isRestarting = false;
let watcher: chokidar.FSWatcher | null = null;

interface WatchConfig {
  watch: string[];
  ignore: string[];
}

const DEFAULT_CONFIG: WatchConfig = {
  watch: [
    'src/**/*.ts',
    'sec-config.yaml'
  ],
  ignore: [
    '.git',
    'lib',
    'node_modules',
    'src/plugins/-*/**/*.ts'
  ]
};

const readWatchConfig = (filePath: string): WatchConfig => {
  if (!fs.existsSync(filePath)) {
    const defaultContent = [
      '# Watch patterns for BSB development',
      '# Add patterns to watch for changes, one per line',
      '# Add a ! to make it an ignore',
      '',
      ...DEFAULT_CONFIG.watch,
      ...DEFAULT_CONFIG.ignore.map(pattern => `!${pattern}`)
    ].join('\n');
    
    fs.writeFileSync(filePath, defaultContent);
    return DEFAULT_CONFIG;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  const watch: string[] = [];
  const ignore: string[] = [];

  lines.forEach(line => {
    if (line.startsWith('!')) {
      ignore.push(line.slice(1));
    } else {
      watch.push(line);
    }
  });

  return {
    watch: watch.length > 0 ? watch : DEFAULT_CONFIG.watch,
    ignore: ignore.length > 0 ? ignore : DEFAULT_CONFIG.ignore
  };
};

const startApp = async () => {
  const CWD = process.env.APP_DIR || process.cwd();
  const SB = new ServiceBase(true, false, CWD);
  await SB.init();
  await SB.run();
  return SB;
};

const restartApp = async () => {
  if (isRestarting) return;
  isRestarting = true;

  try {
    if (currentSB) {
      // Prevent process.exit() from being called
      const originalExit = process.exit;
      process.exit = ((code?: number | string | null) => {
        if (code === 0 && currentSB) {
          // Only allow exit if it's not a restart
          return;
        }
        originalExit(code);
      }) as typeof process.exit;

      await currentSB.dispose(0, "restart");
      process.exit = originalExit;
    }
    
    if (restartTimeout) {
      clearTimeout(restartTimeout);
    }

    restartTimeout = setTimeout(async () => {
      try {
        currentSB = await startApp();
      } catch (error) {
        console.error('Failed to restart app:', error);
      } finally {
        isRestarting = false;
      }
    }, 2000); // 2 second delay between restarts
  } catch (error) {
    console.error('Error during restart:', error);
    isRestarting = false;
  }
};

const dispose = async () => {
  if (watcher) {
    watcher.close();
  }
  if (restartTimeout) {
    clearTimeout(restartTimeout);
  }
  if (currentSB) {
    await currentSB.dispose(0, "manual exit");
  }
  process.exit(0);
};

const setupStdinWatcher = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Handle Ctrl+R
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'r') {
      console.log('\nRestarting...');
      restartApp();
    } else if (key.ctrl && (key.name === 'c' || key.name === 'd')) {
      console.log('\nDisposing...');
      dispose();
    }
  });

  // Handle 'rs' command
  rl.on('line', (input) => {
    if (input.trim() === 'rs') {
      console.log('Restarting...');
      restartApp();
    }
  });

  // Handle EOF (Ctrl+D)
  rl.on('close', () => {
    dispose();
  });
};

const runApp = async () => {
  try {
    const CWD = process.env.APP_DIR || process.cwd();
    const config = readWatchConfig(path.join(CWD, '.bsbdevwatch'));
    
    currentSB = await startApp();
    setupStdinWatcher();

    // Watch for file changes
    watcher = chokidar.watch(config.watch, {
      ignored: config.ignore,
      persistent: true
    });

    watcher.on('change', (path) => {
      console.log(`File ${path} has been changed`);
      restartApp();
    });

    // Handle process termination
    process.on('SIGINT', dispose);

  } catch (error) {
    console.error('Failed to start app:', error);
    process.exit(1);
  }
};

runApp();
