/**
 * BSB Build Hooks
 *
 * Runs user-defined npm scripts at specific points in the build/dev pipeline.
 * Configured via package.json under "bsb.hooks".
 *
 * Hook points:
 *   beforeSchemas  - Before schema extraction
 *   afterSchemas   - After schema generation, before TypeScript compilation
 *   beforeCompile  - Before TypeScript compilation
 *   afterCompile   - After TypeScript compilation succeeds
 *   afterBuild     - After full build completes (build only)
 *   beforeDev      - Once before first dev server start (dev only)
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type HookName = 'beforeSchemas' | 'afterSchemas' | 'beforeCompile' | 'afterCompile' | 'afterBuild' | 'beforeDev';

export interface BsbHooksConfig {
  beforeSchemas?: string | string[];
  afterSchemas?: string | string[];
  beforeCompile?: string | string[];
  afterCompile?: string | string[];
  afterBuild?: string | string[];
  beforeDev?: string | string[];
}

export const VALID_HOOK_NAMES: readonly HookName[] = [
  'beforeSchemas', 'afterSchemas', 'beforeCompile', 'afterCompile', 'afterBuild', 'beforeDev',
] as const;

export interface HookLogger {
  info(message: string): void;
  success(message: string): void;
  error(message: string): never;
  warn(message: string): void;
}

/**
 * Read hooks configuration from package.json at the given directory.
 */
export function readHooksConfig(cwd: string): BsbHooksConfig {
  const packageJsonPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const hooks = pkg.bsb?.hooks;
  if (!hooks || typeof hooks !== 'object') {
    return {};
  }
  return hooks as BsbHooksConfig;
}

/**
 * Resolve and validate hook scripts for a given hook name.
 * Returns an array of script names that exist in package.json scripts.
 * Throws if a referenced script does not exist.
 */
export function resolveHookScripts(hookName: HookName, cwd: string): string[] {
  const hooks = readHooksConfig(cwd);
  const scripts = hooks[hookName];
  if (!scripts) return [];

  const scriptList = Array.isArray(scripts) ? scripts : [scripts];
  const packageJsonPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const pkgScripts: Record<string, string> = pkg.scripts || {};

  const resolved: string[] = [];
  for (const scriptName of scriptList) {
    if (typeof scriptName !== 'string' || !scriptName.trim()) continue;
    if (!pkgScripts[scriptName]) {
      throw new Error(`Hook "${hookName}" references undefined script "${scriptName}"`);
    }
    resolved.push(scriptName);
  }
  return resolved;
}

/**
 * Execute hook scripts (build mode -- fatal on failure).
 */
export function runHook(hookName: HookName, cwd: string, logger: HookLogger): void {
  let scripts: string[];
  try {
    scripts = resolveHookScripts(hookName, cwd);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(message);
  }

  if (scripts!.length === 0) return;

  for (const scriptName of scripts!) {
    try {
      logger.info(`Hook [${hookName}]: ${scriptName}`);
      execSync(`npm run ${scriptName}`, { cwd, stdio: 'inherit' });
      logger.success(`Hook [${hookName}]: ${scriptName}`);
    } catch {
      logger.error(`Failed to run hook [${hookName}]: ${scriptName}`);
    }
  }
}

/**
 * Execute hook scripts (dev mode -- non-fatal, returns success boolean).
 */
export function runHookDev(hookName: HookName, cwd: string, logger: Omit<HookLogger, 'error'> & { error?: never; warn: (msg: string) => void }): boolean {
  let scripts: string[];
  try {
    scripts = resolveHookScripts(hookName, cwd);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(message);
    return false;
  }

  if (scripts.length === 0) return true;

  for (const scriptName of scripts) {
    try {
      logger.info(`Hook [${hookName}]: ${scriptName}`);
      execSync(`npm run ${scriptName}`, { cwd, stdio: 'inherit' });
      logger.success(`Hook [${hookName}]: ${scriptName}`);
    } catch {
      logger.warn(`Failed: Hook [${hookName}]: ${scriptName}`);
      return false;
    }
  }
  return true;
}
