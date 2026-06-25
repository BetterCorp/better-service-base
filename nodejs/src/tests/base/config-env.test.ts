import * as assert from "assert";
import { Plugin as EnvConfigPlugin } from "../../plugins/config-env/index.js";
import { createTestObservable } from "../trace.js";
import { MockSBObservable } from "../mocks.js";

describe("config-env plugin", () => {
  function createPlugin(config: unknown, profile: string = "default") {
    const plugin = new EnvConfigPlugin({
      appId: "test-app",
      mode: "development",
      cwd: process.cwd(),
      packageCwd: process.cwd(),
      pluginCwd: process.cwd(),
      pluginName: "config-env",
      pluginVersion: "0.0.0",
      config: {
        BSB_PROFILE: profile,
        BSB_CONFIG_JSON: typeof config === "string" ? config : JSON.stringify(config),
      },
      sbObservable: MockSBObservable(),
    });
    const obs = createTestObservable();
    plugin.init(obs);
    return { plugin, obs };
  }

  it("should load observable, events, and services from JSON", async () => {
    const { plugin, obs } = createPlugin({
      default: {
        observable: {
          "observable-default": {
            plugin: "observable-default",
            enabled: true,
            config: { logLevel: "debug" },
          },
        },
        events: {
          "events-default": {
            plugin: "events-default",
            enabled: true,
          },
        },
        services: {
          "demo-service": {
            plugin: "service-demo",
            package: "@demo/service",
            version: "1.2.3",
            enabled: true,
            config: { port: 3200 },
          },
        },
      },
    });

    assert.deepStrictEqual(await plugin.getObservablePlugins(obs), {
      "observable-default": {
        enabled: true,
        filter: undefined,
        package: undefined,
        plugin: "observable-default",
        version: undefined,
      },
    });
    assert.deepStrictEqual(await plugin.getEventsPlugins(obs), {
      "events-default": {
        enabled: true,
        filter: undefined,
        package: undefined,
        plugin: "events-default",
        version: undefined,
      },
    });
    assert.deepStrictEqual(await plugin.getServicePlugins(obs), {
      "demo-service": {
        enabled: true,
        package: "@demo/service",
        plugin: "service-demo",
        version: "1.2.3",
      },
    });
    assert.deepStrictEqual(await plugin.getPluginConfig(obs, "service", "demo-service"), { port: 3200 });
  });

  it("should select a non-default profile", async () => {
    const { plugin, obs } = createPlugin({
      default: {
        services: {
          default: {
            plugin: "service-default",
            enabled: true,
          },
        },
      },
      production: {
        services: {
          api: {
            plugin: "service-api",
            enabled: true,
          },
        },
      },
    }, "production");

    assert.deepStrictEqual(await plugin.getServicePlugins(obs), {
      api: {
        enabled: true,
        package: undefined,
        plugin: "service-api",
        version: undefined,
      },
    });
  });

  it("should tolerate missing observable and events sections", async () => {
    const { plugin, obs } = createPlugin({
      default: {
        services: {
          "demo-service": {
            plugin: "service-demo",
            enabled: true,
          },
        },
      },
    });

    assert.deepStrictEqual(await plugin.getObservablePlugins(obs), {});
    assert.deepStrictEqual(await plugin.getEventsPlugins(obs), {});
  });

  it("should normalize missing plugin config to an empty object", async () => {
    const { plugin, obs } = createPlugin({
      default: {
        services: {
          "demo-service": {
            plugin: "service-demo",
            enabled: true,
          },
        },
      },
    });

    assert.deepStrictEqual(await plugin.getPluginConfig(obs, "service", "demo-service"), {});
  });

  it("should normalize explicit null plugin config to an empty object", async () => {
    const { plugin, obs } = createPlugin({
      default: {
        services: {
          "demo-service": {
            plugin: "service-demo",
            enabled: true,
            config: null,
          },
        },
      },
    });

    assert.deepStrictEqual(await plugin.getPluginConfig(obs, "service", "demo-service"), {});
  });

  it("should throw when JSON is invalid", () => {
    assert.throws(
      () => createPlugin("{nope"),
      /Invalid BSB_CONFIG_JSON/i,
    );
  });

  it("should throw when JSON is not an object", () => {
    assert.throws(
      () => createPlugin("[]"),
      /expected a JSON object/i,
    );
  });

  it("should throw when the selected profile is missing", () => {
    assert.throws(
      () => createPlugin({ default: { services: {} } }, "missing"),
      /unknown deployment profile/i,
    );
  });

  it("should throw when no enabled services are configured", async () => {
    const { plugin, obs } = createPlugin({
      default: {
        observable: {
          "observable-default": {
            plugin: "observable-default",
            enabled: true,
          },
        },
      },
    });

    await assert.rejects(
      () => plugin.getServicePlugins(obs),
      /at least one service is required/i,
    );
  });
});
