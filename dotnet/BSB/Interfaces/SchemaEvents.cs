using System.Text.Json.Nodes;

namespace BSB.Interfaces;

/// <summary>
/// Schema for a fire-and-forget event (emitter sends, first listener handles, no return value).
/// </summary>
/// <param name="Input">Schema for the event payload.</param>
/// <param name="Description">Optional human-readable description of the event.</param>
public record FireAndForgetEventSchema(BSBType Input, string? Description = null);

/// <summary>
/// Schema for a returnable event (request-response pattern with timeout).
/// </summary>
/// <param name="Input">Schema for the request payload.</param>
/// <param name="Output">Schema for the response payload.</param>
/// <param name="DefaultTimeoutSeconds">Default timeout in seconds before the call is considered failed.</param>
/// <param name="Description">Optional human-readable description of the event.</param>
public record ReturnableEventSchema(BSBType Input, BSBType Output, int DefaultTimeoutSeconds = 30, string? Description = null);

/// <summary>
/// Schema for a broadcast event (emitter sends to ALL listeners, no return value).
/// </summary>
/// <param name="Input">Schema for the broadcast payload.</param>
/// <param name="Description">Optional human-readable description of the event.</param>
public record BroadcastEventSchema(BSBType Input, string? Description = null);

/// <summary>
/// Complete event schema definition for a plugin.
/// Defines all events the plugin emits and listens to, organized by event type.
/// </summary>
public class BSBEventSchemas
{
    /// <summary>
    /// Fire-and-forget events this plugin emits.
    /// </summary>
    public Dictionary<string, FireAndForgetEventSchema> EmitEvents { get; init; } = new();

    /// <summary>
    /// Fire-and-forget events this plugin listens to.
    /// </summary>
    public Dictionary<string, FireAndForgetEventSchema> OnEvents { get; init; } = new();

    /// <summary>
    /// Returnable events this plugin emits (request side).
    /// </summary>
    public Dictionary<string, ReturnableEventSchema> EmitReturnableEvents { get; init; } = new();

    /// <summary>
    /// Returnable events this plugin handles (response side).
    /// </summary>
    public Dictionary<string, ReturnableEventSchema> OnReturnableEvents { get; init; } = new();

    /// <summary>
    /// Broadcast events this plugin emits.
    /// </summary>
    public Dictionary<string, BroadcastEventSchema> EmitBroadcast { get; init; } = new();

    /// <summary>
    /// Broadcast events this plugin listens to.
    /// </summary>
    public Dictionary<string, BroadcastEventSchema> OnBroadcast { get; init; } = new();
}

/// <summary>
/// Static helpers for creating event schemas.
/// </summary>
public static class EventSchemaBuilder
{
    /// <summary>
    /// Create a fire-and-forget event schema.
    /// </summary>
    public static FireAndForgetEventSchema CreateFireAndForgetEvent(BSBType input, string? description = null)
        => new(input, description);

    /// <summary>
    /// Create a returnable (request-response) event schema.
    /// </summary>
    public static ReturnableEventSchema CreateReturnableEvent(BSBType input, BSBType output, string? description = null, int defaultTimeout = 30)
        => new(input, output, defaultTimeout, description);

    /// <summary>
    /// Create a broadcast event schema.
    /// </summary>
    public static BroadcastEventSchema CreateBroadcastEvent(BSBType input, string? description = null)
        => new(input, description);

    /// <summary>
    /// Create a complete event schema definition for a plugin.
    /// Pass null for any category that the plugin does not use.
    /// </summary>
    public static BSBEventSchemas CreateEventSchemas(
        Dictionary<string, FireAndForgetEventSchema>? emitEvents = null,
        Dictionary<string, FireAndForgetEventSchema>? onEvents = null,
        Dictionary<string, ReturnableEventSchema>? emitReturnableEvents = null,
        Dictionary<string, ReturnableEventSchema>? onReturnableEvents = null,
        Dictionary<string, BroadcastEventSchema>? emitBroadcast = null,
        Dictionary<string, BroadcastEventSchema>? onBroadcast = null)
    {
        return new BSBEventSchemas
        {
            EmitEvents = emitEvents ?? new(),
            OnEvents = onEvents ?? new(),
            EmitReturnableEvents = emitReturnableEvents ?? new(),
            OnReturnableEvents = onReturnableEvents ?? new(),
            EmitBroadcast = emitBroadcast ?? new(),
            OnBroadcast = onBroadcast ?? new(),
        };
    }
}

/// <summary>
/// Exported event schema for cross-language use (JSON Schema format).
/// Used by the registry and client generation tools.
/// </summary>
public class EventSchemaExport
{
    /// <summary>
    /// Name of the plugin that defines these events.
    /// </summary>
    public required string PluginName { get; init; }

    /// <summary>
    /// Version of the plugin.
    /// </summary>
    public required string Version { get; init; }

    /// <summary>
    /// Map of event name to exported event definition.
    /// </summary>
    public Dictionary<string, ExportedEvent> Events { get; init; } = new();
}

/// <summary>
/// A single exported event definition in JSON Schema format.
/// </summary>
public class ExportedEvent
{
    /// <summary>
    /// Event type: "fire-and-forget", "returnable", or "broadcast".
    /// </summary>
    public required string Type { get; init; }

    /// <summary>
    /// JSON Schema for the event input/request payload.
    /// </summary>
    public JsonObject? InputSchema { get; init; }

    /// <summary>
    /// JSON Schema for the event output/response payload (returnable events only).
    /// </summary>
    public JsonObject? OutputSchema { get; init; }

    /// <summary>
    /// Human-readable description of the event.
    /// </summary>
    public string? Description { get; init; }

    /// <summary>
    /// Default timeout in seconds (returnable events only).
    /// </summary>
    public int? DefaultTimeoutSeconds { get; init; }
}
