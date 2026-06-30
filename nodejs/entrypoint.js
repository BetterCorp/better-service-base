/**
 * BSB plugin installer for container startup.
 *
 * Reads BSB_PLUGINS and installs into BSB plugin-dir structure:
 *   <pluginDir>/<npmPackage>/<major>/<minor>/<micro>/...
 *
 * Supported selectors:
 *   - @scope/name            -> highest available version
 *   - @scope/name@X          -> highest X.y.z
 *   - @scope/name@X.Y        -> highest X.Y.micro
 *   - @scope/name@X.Y.Z      -> exact
 *   - @scope/name:X, :X.Y, or :X.Y.Z (legacy delimiter)
 *
 * Rejected:
 *   - @scope/name@latest     (use no selector instead)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const TRUTHY = new Set(["1", "true", "yes", "y"]);
const MAJOR_SELECTOR_REGEX = /^\d+$/;
const MINOR_SELECTOR_REGEX = /^\d+\.\d+$/;
const EXACT_VERSION_REGEX = /^\d+\.\d+\.\d+$/;
const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;
const REMOVE_RETRY_DELAYS_MS = [100, 250, 500, 1000, 2000];

function isTruthy(value) {
  return TRUTHY.has(String(value || "").trim().toLowerCase());
}

function parsePluginSpec(specRaw) {
  const spec = String(specRaw || "").trim();
  if (!spec) return null;

  let pkg = spec;
  let selector = null;

  if (spec.includes(":")) {
    const split = spec.split(/:(.+)/);
    pkg = split[0];
    selector = split[1] || null;
  } else {
    const lastAt = spec.lastIndexOf("@");
    if (lastAt > 0) {
      pkg = spec.slice(0, lastAt);
      selector = spec.slice(lastAt + 1) || null;
    }
  }

  if (!pkg) return null;
  if (!selector) {
    return { pkg, type: "none", selector: null };
  }

  const normalized = selector.trim();
  if (normalized.toLowerCase() === "latest") {
    throw new Error(`Invalid selector "${selector}" for ${pkg}. Use no selector, X, X.Y, or X.Y.Z.`);
  }
  if (MAJOR_SELECTOR_REGEX.test(normalized)) {
    return { pkg, type: "major", selector: normalized };
  }
  if (MINOR_SELECTOR_REGEX.test(normalized)) {
    return { pkg, type: "minor", selector: normalized };
  }
  if (EXACT_VERSION_REGEX.test(normalized)) {
    return { pkg, type: "exact", selector: normalized };
  }

  throw new Error(`Invalid selector "${selector}" for ${pkg}. Allowed formats: X, X.Y, or X.Y.Z.`);
}

function runNpm(cwd, args, capture = false) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, args, {
    cwd,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: {
      ...process.env,
      NPM_CONFIG_AUDIT: "false",
      NPM_CONFIG_FUND: "false",
      NPM_CONFIG_IGNORE_SCRIPTS: "false",
      NPM_CONFIG_LOGLEVEL: "silent",
      NPM_CONFIG_PROGRESS: "false",
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
      NPM_CONFIG_YES: "true",
    },
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(" ")} failed in ${cwd}${capture ? `\n${result.stderr || ""}` : ""}`);
  }
  return result;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function isRetryableRemoveError(error) {
  return error &&
    typeof error === "object" &&
    ["EBUSY", "ENOTEMPTY", "EPERM"].includes(String(error.code || ""));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDir(dir) {
  for (let attempt = 0; attempt <= REMOVE_RETRY_DELAYS_MS.length; attempt++) {
    try {
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return;
    } catch (error) {
      if (attempt >= REMOVE_RETRY_DELAYS_MS.length || !isRetryableRemoveError(error)) {
        throw error;
      }
      const delayMs = REMOVE_RETRY_DELAYS_MS[attempt];
      console.warn(`[BSB] Waiting ${delayMs}ms before retrying removal of ${dir}: ${error.message}`);
      await sleep(delayMs);
    }
  }
}

async function ensureHostBaseShim(targetDir) {
  const scopeDir = path.join(targetDir, "node_modules", "@bsb");
  const baseLink = path.join(scopeDir, "base");
  const hostBaseRoot = "/home/bsb/node_modules/@bsb/base";
  const fallbackHostBaseRoot = "/home/bsb";
  const linkTarget = await fileExists(path.join(hostBaseRoot, "package.json"))
    ? hostBaseRoot
    : fallbackHostBaseRoot;

  if (!(await fileExists(path.join(linkTarget, "package.json")))) {
    throw new Error(`Unable to create @bsb/base shim: host package not found at ${hostBaseRoot}`);
  }

  await ensureDir(scopeDir);
  await removeDir(baseLink);
  await fs.symlink(linkTarget, baseLink);
  console.log(`[BSB] Linked plugin-local @bsb/base -> ${linkTarget}`);
}

async function listVersionsForPackage(pluginRoot) {
  const versions = [];
  if (!(await fileExists(pluginRoot))) {
    return versions;
  }

  // Hierarchical layout: /pkg/<major>/<minor>/<micro>/
  const majorEntries = await fs.readdir(pluginRoot, { withFileTypes: true });
  for (const majorEntry of majorEntries) {
    if (!majorEntry.isDirectory() || !/^\d+$/.test(majorEntry.name)) continue;
    const majorPath = path.join(pluginRoot, majorEntry.name);
    const minorEntries = await fs.readdir(majorPath, { withFileTypes: true });
    for (const minorEntry of minorEntries) {
      if (!minorEntry.isDirectory() || !/^\d+$/.test(minorEntry.name)) continue;
      const minorPath = path.join(majorPath, minorEntry.name);
      const microEntries = await fs.readdir(minorPath, { withFileTypes: true });
      for (const microEntry of microEntries) {
        if (!microEntry.isDirectory() || !/^\d+$/.test(microEntry.name)) continue;
        versions.push(`${majorEntry.name}.${minorEntry.name}.${microEntry.name}`);
      }
    }
  }

  // Legacy layout: /pkg/<major.minor.micro>/
  for (const entry of majorEntries) {
    if (!entry.isDirectory()) continue;
    if (EXACT_VERSION_REGEX.test(entry.name)) versions.push(entry.name);
  }

  const dedup = Array.from(new Set(versions));
  dedup.sort(compareSemver);
  return dedup;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseSemver(version) {
  const m = String(version || "").match(SEMVER_REGEX);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa[0] !== pb[0]) return pa[0] - pb[0];
  if (pa[1] !== pb[1]) return pa[1] - pb[1];
  return pa[2] - pb[2];
}

function resolveRequestSpec(pkg, parsedSpec) {
  if (parsedSpec.type === "none") return `${pkg}@latest`;
  if (parsedSpec.type === "minor") return `${pkg}@${parsedSpec.selector}`;
  return `${pkg}@${parsedSpec.selector}`;
}

async function replaceDir(from, to, tempRoot) {
  await ensureDir(path.dirname(to));
  const oldDir = path.join(
    tempRoot,
    `old-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );

  if (await fileExists(to)) {
    await ensureDir(tempRoot);
    await fs.rename(to, oldDir);
  }

  try {
    await fs.rename(from, to);
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "EXDEV") {
      throw error;
    }
    await fs.cp(from, to, { recursive: true });
    await removeDir(from);
  }

  if (await fileExists(oldDir)) {
    try {
      await removeDir(oldDir);
    } catch (error) {
      console.warn(`[BSB] Warning: failed to remove old plugin cache ${oldDir}: ${error.message}`);
    }
  }
}

async function installPlugin({ parsedSpec, pluginDir, tempRoot, forceUpdate }) {
  const pkg = parsedSpec.pkg;
  const pluginRoot = path.join(pluginDir, pkg);
  const hasExplicitSelector = parsedSpec.type !== "none";
  const installedVersions = await listVersionsForPackage(pluginRoot);

  if (
    !forceUpdate &&
    !hasExplicitSelector &&
    installedVersions.length > 0
  ) {
    const highest = installedVersions[installedVersions.length - 1];
    console.log(`[BSB] Plugin ${pkg} already present at ${highest}. Skipping (set BSB_PLUGIN_UPDATE=true to refresh).`);
    return;
  }

  const requestSpec = resolveRequestSpec(pkg, parsedSpec);
  const stageDir = path.join(
    tempRoot,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const installedPkgDir = path.join(pluginDir, "node_modules", pkg);

  console.log(`[BSB] Installing plugin ${requestSpec}`);
  await ensureDir(stageDir);

  try {
    runNpm(pluginDir, [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--no-progress",
      "--no-update-notifier",
      "--loglevel=silent",
      "--silent",
      requestSpec,
    ]);
    await ensureHostBaseShim(pluginDir);

    const installedPkgJsonPath = path.join(installedPkgDir, "package.json");
    const installedPkgJson = JSON.parse(await fs.readFile(installedPkgJsonPath, "utf-8"));
    const resolvedVersion = String(installedPkgJson.version || "");
    const semver = parseSemver(resolvedVersion);
    if (!semver) {
      throw new Error(`Unable to resolve installed semver version for ${pkg}: ${resolvedVersion}`);
    }

    if (parsedSpec.type === "minor") {
      const [maj, min] = parsedSpec.selector.split(".").map((x) => Number(x));
      if (semver[0] !== maj || semver[1] !== min) {
        throw new Error(
          `Resolved version ${resolvedVersion} does not match selector ${parsedSpec.selector} for ${pkg}`
        );
      }
    }
    if (parsedSpec.type === "major") {
      const maj = Number(parsedSpec.selector);
      if (semver[0] !== maj) {
        throw new Error(
          `Resolved version ${resolvedVersion} does not match selector ${parsedSpec.selector} for ${pkg}`
        );
      }
    }
    if (parsedSpec.type === "exact" && parsedSpec.selector !== resolvedVersion) {
      throw new Error(
        `Resolved version ${resolvedVersion} does not match exact selector ${parsedSpec.selector} for ${pkg}`
      );
    }

    const [major, minor, micro] = semver.map((x) => String(x));
    const versionDir = path.join(pluginRoot, major, minor, micro);
    const stagedVersionDir = path.join(stageDir, "package");
    await ensureDir(path.join(pluginRoot, major, minor));

    await fs.cp(installedPkgDir, stagedVersionDir, { recursive: true });
    await removeDir(path.join(stagedVersionDir, "node_modules"));
    await replaceDir(stagedVersionDir, versionDir, tempRoot);
    await ensureHostBaseShim(versionDir);

    const pluginEntryPath = path.join(versionDir, "lib", "plugins");
    if (!(await fileExists(pluginEntryPath))) {
      console.warn(`[BSB] Warning: ${pkg}@${resolvedVersion} does not contain lib/plugins`);
    }

    console.log(`[BSB] Installed ${pkg} -> ${versionDir}`);
  } finally {
    await removeDir(stageDir);
  }
}

async function listInstalledPlugins(pluginDir) {
  const out = [];
  let topEntries = [];
  try {
    topEntries = await fs.readdir(pluginDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(pluginDir, entry.name);
      const scopedEntries = await fs.readdir(scopeDir, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory()) continue;
        const pkg = `${entry.name}/${scopedEntry.name}`;
        if ((await listVersionsForPackage(path.join(pluginDir, pkg))).length > 0) {
          out.push(pkg);
        }
      }
    } else {
      const pkg = entry.name;
      if ((await listVersionsForPackage(path.join(pluginDir, pkg))).length > 0) {
        out.push(pkg);
      }
    }
  }
  return out;
}

async function listInstalledPluginVersionDirs(pluginDir) {
  const out = [];
  let packages = [];
  try {
    packages = await listInstalledPlugins(pluginDir);
  } catch {
    return out;
  }

  for (const pkg of packages) {
    const pluginRoot = path.join(pluginDir, pkg);
    const versions = await listVersionsForPackage(pluginRoot);
    for (const version of versions) {
      const semver = parseSemver(version);
      if (!semver) continue;
      const [major, minor, micro] = semver.map((x) => String(x));
      const hierarchical = path.join(pluginRoot, major, minor, micro);
      if (await fileExists(hierarchical)) {
        out.push({ pkg, version, dir: hierarchical });
        continue;
      }
      const legacy = path.join(pluginRoot, version);
      if (await fileExists(legacy)) {
        out.push({ pkg, version, dir: legacy });
      }
    }
  }

  return out;
}

async function repairInstalledPluginBaseShims(pluginDir) {
  const versionDirs = await listInstalledPluginVersionDirs(pluginDir);
  if (versionDirs.length === 0) return;

  await ensureHostBaseShim(pluginDir);
  for (const installed of versionDirs) {
    try {
      await ensureHostBaseShim(installed.dir);
    } catch (error) {
      console.warn(
        `[BSB] Warning: failed to repair @bsb/base shim for ${installed.pkg}@${installed.version}: ${error.message}`
      );
    }
  }
}

async function main() {
  const rawDirs = process.env.BSB_PLUGIN_DIRS
    || process.env.BSB_PLUGINS_DIR
    || process.env.BSB_PLUGIN_DIR
    || "";
  const pluginDirs = rawDirs.split(",").map((d) => d.trim()).filter(Boolean);

  if (pluginDirs.length === 0) {
    console.log("[BSB] No plugin directories set. Skipping plugin bootstrap.");
    return;
  }

  const pluginDir = pluginDirs[0];
  const tempRoot = process.env.BSB_PLUGIN_TEMP_DIR || path.join(pluginDir, ".bsb-plugin-installer");
  const forceUpdate = isTruthy(process.env.BSB_PLUGIN_UPDATE);
  const rawPlugins = String(process.env.BSB_PLUGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  console.log(`[BSB] Plugin dirs: ${pluginDirs.join(", ")}`);
  console.log(`[BSB] Plugin install target: ${pluginDir}`);
  if (rawPlugins.length > 0) {
    console.log(`[BSB] Requested plugins: ${rawPlugins.join(", ")}`);
  }

  for (const dir of pluginDirs) {
    await ensureDir(dir);
    const pkgJsonPath = path.join(dir, "package.json");
    if (!(await fileExists(pkgJsonPath))) {
      console.log(`[BSB] Initializing ${ dir } with package.json`);
      await fs.writeFile(
        pkgJsonPath,
        JSON.stringify({ name: "bsb-plugins", version: "1.0.0", private: true }, null, 2),
        "utf-8",
      );
    }
  }

  await ensureDir(tempRoot);
  await repairInstalledPluginBaseShims(pluginDir);

  let parsedPlugins = rawPlugins
    .map(parsePluginSpec)
    .filter(Boolean);

  if (parsedPlugins.length === 0 && forceUpdate) {
    const existing = await listInstalledPlugins(pluginDir);
    parsedPlugins = existing.map((pkg) => ({ pkg, type: "none", selector: null }));
    if (parsedPlugins.length > 0) {
      console.log(`[BSB] BSB_PLUGIN_UPDATE requested. Refreshing ${parsedPlugins.length} installed plugin(s).`);
    }
  }

  if (parsedPlugins.length === 0) {
    console.log("[BSB] No BSB_PLUGINS requested. Nothing to install.");
    return;
  }

  for (const plugin of parsedPlugins) {
    await installPlugin({
      parsedSpec: plugin,
      pluginDir,
      tempRoot,
      forceUpdate,
    });
  }
}

main().catch((err) => {
  console.error("[BSB] Plugin installation failed:", err && err.stack ? err.stack : err);
  process.exit(1);
});
