import * as assert from "assert";
import { PluginEvents } from "../../base/PluginEvents.js";
import { BSBService } from "../../base/BSBService.js";
import { ServiceClient } from "../../base/BSBServiceClient.js";
import { createConfigSchema } from "../../base/PluginConfig.js";
import { SBServices } from "../../serviceBase/services.js";
import {
  createBroadcastEvent,
  createEventSchemas,
  createFireAndForgetEvent,
  createReturnableEvent,
  createServiceClientEventSchemas,
} from "../../interfaces/schema-events.js";
import { bsb } from "../../interfaces/schema-types.js";
import { createTestObservable } from "../trace.js";
import { MockSBConfig, MockSBObservable, MockSBEvents, MockSBPlugins } from "../mocks.js";
import * as av from "anyvali";

describe("PluginEvents specific server methods", () => {
  it("passes serverId through to SBEvents specific methods", async () => {
    const calls: unknown[][] = [];
    const events = {
      emitEventSpecific: async (_trace: unknown, serverId: string, pluginName: string, event: string, input: unknown) => {
        calls.push(["emitEventSpecific", serverId, pluginName, event, input]);
      },
      onEventSpecific: async (_trace: unknown, serverId: string, _context: unknown, pluginName: string, event: string) => {
        calls.push(["onEventSpecific", serverId, pluginName, event]);
      },
      emitEventAndReturnSpecific: async (_trace: unknown, serverId: string, pluginName: string, event: string, timeout: number, input: unknown) => {
        calls.push(["emitEventAndReturnSpecific", serverId, pluginName, event, timeout, input]);
        return { ok: true };
      },
      onReturnableEventSpecific: async (_trace: unknown, serverId: string, _context: unknown, pluginName: string, event: string) => {
        calls.push(["onReturnableEventSpecific", serverId, pluginName, event]);
      },
    };
    const schemas = createEventSchemas({
      emitEvents: {
        "source.emit": createFireAndForgetEvent(bsb.object({ value: bsb.string() })),
      },
      onEvents: {
        "source.on": createFireAndForgetEvent(bsb.object({ value: bsb.string() })),
      },
      emitReturnableEvents: {
        "source.ask": createReturnableEvent(bsb.object({ value: bsb.string() }), bsb.object({ ok: bsb.boolean() })),
      },
      onReturnableEvents: {
        "source.answer": createReturnableEvent(bsb.object({ value: bsb.string() }), bsb.object({ ok: bsb.boolean() })),
      },
    });
    const context = { pluginName: "service-source", createObservable: () => createTestObservable() };
    const pluginEvents = new PluginEvents("development", events as any, context as any, schemas);
    const obs = createTestObservable();

    await pluginEvents.emitEventSpecific("source.emit", "server-a", obs, { value: "one" });
    await pluginEvents.onEventSpecific("source.on", "server-b", obs, async () => {});
    await pluginEvents.emitEventAndReturnSpecific("source.ask", "server-c", obs, { value: "two" }, 9);
    await pluginEvents.onReturnableEventSpecific("source.answer", "server-d", obs, async () => ({ ok: true }));

    assert.deepStrictEqual(calls, [
      ["emitEventSpecific", "server-a", "service-source", "source.emit", { value: "one" }],
      ["onEventSpecific", "server-b", "service-source", "source.on"],
      ["emitEventAndReturnSpecific", "server-c", "service-source", "source.ask", 9, { value: "two" }],
      ["onReturnableEventSpecific", "server-d", "service-source", "source.answer"],
    ]);
  });

  it("emits broadcast payloads without wrapping the validated input in an array", async () => {
    let sentInput: unknown;
    const events = {
      emitBroadcast: async (_trace: unknown, _pluginName: string, _event: string, input: unknown) => {
        sentInput = input;
      },
    };
    const schemas = createEventSchemas({
      emitBroadcast: {
        "source.broadcast": createBroadcastEvent(bsb.object({ value: bsb.string() })),
      },
    });
    const pluginEvents = new PluginEvents(
      "development",
      events as any,
      { pluginName: "service-source", createObservable: () => createTestObservable() } as any,
      schemas,
    );

    await pluginEvents.emitBroadcast("source.broadcast", createTestObservable(), { value: "one" });

    assert.deepStrictEqual(sentInput, { value: "one" });
  });

  it("rejects invalid outbound event data before publishing", async () => {
    let published = false;
    const events = {
      emitEvent: async () => {
        published = true;
      },
    };
    const schemas = createEventSchemas({
      emitEvents: {
        "source.emit": createFireAndForgetEvent(bsb.object({ value: bsb.string() })),
      },
    });
    const pluginEvents = new PluginEvents(
      "development",
      events as any,
      { pluginName: "service-source", createObservable: () => createTestObservable() } as any,
      schemas,
    );

    await assert.rejects(
      () => pluginEvents.emitEvent("source.emit", createTestObservable(), { value: 123 } as any)
    );
    assert.strictEqual(published, false);
  });

  it("rejects invalid inbound event data before calling handlers", async () => {
    let handled = false;
    const events = {
      onEvent: async (_trace: unknown, _context: unknown, _pluginName: string, _event: string, listener: Function) => {
        await listener(createTestObservable().trace, { value: 123 });
      },
    };
    const schemas = createEventSchemas({
      onEvents: {
        "source.on": createFireAndForgetEvent(bsb.object({ value: bsb.string() })),
      },
    });
    const pluginEvents = new PluginEvents(
      "development",
      events as any,
      { pluginName: "service-source", createObservable: () => createTestObservable() } as any,
      schemas,
    );

    await assert.rejects(
      () => pluginEvents.onEvent("source.on", createTestObservable(), async () => {
        handled = true;
      })
    );
    assert.strictEqual(handled, false);
  });

  it("flips service client event schema directions at runtime", () => {
    const schemas = createEventSchemas({
      emitEvents: {
        "target.emitted": createFireAndForgetEvent(bsb.string()),
      },
      onEvents: {
        "target.handled": createFireAndForgetEvent(bsb.string()),
      },
      emitBroadcast: {
        "target.broadcasted": createBroadcastEvent(bsb.string()),
      },
      onBroadcast: {
        "target.broadcast.listen": createBroadcastEvent(bsb.string()),
      },
      emitReturnableEvents: {
        "target.ask": createReturnableEvent(bsb.string(), bsb.boolean()),
      },
      onReturnableEvents: {
        "target.answer": createReturnableEvent(bsb.string(), bsb.boolean()),
      },
    });
    class TargetRef {
      static PLUGIN_CLIENT = { name: "service-target" };
      static EventSchemas = schemas;
    }

    const client = new ServiceClient<any, typeof schemas, typeof TargetRef>(
      TargetRef,
      { _clients: [] } as any,
    );

    assert.deepStrictEqual((client as any).__clientEventSchemas, createServiceClientEventSchemas(schemas));
  });

  it("wires generated-client schemas into setupPluginClient validation", async () => {
    const schemas = createEventSchemas({
      onEvents: {
        "target.handled": createFireAndForgetEvent(bsb.object({ value: bsb.string() })),
      },
    });
    class TargetRef {
      static PLUGIN_CLIENT = { name: "service-target" };
      static EventSchemas = schemas;
    }
    const context = { pluginName: "service-source", _clients: [] } as any;
    const client = new ServiceClient<any, typeof schemas, typeof TargetRef>(TargetRef, context);
    let published = false;
    const sbEvents = {
      ...MockSBEvents(),
      emitEvent: async () => {
        published = true;
      },
    };
    const services = new SBServices(
      "test-app",
      "development",
      process.cwd(),
      MockSBPlugins(),
      MockSBObservable(),
    );

    await (services as any).setupPluginClient(
      MockSBConfig(),
      MockSBObservable(),
      sbEvents,
      context,
      client,
    );

    await assert.rejects(
      () => client.events.emitEvent("target.handled", createTestObservable(), { value: 123 } as any)
    );
    assert.strictEqual(published, false);
  });

  it("uses flipped validation for self-clients and registers them once", async () => {
    const Config = createConfigSchema(
      { name: "service-self", description: "self test" },
      av.optional(av.object({}, { unknownKeys: "strip" })).default({}),
    );
    const schemas = createEventSchemas({
      onReturnableEvents: {
        "self.answer": createReturnableEvent(
          bsb.object({ signalId: bsb.string() }),
          bsb.object({ ok: bsb.boolean() }),
        ),
      },
    });
    class SelfPlugin extends BSBService<InstanceType<typeof Config>, typeof schemas> {
      static Config = Config;
      static EventSchemas = schemas;
      public initBeforePlugins?: string[] | undefined;
      public initAfterPlugins?: string[] | undefined;
      public runBeforePlugins?: string[] | undefined;
      public runAfterPlugins?: string[] | undefined;
      public self() {
        return this.createSelf();
      }
    }
    let calls = 0;
    const sbEvents = {
      ...MockSBEvents(),
      emitEventAndReturn: async () => {
        calls++;
        return { ok: true };
      },
    };
    const service = new SelfPlugin({
      appId: "test-app",
      mode: "development",
      pluginName: "service-self",
      cwd: process.cwd(),
      packageCwd: process.cwd(),
      pluginCwd: process.cwd(),
      pluginVersion: "0.0.0",
      config: {},
      sbObservable: MockSBObservable(),
      sbEvents,
      eventSchemas: schemas,
    });

    const self = service.self();

    assert.strictEqual(service._clients.length, 1);
    await assert.rejects(
      () => self.events.emitEventAndReturn("self.answer", createTestObservable(), { signalId: 123 } as any)
    );
    assert.strictEqual(calls, 0);
    assert.deepStrictEqual(
      await self.events.emitEventAndReturn("self.answer", createTestObservable(), { signalId: "abc" }),
      { ok: true },
    );
    assert.strictEqual(calls, 1);
  });
});
