/**
 * BSB plugin installer for container startup.
 *
 * Reads BSB_PLUGINS and installs into BSB plugin-dir structure:
 *   <pluginDir>/<npmPackage>/<major>/<minor>/<micro>/...
 *
 * Supported selectors:
 *   - @scope/name            -> highest available version
 *   - @scope/name@X.Y        -> highest X.Y.micro
 *   - @scope/name@X.Y.Z      -> exact
 *   - @scope/name:X.Y or :X.Y.Z (legacy delimiter)
 *
 * Rejected:
 *   - @scope/name@X          (major-only selector)
 *   - @scope/name@latest     (use no selector instead)
 */

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const TRUTHY = new Set(["1", "true", "yes", "y"]);
const MINOR_SELECTOR_REGEX = /^\d+\.\d+$/;
const EXACT_VERSION_REGEX = /^\d+\.\d+\.\d+$/;
const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;

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
    throw new Error(`Invalid selector "${selector}" for ${pkg}. Use no selector, X.Y, or X.Y.Z.`);
  }
  if (/^\d+$/.test(normalized)) {
    throw new Error(`Invalid selector "${selector}" for ${pkg}. Major-only is not allowed; use X.Y or X.Y.Z.`);
  }
  if (MINOR_SELECTOR_REGEX.test(normalized)) {
    return { pkg, type: "minor", selector: normalized };
  }
  if (EXACT_VERSION_REGEX.test(normalized)) {
    return { pkg, type: "exact", selector: normalized };
  }

  throw new Error(`Invalid selector "${selector}" for ${pkg}. Allowed formats: X.Y or X.Y.Z.`);
}

function runNpm(cwd, args, capture = false) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, args, {
    cwd,
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
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

async function removeDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
}

async function copyDir(from, to) {
  await removeDir(to);
  await ensureDir(path.dirname(to));
  await fs.cp(from, to, { recursive: true });
}

async function ensureHostBaseShim(targetDir) {
  const scopeDir = path.join(targetDir, "node_modules", "@bsb");
  const baseLink = path.join(scopeDir, "base");
  await ensureDir(scopeDir);
  await removeDir(baseLink);
  await fs.symlink("/home/bsb", baseLink);
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

  console.log(`[BSB] Installing plugin ${requestSpec}`);
  await ensureDir(stageDir);

  try {
    await fs.writeFile(
      path.join(stageDir, "package.json"),
      JSON.stringify({ name: "bsb-plugin-installer", version: "1.0.0", private: true }, null, 2),
      "utf-8",
    );

    runNpm(stageDir, ["install", "--omit=dev", "--no-audit", "--no-fund", requestSpec]);

    const installedPkgDir = path.join(stageDir, "node_modules", pkg);
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
    if (parsedSpec.type === "exact" && parsedSpec.selector !== resolvedVersion) {
      throw new Error(
        `Resolved version ${resolvedVersion} does not match exact selector ${parsedSpec.selector} for ${pkg}`
      );
    }

    const [major, minor, micro] = semver.map((x) => String(x));
    const versionDir = path.join(pluginRoot, major, minor, micro);
    await ensureDir(path.join(pluginRoot, major, minor));

    await copyDir(path.join(stageDir, "node_modules"), path.join(versionDir, "node_modules"));
    await fs.cp(installedPkgDir, versionDir, { recursive: true });
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
  const tempRoot = process.env.BSB_PLUGIN_TEMP_DIR || "/mnt/temp/bsb-plugin-installer";
  const forceUpdate = isTruthy(process.env.BSB_PLUGIN_UPDATE);
  const rawPlugins = String(process.env.BSB_PLUGINS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

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
