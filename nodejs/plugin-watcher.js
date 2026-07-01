import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";

const TRUTHY = new Set(["1", "true", "yes", "y"]);
const DEFAULT_INTERVAL_SECONDS = 60 * 60;

function isTruthy(value) {
  return TRUTHY.has(String(value || "").trim().toLowerCase());
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseIntervalSeconds() {
  const raw = process.env.BSB_PLUGIN_WATCH_INTERVAL_SECONDS
    || process.env.BSB_PLUGIN_SYNC_INTERVAL_SECONDS
    || String(DEFAULT_INTERVAL_SECONDS);
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 10) {
    console.warn(`[BSB] Invalid watcher interval "${raw}". Using ${DEFAULT_INTERVAL_SECONDS}s.`);
    return DEFAULT_INTERVAL_SECONDS;
  }
  return parsed;
}

function pluginDirs() {
  const raw = process.env.BSB_PLUGIN_DIRS
    || process.env.BSB_PLUGINS_DIR
    || process.env.BSB_PLUGIN_DIR
    || "/mnt/plugins";
  return raw.split(",").map((d) => d.trim()).filter(Boolean);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

async function ensurePluginDirs(dirs) {
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
  }
}

function fixPermissions(dirs) {
  for (const dir of dirs) {
    run("chown", ["-R", "node:node", dir]);
    run("find", [dir, "-type", "d", "-exec", "chmod", "550", "{}", ";"]);
    run("find", [dir, "-type", "f", "-exec", "chmod", "440", "{}", ";"]);
  }
}

function runSync() {
  const result = spawnSync("node", ["/home/bsb/entrypoint.js"], {
    stdio: "inherit",
    env: {
      ...process.env,
      BSB_PLUGIN_UPDATE: process.env.BSB_PLUGIN_UPDATE || "",
    },
  });
  return result.status === 0;
}

async function main() {
  const dirs = pluginDirs();
  const intervalSeconds = parseIntervalSeconds();
  const runOnce = isTruthy(process.env.BSB_PLUGIN_WATCH_ONCE);

  if (!process.env.BSB_PLUGINS || !String(process.env.BSB_PLUGINS).trim()) {
    throw new Error("BSB_PLUGINS is required for node-watcher mode");
  }

  await ensurePluginDirs(dirs);
  console.log(`[BSB] Plugin watcher dirs: ${dirs.join(", ")}`);
  console.log(`[BSB] Plugin watcher packages: ${process.env.BSB_PLUGINS}`);
  console.log(`[BSB] Plugin watcher interval: ${intervalSeconds}s`);

  while (true) {
    const startedAt = new Date();
    console.log(`[BSB] Plugin watcher sync started at ${startedAt.toISOString()}`);
    const ok = runSync();
    fixPermissions(dirs);

    if (ok) {
      console.log("[BSB] Plugin watcher sync completed");
    } else {
      console.error("[BSB] Plugin watcher sync failed; existing plugin versions remain available");
    }

    if (runOnce) {
      process.exit(ok ? 0 : 1);
    }

    console.log(`[BSB] Plugin watcher sleeping for ${intervalSeconds}s`);
    await sleep(intervalSeconds * 1000);
  }
}

main().catch((error) => {
  console.error("[BSB] Plugin watcher failed:", error && error.stack ? error.stack : error);
  process.exit(1);
});
