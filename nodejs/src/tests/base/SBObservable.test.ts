import * as assert from "assert";
import * as av from "anyvali";
import { SBObservable } from "../../serviceBase/observable.js";

describe("SBObservable", () => {
  class TestObservablePlugin {
    pluginName: string;
    receivedConfig: unknown;

    constructor(config: any) {
      this.pluginName = config.pluginName;
      this.receivedConfig = config.config;
    }
  }

  async function loadObservablePlugin(pluginConfig: object | null) {
    const schema = av.object({
      host: av.string().minLength(1).default("0.0.0.0"),
      port: av.int32().min(1).default(3200),
      timeoutMs: av.int32().default(5000).min(1000),
      nested: av.object({
        mode: av.string().default("auto"),
      }).default({}),
    });
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-observable",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: schema,
          },
          plugin: TestObservablePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "demo-observable": {
          enabled: true,
          plugin: "observable-demo",
          version: "1.0.0",
        },
      }),
      getPluginConfig: async () => pluginConfig,
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    await observable.setupObservablePlugins(sbConfig);

    return (observable as any).observablePlugins[0].plugin.receivedConfig;
  }

  it("applies AnyVali defaults for missing observable plugin config", async () => {
    assert.deepStrictEqual(await loadObservablePlugin(null), {
      host: "0.0.0.0",
      port: 3200,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("applies AnyVali defaults for empty observable plugin config", async () => {
    assert.deepStrictEqual(await loadObservablePlugin({}), {
      host: "0.0.0.0",
      port: 3200,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("applies AnyVali defaults around explicit observable plugin config", async () => {
    assert.deepStrictEqual(await loadObservablePlugin({
      port: 3211,
      nested: {
        extra: true,
      },
      unknown: true,
    }), {
      host: "0.0.0.0",
      port: 3211,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("passes undefined for observable plugin config when plugin has no schema", async () => {
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-observable",
          version: "1.0.0",
          plugin: TestObservablePlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getObservablePlugins: async () => ({
        "demo-observable": {
          enabled: true,
          plugin: "observable-demo",
          version: "1.0.0",
        },
      }),
      getPluginConfig: async () => ({
        raw: true,
      }),
    } as any;
    const observable = new SBObservable(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
    );

    await observable.setupObservablePlugins(sbConfig);

    assert.strictEqual((observable as any).observablePlugins[0].plugin.receivedConfig, undefined);
  });
});
