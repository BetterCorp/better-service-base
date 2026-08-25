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

  it("passes logical plugin names to event backend methods", async () => {
    const calls: Array<{ method: string; pluginName: string; event: string }> = [];
    const events = new SBEvents(
      "test-app",
      "development",
      process.cwd(),
      {} as any,
      MockSBObservable(),
      () => createTestObservable(),
    );
    (events as any).events = [{
      name: "events-rabbitmq",
      plugin: {
        onBroadcast: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "onBroadcast", pluginName, event });
        },
        emitBroadcast: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "emitBroadcast", pluginName, event });
        },
        onEvent: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "onEvent", pluginName, event });
        },
        emitEvent: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "emitEvent", pluginName, event });
        },
        onReturnableEvent: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "onReturnableEvent", pluginName, event });
        },
        emitEventAndReturn: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "emitEventAndReturn", pluginName, event });
          return "ok";
        },
        receiveStream: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "receiveStream", pluginName, event });
          return "stream-id";
        },
        sendStream: async (_obs: unknown, pluginName: string, event: string) => {
          calls.push({ method: "sendStream", pluginName, event });
        },
      },
      on: undefined,
      onTypeof: "all",
    }];
    const trace = createTestObservable().trace;
    const pluginName = "service-bettercontrolroom-receiver";
    const event = "delivery.submit";
    (events as any).metricCounters = new Proxy({}, {
      get: () => ({ increment: () => {} }),
    });
    (events as any).metricGauges = new Proxy({}, {
      get: () => ({ set: () => {} }),
    });

    await events.onEvent(
      trace,
      {} as any,
      pluginName,
      event,
      async () => {},
    );
    await events.emitEvent(trace, pluginName, event);
    await events.onBroadcast({} as any, trace, pluginName, event, async () => {});
    await events.emitBroadcast(trace, pluginName, event);
    await events.onReturnableEvent(trace, {} as any, pluginName, event, async () => {});
    await events.emitEventAndReturn(trace, pluginName, event, 1);
    await events.receiveStream(trace, {} as any, pluginName, event, async () => {});
    await events.sendStream(trace, pluginName, event, "stream-id", {} as any);

    assert.deepStrictEqual(calls, [
      { method: "onEvent", pluginName, event },
      { method: "emitEvent", pluginName, event },
      { method: "onBroadcast", pluginName, event },
      { method: "emitBroadcast", pluginName, event },
      { method: "onReturnableEvent", pluginName, event },
      { method: "emitEventAndReturn", pluginName, event },
      { method: "receiveStream", pluginName, event },
      { method: "sendStream", pluginName, event },
    ]);
  });
});
