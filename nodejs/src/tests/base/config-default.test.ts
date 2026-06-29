import * as assert from "assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Plugin as DefaultConfigPlugin } from "../../plugins/config-default/index.js";
import { createTestObservable } from "../trace.js";
import { MockSBObservable } from "../mocks.js";

describe("config-default plugin", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  function createPlugin(configYaml: string, profile: string = "default") {
    const tempDir = mkdtempSync(join(tmpdir(), "bsb-config-default-"));
    const configPath = join(tempDir, "sec-config.yaml");
    tempDirs.push(tempDir);
    writeFileSync(configPath, configYaml, "utf8");

    const plugin = new DefaultConfigPlugin({
      appId: "test-app",
      mode: "development",
      cwd: tempDir,
      packageCwd: tempDir,
      pluginCwd: tempDir,
      pluginName: "config-default",
      pluginVersion: "0.0.0",
      config: {
        BSB_PROFILE: profile,
        BSB_CONFIG_FILE: configPath,
      },
      sbObservable: MockSBObservable(),
    });
    const obs = createTestObservable();
    plugin.init(obs);
    return { plugin, obs };
  }

  it("should tolerate missing observable and events sections", async () => {
    const { plugin, obs } = createPlugin(`
default:
  services:
    demo-service:
      plugin: service-demo
      enabled: true
`);

    const observablePlugins = await plugin.getObservablePlugins(obs);
    const eventPlugins = await plugin.getEventsPlugins(obs);
    const servicePlugins = await plugin.getServicePlugins(obs);

    assert.deepStrictEqual(observablePlugins, {});
    assert.deepStrictEqual(eventPlugins, {});
    assert.deepStrictEqual(servicePlugins, {
      "demo-service": {
        enabled: true,
        package: undefined,
        plugin: "service-demo",
        version: undefined,
      },
    });
  });

  it("should normalize missing plugin config to an empty object", async () => {
    const { plugin, obs } = createPlugin(`
default:
  services:
    demo-service:
      plugin: service-demo
      enabled: true
`);

    const config = await plugin.getPluginConfig(obs, "service", "demo-service");
    assert.deepStrictEqual(config, {});
  });

  it("should normalize explicit null plugin config to an empty object", async () => {
    const { plugin, obs } = createPlugin(`
default:
  services:
    demo-service:
      plugin: service-demo
      enabled: true
      config: null
`);

    const config = await plugin.getPluginConfig(obs, "service", "demo-service");
    assert.deepStrictEqual(config, {});
  });

  it("should throw when no enabled services are configured", async () => {
    const { plugin, obs } = createPlugin(`
default:
  observable:
    observable-default:
      plugin: observable-default
      enabled: true
`);

    await assert.rejects(
      () => plugin.getServicePlugins(obs),
      /at least one service is required/i,
    );
  });

  it("should throw when all configured services are disabled", async () => {
    const { plugin, obs } = createPlugin(`
default:
  services:
    demo-service:
      plugin: service-demo
      enabled: false
`);

    await assert.rejects(
      () => plugin.getServicePlugins(obs),
      /at least one service is required/i,
    );
  });

  it("should throw a clear error when accessed before init", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bsb-config-default-uninit-"));
    tempDirs.push(tempDir);
    const plugin = new DefaultConfigPlugin({
      appId: "test-app",
      mode: "development",
      cwd: tempDir,
      packageCwd: tempDir,
      pluginCwd: tempDir,
      pluginName: "config-default",
      pluginVersion: "0.0.0",
      config: {
        BSB_PROFILE: "default",
        BSB_CONFIG_FILE: join(tempDir, "sec-config.yaml"),
      },
      sbObservable: MockSBObservable(),
    });

    await assert.rejects(
      () => plugin.getObservablePlugins(createTestObservable()),
      /has not been initialized/i,
    );
  });
});
