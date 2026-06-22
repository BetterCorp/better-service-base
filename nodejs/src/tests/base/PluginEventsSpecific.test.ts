import * as assert from "assert";
import { PluginEvents } from "../../base/PluginEvents.js";
import {
  createEventSchemas,
  createFireAndForgetEvent,
  createReturnableEvent,
} from "../../interfaces/schema-events.js";
import { bsb } from "../../interfaces/schema-types.js";
import { createTestObservable } from "../trace.js";

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
});
