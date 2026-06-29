import * as assert from "assert";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SBConfig } from "../../serviceBase/config.js";
import { MockSBObservable } from "../mocks.js";
import { createTestObservable } from "../trace.js";

describe("SBConfig", () => {
  const tempDirs: string[] = [];
  const originalConfigPlugin = process.env.BSB_CONFIG_PLUGIN;
  const originalConfigPackage = process.env.BSB_CONFIG_PLUGIN_PACKAGE;

  afterEach(() => {
    if (originalConfigPlugin === undefined) {
      delete process.env.BSB_CONFIG_PLUGIN;
    } else {
      process.env.BSB_CONFIG_PLUGIN = originalConfigPlugin;
    }
    if (originalConfigPackage === undefined) {
      delete process.env.BSB_CONFIG_PLUGIN_PACKAGE;
    } else {
      process.env.BSB_CONFIG_PLUGIN_PACKAGE = originalConfigPackage;
    }
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("throws when an explicit config plugin cannot be loaded", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bsb-config-load-fail-"));
    tempDirs.push(tempDir);
    process.env.BSB_CONFIG_PLUGIN = "config-vault";
    process.env.BSB_CONFIG_PLUGIN_PACKAGE = "@bsb/config-vault";

    const sbPlugins = {
      loadPlugin: async () => null,
    };
    const sbConfig = new SBConfig(
      "test-app",
      "development",
      tempDir,
      MockSBObservable(),
      sbPlugins as any,
      () => createTestObservable(),
    );

    await assert.rejects(
      () => sbConfig.init(),
      /Failed to import config plugin config-vault from \(@bsb\/config-vault\)/,
    );
  });
});
