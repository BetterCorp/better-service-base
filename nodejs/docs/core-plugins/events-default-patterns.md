# Events-Default Patterns

`events-default` supports all core BSB event patterns in-process.

## Fire-And-Forget

Use for async notifications where no response is needed.

```ts
await this.events.emitEvent(obs, "service-orders", "order.created", [{ id: "o1" }]);
```

## Returnable Events

Use for request/response between plugins.

```ts
const user = await this.events.emitEventAndReturn(
  obs,
  "service-users",
  "user.get",
  10,
  [{ id: "u1" }]
);
```

## Broadcast

Use for fan-out events to all listeners.

```ts
await this.events.emitBroadcast(obs, "service-cache", "cache.flush", []);
```

## Streams

Use for large payloads / continuous transfer.

```ts
const streamId = await this.events.receiveStream(obs, "service-files", "file.stream", async () => {});
```

## Operational Notes

- In-memory only (single process/container boundary).
- No broker durability.
- Replace with distributed event plugins for multi-instance deployments.
