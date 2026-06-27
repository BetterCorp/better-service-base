#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const argv = process.argv.slice(2);

const getArg = (name) => {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] || null;
};

const hasFlag = (name) => argv.includes(name);

const cwd = path.resolve(getArg("--cwd") || process.cwd());
const pluginFilter = getArg("--plugin");
const forceTs = hasFlag("--ts");
const forceJs = hasFlag("--js");
const enableCoverage = !hasFlag("--no-coverage");

const ignoreDirs = new Set([
  "node_modules",
  ".git",
  "lib",
  "dist",
  ".bsb",
  ".npm-cache",
  ".claude",
]);

const findFiles = (dir, filename, results = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      findFiles(path.join(dir, entry.name), filename, results);
      continue;
    }
    if (entry.isFile() && entry.name === filename) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const resolvePackageBin = (packageName, binName) => {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageJson = readJson(packageJsonPath);
  const binPath = typeof packageJson.bin === "string"
    ? packageJson.bin
    : packageJson.bin?.[binName];
  if (!binPath) {
    throw new Error(`Package ${packageName} does not declare bin ${binName}`);
  }
  return path.resolve(path.dirname(packageJsonPath), binPath);
};

const resolvePluginModule = (pluginRoot, pluginPath, useTs) => {
  const base = path.resolve(pluginRoot, pluginPath || "");
  if (useTs) {
    return path.join(base, "index.ts");
  }
  const directJs = path.join(base, "index.js");
  if (fs.existsSync(directJs)) return directJs;
  const swapped = base.includes(`${path.sep}src${path.sep}`)
    ? base.replace(`${path.sep}src${path.sep}`, `${path.sep}lib${path.sep}`)
    : base.replace(`${path.sep}src`, `${path.sep}lib`);
  return path.join(swapped, "index.js");
};

const hasBuiltPluginModule = (pluginRoot, pluginPath) => {
  return fs.existsSync(resolvePluginModule(pluginRoot, pluginPath, false));
};

const resolveLocalBaseEntry = (repoRoot, useTs) => {
  const nestedBaseRoot = path.join(repoRoot, "nodejs");
  let baseRoot = null;
  if (fs.existsSync(path.join(nestedBaseRoot, "package.json"))) {
    baseRoot = nestedBaseRoot;
  } else {
    const packageJsonPath = path.join(repoRoot, "package.json");
    if (fs.existsSync(packageJsonPath) && readJson(packageJsonPath).name === "@bsb/base") {
      baseRoot = repoRoot;
    }
  }
  if (!baseRoot) return null;
  const entryTs = path.join(baseRoot, "src", "index.ts");
  const entryJs = path.join(baseRoot, "lib", "index.js");
  if (useTs && fs.existsSync(entryTs)) return entryTs;
  if (!useTs && fs.existsSync(entryJs)) return entryJs;
  return fs.existsSync(entryTs) ? entryTs : entryJs;
};

const resolveInternalModule = (libRelativePath) => {
  const jsPath = path.join(__dirname, "..", "lib", ...libRelativePath);
  if (fs.existsSync(jsPath)) return jsPath;
  const tsRelativePath = [...libRelativePath];
  tsRelativePath[tsRelativePath.length - 1] = tsRelativePath[tsRelativePath.length - 1].replace(/\.js$/, ".ts");
  return path.join(__dirname, "..", "src", ...tsRelativePath);
};

const loadTestsManifest = (manifestDir) => {
  const configPath = path.join(manifestDir, "bsb-tests.json");
  if (!fs.existsSync(configPath)) return null;
  return readJson(configPath);
};

const mergeConfig = (baseConfig, overrideConfig) => {
  return {
    ...(baseConfig || {}),
    ...(overrideConfig || {}),
  };
};

const normalizeSetup = (setupValue) => {
  if (!setupValue) return null;
  if (typeof setupValue === "string") {
    return { beforeAll: setupValue, afterAll: null };
  }
  if (typeof setupValue === "object") {
    return {
      beforeAll: setupValue.beforeAll || null,
      afterAll: setupValue.afterAll || null,
    };
  }
  return null;
};

const normalizeDispose = (disposeValue) => {
  if (!disposeValue) return null;
  if (typeof disposeValue === "string") {
    return { afterAll: disposeValue };
  }
  if (typeof disposeValue === "object") {
    return {
      afterAll: disposeValue.afterAll || null,
    };
  }
  return null;
};

const manifests = findFiles(cwd, "bsb-plugin.json");

if (manifests.length === 0) {
  console.error("No bsb-plugin.json files found in", cwd);
  process.exit(2);
}

const plugins = [];
for (const manifestPath of manifests) {
  const manifestDir = path.dirname(manifestPath);
  const manifest = readJson(manifestPath);
  const testsManifest = loadTestsManifest(manifestDir);
  const testsById = new Map();
  if (testsManifest && Array.isArray(testsManifest.nodejs)) {
    for (const entry of testsManifest.nodejs) {
      if (entry && entry.id) {
        testsById.set(entry.id, entry);
      }
    }
  }
  for (const platform of Object.keys(manifest)) {
    const items = Array.isArray(manifest[platform]) ? manifest[platform] : [];
    for (const plugin of items) {
      if (!plugin || !plugin.id) continue;
      const pluginRoot = path.resolve(manifestDir, plugin.basePath || ".");
      const testsEntry = testsById.get(plugin.id) || null;
      plugins.push({
        platform,
        id: plugin.id,
        name: plugin.name || plugin.id,
        pluginPath: plugin.pluginPath,
        pluginRoot,
        testsEntry,
      });
    }
  }
}

const filtered = pluginFilter
  ? plugins.filter((p) => p.id === pluginFilter || p.name === pluginFilter || p.pluginRoot.endsWith(pluginFilter))
  : plugins;

if (filtered.length === 0) {
  console.error("No plugins matched filter:", pluginFilter);
  process.exit(2);
}

const repoRoot = cwd;
const mochaBin = resolvePackageBin("mocha", "mocha");
const setupHook = resolveInternalModule(["runner", "setup.js"]);
const pluginEventsRunner = resolveInternalModule(["runner", "plugin-events.js"]);
const pluginObservableRunner = resolveInternalModule(["runner", "plugin-observable.js"]);
const pluginCustomRunner = resolveInternalModule(["runner", "plugin-custom.js"]);
const eventsDefaultSpec = resolveInternalModule(["plugins", "events-default", "index.js"]);
const loggingDefaultSpec = resolveInternalModule(["plugins", "logging-default", "index.js"]);
const configDefaultSpec = resolveInternalModule(["plugins", "config-default", "index.js"]);
const observableDefaultSpec = resolveInternalModule(["plugins", "observable-default", "index.js"]);

const runMocha = (env, spec, useTs, coverage, coverageInclude) => {
  const mochaArgs = [];
  const usesTsRunner = setupHook.endsWith(".ts") || spec.endsWith(".ts");
  if (useTs || usesTsRunner) {
    const tsNodeRegister = require.resolve("ts-node/register");
    mochaArgs.push("--require", tsNodeRegister);
  }
  mochaArgs.push("--require", setupHook, spec);

  if (!coverage) {
    const result = spawnSync(process.execPath, [mochaBin, ...mochaArgs], {
      stdio: "inherit",
      env,
    });
    return result.status || 0;
  }

  const nycBin = require.resolve("nyc/bin/nyc.js");
  const nycArgs = [
    "--all",
    "--check-coverage",
    "--lines",
    "100",
    "--functions",
    "100",
    "--branches",
    "100",
    "--statements",
    "100",
    "--extension",
    useTs ? ".ts" : ".js",
    "--reporter",
    "text",
    "--reporter",
    "lcov",
  ];

  if (coverageInclude && coverageInclude.length) {
    for (const inc of coverageInclude) {
      nycArgs.push("--include", inc);
    }
  }

  nycArgs.push(mochaBin, ...mochaArgs);

  const result = spawnSync(process.execPath, [nycBin, ...nycArgs], {
    stdio: "inherit",
    env,
  });
  return result.status || 0;
};

let exitCode = 0;

for (const plugin of filtered) {
  if (plugin.testsEntry && plugin.testsEntry.skip === true) {
    console.warn("Skipping tests for plugin (skipped):", plugin.name);
    continue;
  }

  const useTs = forceTs || (!forceJs && !hasBuiltPluginModule(plugin.pluginRoot, plugin.pluginPath) && fs.existsSync(path.join(plugin.pluginRoot, "src")));
  const pluginModule = resolvePluginModule(plugin.pluginRoot, plugin.pluginPath, useTs);
  if (!fs.existsSync(pluginModule)) {
    console.error("Plugin module not found:", pluginModule);
    exitCode = 2;
    continue;
  }

  const localBaseEntry = resolveLocalBaseEntry(repoRoot, useTs);
  const testsEntry = plugin.testsEntry || {};
  const defaultConfig = testsEntry.default?.config || null;
  const defaultSetup = normalizeSetup(testsEntry.default?.setup || null);
  const defaultDispose = normalizeDispose(testsEntry.default?.dispose || null);
  const testCases = Array.isArray(testsEntry.tests) && testsEntry.tests.length > 0
    ? testsEntry.tests
    : [ { name: "default", config: null, setup: null, dispose: null } ];

  const coverageInclude = useTs
    ? [path.join(plugin.pluginRoot, "src", "**", "*.ts")]
    : [path.join(plugin.pluginRoot, "lib", "**", "*.js")];

  const runSetupScript = (scriptPath, phase) => {
    if (!scriptPath) return 0;
    const resolved = path.resolve(plugin.pluginRoot, scriptPath);
    if (!fs.existsSync(resolved)) {
      console.error(`Setup script not found (${phase}):`, resolved);
      return 2;
    }
    const ext = path.extname(resolved).toLowerCase();
    let result;
    if (ext === ".ts") {
      const tsNodeRegister = require.resolve("ts-node/register");
      result = spawnSync(process.execPath, ["-r", tsNodeRegister, resolved], {
        stdio: "inherit",
        env: {
          ...process.env,
          BSB_TEST_PLUGIN_NAME: plugin.name,
          BSB_TEST_PLUGIN_ID: plugin.id,
        },
      });
    } else if (ext === ".js" || ext === ".cjs" || ext === ".mjs") {
      result = spawnSync(process.execPath, [resolved], {
        stdio: "inherit",
        env: {
          ...process.env,
          BSB_TEST_PLUGIN_NAME: plugin.name,
          BSB_TEST_PLUGIN_ID: plugin.id,
        },
      });
    } else {
      result = spawnSync(resolved, {
        stdio: "inherit",
        shell: true,
        env: {
          ...process.env,
          BSB_TEST_PLUGIN_NAME: plugin.name,
          BSB_TEST_PLUGIN_ID: plugin.id,
        },
      });
    }
    return result.status || 0;
  };

  for (const testCase of testCases) {
    if (testCase && testCase.skip === true) {
      console.warn("Skipping test case (skipped):", testCase.name || "unnamed");
      continue;
    }

    const mergedConfig = mergeConfig(defaultConfig, testCase?.config);
    const setup = normalizeSetup(testCase?.setup) || defaultSetup;
    const dispose = normalizeDispose(testCase?.dispose) || defaultDispose;
    const beforeAll = setup?.beforeAll || null;
    const afterAll = setup?.afterAll || null;

    const env = {
      ...process.env,
      BSB_TEST_PLUGIN_MODULE: pluginModule,
      BSB_TEST_PLUGIN_NAME: plugin.name,
      BSB_TEST_PLUGIN_CONFIG: JSON.stringify(mergedConfig || null),
      BSB_TEST_LOCAL_BASE_ENTRY: localBaseEntry || "",
      TS_NODE_PROJECT: path.join(__dirname, "..", "tsconfig.json"),
    };

    if (beforeAll) {
      const code = runSetupScript(beforeAll, "beforeAll");
      if (code !== 0) {
        exitCode = code;
        continue;
      }
    }

    const isEvents = plugin.id.startsWith("events-") || plugin.name.startsWith("events-");
    if (isEvents) {
      const code = runMocha(env, pluginEventsRunner, useTs, enableCoverage, coverageInclude);
      if (code !== 0) exitCode = code;
    }

    const isObservable = plugin.id.startsWith("observable-") || plugin.name.startsWith("observable-");
    if (isObservable) {
      const code = runMocha(env, pluginObservableRunner, useTs, enableCoverage, coverageInclude);
      if (code !== 0) exitCode = code;
    }

    if (plugin.id === "events-default") {
      const code = runMocha(env, eventsDefaultSpec, useTs, enableCoverage, coverageInclude);
      if (code !== 0) exitCode = code;
    }

    if (plugin.id === "logging-default") {
      const code = runMocha(env, loggingDefaultSpec, useTs, enableCoverage, coverageInclude);
      if (code !== 0) exitCode = code;
    }

    if (plugin.id === "config-default") {
      const code = runMocha(env, configDefaultSpec, useTs, enableCoverage, coverageInclude);
      if (code !== 0) exitCode = code;
    }

    if (plugin.id === "observable-default") {
      const code = runMocha(env, observableDefaultSpec, useTs, enableCoverage, coverageInclude);
      if (code !== 0) exitCode = code;
    }

    const customEnv = {
      ...env,
      BSB_TEST_PLUGIN_ID: plugin.id,
      BSB_TEST_PLUGIN_ROOT: plugin.pluginRoot,
    };
    const customCode = runMocha(customEnv, pluginCustomRunner, useTs, enableCoverage, coverageInclude);
    if (customCode !== 0) exitCode = customCode;

    if (afterAll) {
      const code = runSetupScript(afterAll, "afterAll");
      if (code !== 0) {
        exitCode = code;
      }
    }

    if (dispose?.afterAll) {
      const code = runSetupScript(dispose.afterAll, "dispose");
      if (code !== 0) {
        exitCode = code;
      }
    }
  }
}

process.exit(exitCode);
