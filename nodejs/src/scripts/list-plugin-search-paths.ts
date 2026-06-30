#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type JsonObject = Record<string, unknown>;

type PackageInfo = {
  name: string | null;
  version: string | null;
  root: string;
};

type PluginSearchResult = {
  source: string;
  plugin: string;
  path: string;
  package: PackageInfo | null;
  pluginType: string;
  pluginVersion: string | null;
  metadataPath: string | null;
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

function readJson(filePath: string): JsonObject | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as JsonObject;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readPackageInfo(packageRoot: string): PackageInfo | null {
  const pkg = readJson(join(packageRoot, "package.json"));
  if (pkg === null) return null;

  return {
    name: stringValue(pkg.name),
    version: stringValue(pkg.version),
    root: packageRoot,
  };
}

function inferPluginType(plugin: string): string {
  if (plugin.startsWith("service-")) return "service";
  if (plugin.startsWith("config-")) return "config";
  if (plugin.startsWith("events-")) return "events";
  if (plugin.startsWith("observable-")) return "observable";
  return "unknown";
}

function sectionForPluginType(pluginType: string): string {
  if (pluginType === "service") return "services";
  if (pluginType === "events") return "events";
  if (pluginType === "observable") return "observable";
  if (pluginType === "config") return "config plugin";
  return "unknown";
}

function findPluginMetadata(packageRoot: string | null, plugin: string): { data: JsonObject | null; path: string | null } {
  if (packageRoot === null) return { data: null, path: null };

  const candidates = [
    join(packageRoot, "lib", "schemas", `${plugin}.plugin.json`),
    join(packageRoot, "src", ".bsb", "schemas", `${plugin}.plugin.json`),
    join(packageRoot, "src", ".bsb", "schemas", `${plugin}.json`),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const data = readJson(candidate);
    if (data !== null) return { data, path: candidate };
  }

  return { data: null, path: null };
}

function addPluginDirs(
  source: string,
  pluginsDir: string,
  results: PluginSearchResult[],
  packageInfo: PackageInfo | null,
): void {
  if (!isDirectory(pluginsDir)) return;

  for (const entry of readDirectory(pluginsDir)) {
    if (!entry.isDirectory()) continue;
    const pluginPath = join(pluginsDir, entry.name);
    const hasEntry = existsSync(join(pluginPath, "index.js")) || existsSync(join(pluginPath, "index.ts"));
    if (!hasEntry) continue;

    const metadata = findPluginMetadata(packageInfo?.root ?? null, entry.name);
    const pluginType = stringValue(metadata.data?.category) ?? inferPluginType(entry.name);
    const pluginVersion = stringValue(metadata.data?.version) ?? packageInfo?.version ?? null;

    results.push({
      source,
      plugin: entry.name,
      path: pluginPath,
      package: packageInfo,
      pluginType,
      pluginVersion,
      metadataPath: metadata.path,
    });
  }
}

function addPackagePlugins(source: string, packageRoot: string, results: PluginSearchResult[]): void {
  const packageInfo = readPackageInfo(packageRoot);
  addPluginDirs(source, join(packageRoot, "lib", "plugins"), results, packageInfo);
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
  const localPackage = readPackageInfo(cwd);

  addPluginDirs("local:src", join(cwd, "src", "plugins"), results, localPackage);
  addPluginDirs("local:lib", join(cwd, "lib", "plugins"), results, localPackage);
  addNodeModulesPlugins(cwd, results);

  const pluginDirEnv = process.env.BSB_PLUGIN_DIRS
    ?? process.env.BSB_PLUGINS_DIR
    ?? process.env.BSB_PLUGIN_DIR;
  if (typeof pluginDirEnv === "string" && pluginDirEnv.length > 0) {
    for (const pluginDir of pluginDirEnv.split(",").map((x) => x.trim()).filter(Boolean)) {
      addReferencedPluginDir(pluginDir, results);
    }
  }

  return results.sort((a, b) => {
    const ap = a.package?.name ?? "local";
    const bp = b.package?.name ?? "local";
    return `${ap}:${a.plugin}:${a.path}`.localeCompare(`${bp}:${b.plugin}:${b.path}`);
  });
}

function formatPackage(packageInfo: PackageInfo | null): string {
  if (packageInfo === null) return "unknown package";
  const version = packageInfo.version === null ? "" : `@${packageInfo.version}`;
  return `${packageInfo.name ?? "unnamed package"}${version}`;
}

function formatConfigReference(result: PluginSearchResult): string[] {
  if (result.pluginType === "config") {
    const pkg = result.package?.name === null || result.package?.name === undefined
      ? ""
      : `BSB_CONFIG_PLUGIN_PACKAGE=${result.package.name}`;
    return [
      `BSB_CONFIG_PLUGIN=${result.plugin}`,
      pkg,
    ].filter((line) => line.length > 0);
  }

  const packageLine = result.package?.name === null || result.package?.name === undefined
    ? null
    : `package: ${result.package.name}`;
  return [
    `${result.plugin}:`,
    packageLine === null ? null : `  ${packageLine}`,
    `  plugin: ${result.plugin}`,
    "  enabled: true",
  ].filter((line): line is string => line !== null);
}

export function printPluginSearchResults(cwd: string = process.cwd()): void {
  const results = collectPluginSearchResults(cwd);
  console.log("BSB package/plugin search report");
  console.log(`cwd: ${cwd}`);

  if (results.length === 0) {
    console.log("No plugins found in local, node_modules, or configured BSB plugin directories.");
    return;
  }

  const groups = new Map<string, PluginSearchResult[]>();
  for (const result of results) {
    const key = `${formatPackage(result.package)}|${result.package?.root ?? result.source}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [result]);
    } else {
      group.push(result);
    }
  }

  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) continue;

    console.log(`- package: ${formatPackage(first.package)}`);
    console.log(`  root: ${first.package?.root ?? "unknown"}`);
    console.log(`  plugins: ${group.length}`);

    for (const result of group) {
      console.log(`  - ${result.plugin}`);
      console.log(`    type: ${result.pluginType}`);
      console.log(`    version: ${result.pluginVersion ?? "unknown"}`);
      console.log(`    section: ${sectionForPluginType(result.pluginType)}`);
      console.log(`    source: ${result.source}`);
      console.log(`    path: ${result.path}`);
      if (result.metadataPath !== null) {
        console.log(`    metadata: ${result.metadataPath}`);
      }
      console.log("    config reference:");
      for (const line of formatConfigReference(result)) {
        console.log(`      ${line}`);
      }
    }
  }
}

printPluginSearchResults();
