import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BsbDevConfig {
  ignore: string[];
}

const DEFAULT_DEV_IGNORE_PATTERNS = [
  '.git',
  'lib',
  'node_modules',
  'src/.bsb',
  '**/.bp-generated/**',
];

/**
 * Read dev configuration from package.json at the given directory.
 */
export function readDevConfig(cwd: string): BsbDevConfig {
  const packageJsonPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const ignore = pkg.bsb?.dev?.ignore;

  return {
    ignore: Array.isArray(ignore)
      ? ignore.filter((pattern): pattern is string => typeof pattern === 'string' && pattern.trim().length > 0)
      : [],
  };
}

export function resolveDevIgnorePatterns(cwd: string): string[] {
  const configured = readDevConfig(cwd).ignore;
  return [...DEFAULT_DEV_IGNORE_PATTERNS, ...configured].map((pattern) => normalizeWatchPattern(cwd, pattern));
}

export function isDevIgnoredPath(cwd: string, filePath: string, ignorePatterns = resolveDevIgnorePatterns(cwd)): boolean {
  const normalizedPath = normalizePath(path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath));

  return ignorePatterns.some((pattern) => {
    if (!pattern.includes('*')) {
      return normalizedPath === pattern || normalizedPath.startsWith(`${pattern}/`);
    }
    return globToRegExp(pattern).test(normalizedPath);
  });
}

function normalizePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/');
}

function normalizeWatchPattern(cwd: string, pattern: string): string {
  const normalized = normalizePath(pattern.trim());
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  return normalizePath(path.join(cwd, normalized));
}

function globToRegExp(pattern: string): RegExp {
  let source = '^';

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    const nextChar = pattern[i + 1];

    if (char === '*' && nextChar === '*') {
      source += '.*';
      i += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += escapeRegExp(char);
    }
  }

  return new RegExp(`${source}$`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
