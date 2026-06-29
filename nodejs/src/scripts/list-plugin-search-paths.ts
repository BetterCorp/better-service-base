#!/usr/bin/env node

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type PluginSearchResult = {
  source: string;
  plugin: string;
  path: string;
};

const EXACT_VERSION_REGEX = /^\d+\.\d+\.\d+$/;

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function readDirectory(path: string) {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

function addPluginDirs(source: string, pluginsDir: string, results: PluginSearchResult[]): void {
  if (!isDirectory(pluginsDir)) return;

  for (const entry of readDirectory(pluginsDir)) {
    if (!entry.isDirectory()) continue;
    const pluginPath = join(pluginsDir, entry.name);
    const hasEntry = existsSync(join(pluginPath, "index.js")) || existsSync(join(pluginPath, "index.ts"));
    if (hasEntry) {
      results.push({ source, plugin: entry.name, path: pluginPath });
    }
  }
}

function addPackagePlugins(source: string, packageRoot: string, results: PluginSearchResult[]): void {
  addPluginDirs(source, join(packageRoot, "lib", "plugins"), results);
}

function addNodeModulesPlugins(cwd: string, results: PluginSearchResult[]): void {
  const nodeModules = join(cwd, "node_modules");
  if (!isDirectory(nodeModules)) return;

  for (const entry of readDirectory(nodeModules)) {
    if (!entry.isDirectory()) continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = join(nodeModules, entry.name);
      for (const scopedEntry of readDirectory(scopeDir)) {
        if (!scopedEntry.isDirectory()) continue;
        const packageName = `${entry.name}/${scopedEntry.name}`;
        addPackagePlugins(`node_modules:${packageName}`, join(scopeDir, scopedEntry.name), results);
      }
      continue;
    }

    addPackagePlugins(`node_modules:${entry.name}`, join(nodeModules, entry.name), results);
  }
}

function addVersionedPackagePlugins(
  source: string,
  packageName: string,
  packageRoot: string,
  results: PluginSearchResult[],
): void {
  for (const majorEntry of readDirectory(packageRoot)) {
    if (!majorEntry.isDirectory()) continue;

    const legacyPackageRoot = join(packageRoot, majorEntry.name);
    if (EXACT_VERSION_REGEX.test(majorEntry.name)) {
      addPackagePlugins(`${source}:${packageName}@${majorEntry.name}`, legacyPackageRoot, results);
      continue;
    }

    if (!/^\d+$/.test(majorEntry.name)) continue;
    const majorPath = join(packageRoot, majorEntry.name);
    for (const minorEntry of readDirectory(majorPath)) {
      if (!minorEntry.isDirectory() || !/^\d+$/.test(minorEntry.name)) continue;
      const minorPath = join(majorPath, minorEntry.name);
      for (const microEntry of readDirectory(minorPath)) {
        if (!microEntry.isDirectory() || !/^\d+$/.test(microEntry.name)) continue;
        const version = `${majorEntry.name}.${minorEntry.name}.${microEntry.name}`;
        addPackagePlugins(`${source}:${packageName}@${version}`, join(minorPath, microEntry.name), results);
      }
    }
  }
}

function addReferencedPluginDir(pluginDir: string, results: PluginSearchResult[]): void {
  if (!isDirectory(pluginDir)) return;

  for (const entry of readDirectory(pluginDir)) {
    if (!entry.isDirectory()) continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = join(pluginDir, entry.name);
      for (const scopedEntry of readDirectory(scopeDir)) {
        if (!scopedEntry.isDirectory()) continue;
        const packageName = `${entry.name}/${scopedEntry.name}`;
        addVersionedPackagePlugins(`plugin-dir:${pluginDir}`, packageName, join(scopeDir, scopedEntry.name), results);
      }
      continue;
    }

    addVersionedPackagePlugins(`plugin-dir:${pluginDir}`, entry.name, join(pluginDir, entry.name), results);
  }
}

export function collectPluginSearchResults(cwd: string = process.cwd()): PluginSearchResult[] {
  const results: PluginSearchResult[] = [];

  addPluginDirs("local:src", join(cwd, "src", "plugins"), results);
  addPluginDirs("local:lib", join(cwd, "lib", "plugins"), results);
  addNodeModulesPlugins(cwd, results);

  const pluginDirEnv = process.env.BSB_PLUGIN_DIRS
    ?? process.env.BSB_PLUGINS_DIR
    ?? process.env.BSB_PLUGIN_DIR;
  if (typeof pluginDirEnv === "string" && pluginDirEnv.length > 0) {
    for (const pluginDir of pluginDirEnv.split(",").map((x) => x.trim()).filter(Boolean)) {
      addReferencedPluginDir(pluginDir, results);
    }
  }

  return results.sort((a, b) => `${a.plugin}:${a.path}`.localeCompare(`${b.plugin}:${b.path}`));
}

export function printPluginSearchResults(cwd: string = process.cwd()): void {
  const results = collectPluginSearchResults(cwd);
  console.log("BSB plugin search report");
  console.log(`cwd: ${cwd}`);

  if (results.length === 0) {
    console.log("No plugins found in local, node_modules, or configured BSB plugin directories.");
    return;
  }

  for (const result of results) {
    console.log(`- ${result.plugin}`);
    console.log(`  source: ${result.source}`);
    console.log(`  path: ${result.path}`);
  }
}

printPluginSearchResults();
