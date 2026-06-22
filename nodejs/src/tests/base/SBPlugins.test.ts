import * as assert from "assert";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
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
});
