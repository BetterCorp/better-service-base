import * as assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SBPlugins } from "../../serviceBase/plugins.js";

describe("SBPlugins", () => {
  const tempDirs: string[] = [];
  const originalPluginDirs = process.env.BSB_PLUGIN_DIRS;
  const originalPluginsDir = process.env.BSB_PLUGINS_DIR;
  const originalPluginDir = process.env.BSB_PLUGIN_DIR;

  afterEach(() => {
    for (const [key, value] of [
      ["BSB_PLUGIN_DIRS", originalPluginDirs],
      ["BSB_PLUGINS_DIR", originalPluginsDir],
      ["BSB_PLUGIN_DIR", originalPluginDir],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("does not create package.json in referenced plugin roots", () => {
    const cwd = mkdtempSync(join(tmpdir(), "bsb-cwd-"));
    const pluginRoot = mkdtempSync(join(tmpdir(), "bsb-plugin-root-"));
    tempDirs.push(cwd, pluginRoot);
    process.env.BSB_PLUGIN_DIRS = pluginRoot;
    delete process.env.BSB_PLUGINS_DIR;
    delete process.env.BSB_PLUGIN_DIR;

    new SBPlugins(cwd, "production");

    assert.strictEqual(existsSync(join(pluginRoot, "package.json")), false);
  });

  it("loads npm plugins from hoisted workspace node_modules real path", async () => {
    const repo = mkdtempSync(join(tmpdir(), "bsb-repo-"));
    tempDirs.push(repo);
    const app = join(repo, "packages", "app");
    const packageRoot = join(repo, "packages", "events-rabbitmq");
    const packageLink = join(repo, "node_modules", "@bsb", "events-rabbitmq");
    const pluginRoot = join(packageRoot, "lib", "plugins", "events-rabbitmq");
    mkdirSync(pluginRoot, { recursive: true });
    mkdirSync(app, { recursive: true });
    mkdirSync(join(repo, "node_modules", "@bsb"), { recursive: true });
    symlinkSync(packageRoot, packageLink, process.platform === "win32" ? "junction" : "dir");
    writeFileSync(join(app, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({
      name: "@bsb/events-rabbitmq",
      version: "2.3.4",
      type: "module",
    }));
    writeFileSync(join(pluginRoot, "index.js"), "export class Plugin {}\n");

    const result = await new SBPlugins(app, "production").loadPlugin(
      { debug() {}, error() {}, info() {} } as any,
      "@bsb/events-rabbitmq",
      "events-rabbitmq",
      "events-rabbitmq",
    );

    assert.strictEqual(result.success, true);
    if (result.success) {
      assert.strictEqual(result.data.packageCwd, realpathSync.native(packageRoot));
      assert.strictEqual(result.data.pluginCwd, join(realpathSync.native(packageRoot), "lib", "plugins", "events-rabbitmq"));
      assert.strictEqual(result.data.version, "2.3.4");
    }
  });

  it("rejects traversal identifiers and plugin-root symlink escapes", async () => {
    const app = mkdtempSync(join(tmpdir(), "bsb-plugin-app-"));
    const outside = mkdtempSync(join(tmpdir(), "bsb-plugin-outside-"));
    tempDirs.push(app, outside);
    mkdirSync(join(app, "lib", "plugins"), { recursive: true });
    writeFileSync(join(app, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(outside, "index.js"), "export class Plugin {}\n");
    symlinkSync(outside, join(app, "lib", "plugins", "escaped"), process.platform === "win32" ? "junction" : "dir");
    const loader = new SBPlugins(app, "production");
    const log = { debug() {}, error() {}, info() {} } as any;

    const traversal = await loader.loadPlugin(log, null, "../outside", "outside");
    assert.strictEqual(traversal.success, false);
    const symlinkEscape = await loader.loadPlugin(log, null, "escaped", "escaped");
    assert.strictEqual(symlinkEscape.success, false);
  });
});
