import * as assert from "assert";
import * as av from "anyvali";
import { SBEvents } from "../../serviceBase/events.js";
import { MockSBObservable } from "../mocks.js";
import { createTestObservable } from "../trace.js";

describe("SBEvents controller", () => {
  class TestEventsPlugin {
    pluginName: string;
    receivedConfig: unknown;

    constructor(config: any) {
      this.pluginName = config.pluginName;
      this.receivedConfig = config.config;
    }

    init() {}
  }

  async function loadEventsPlugin(pluginConfig: object | null) {
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
          name: "demo-events",
          version: "1.0.0",
          serviceConfig: {
            validationSchema: schema,
          },
          plugin: TestEventsPlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getPluginConfig: async () => pluginConfig,
    } as any;
    const events = new SBEvents(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
      () => createTestObservable(),
    );

    await (events as any).addEvents(
      sbConfig,
      MockSBObservable(),
      {
        name: "demo-events",
        package: null,
        plugin: "events-demo",
        version: "1.0.0",
      },
    );

    return (events as any).events[0].plugin.receivedConfig;
  }

  it("applies AnyVali defaults for missing events plugin config", async () => {
    assert.deepStrictEqual(await loadEventsPlugin(null), {
      host: "0.0.0.0",
      port: 3200,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("applies AnyVali defaults for empty events plugin config", async () => {
    assert.deepStrictEqual(await loadEventsPlugin({}), {
      host: "0.0.0.0",
      port: 3200,
      timeoutMs: 5000,
      nested: {
        mode: "auto",
      },
    });
  });

  it("applies AnyVali defaults around explicit events plugin config", async () => {
    assert.deepStrictEqual(await loadEventsPlugin({
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

  it("passes undefined for events plugin config when plugin has no schema", async () => {
    const sbPlugins = {
      loadPlugin: async () => ({
        success: true,
        data: {
          name: "demo-events",
          version: "1.0.0",
          plugin: TestEventsPlugin,
          packageCwd: process.cwd(),
          pluginCwd: process.cwd(),
        },
      }),
    } as any;
    const sbConfig = {
      getPluginConfig: async () => ({
        raw: true,
      }),
    } as any;
    const events = new SBEvents(
      "test-app",
      "development",
      process.cwd(),
      sbPlugins,
      MockSBObservable(),
      () => createTestObservable(),
    );

    await (events as any).addEvents(
      sbConfig,
      MockSBObservable(),
      {
        name: "demo-events",
        package: null,
        plugin: "events-demo",
        version: "1.0.0",
      },
    );

    assert.strictEqual((events as any).events[0].plugin.receivedConfig, undefined);
  });
});
