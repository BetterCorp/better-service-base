namespace BSB.Base;

using BSB.Interfaces;

/// <summary>
/// BSB-specific error with trace context and structured metadata.
/// Carries the distributed trace, originating plugin name, and arbitrary
/// key-value metadata so that error handlers can route and enrich
/// diagnostics without losing context.
/// </summary>
public class BSBError : Exception
{
    /// <summary>
    /// The distributed trace active when the error occurred.
    /// </summary>
    public DTrace? Trace { get; }

    /// <summary>
    /// Name of the plugin that raised the error.
    /// </summary>
    public string? PluginName { get; }

    /// <summary>
    /// Arbitrary structured metadata attached to the error.
    /// </summary>
    public Dictionary<string, object?> Metadata { get; }

    /// <summary>
    /// Create a new BSBError.
    /// </summary>
    /// <param name="message">Human-readable error description.</param>
    /// <param name="trace">Distributed trace context, if available.</param>
    /// <param name="pluginName">Originating plugin name.</param>
    /// <param name="metadata">Additional key-value metadata.</param>
    /// <param name="innerException">Underlying exception, if any.</param>
    public BSBError(
        string message,
        DTrace? trace = null,
        string? pluginName = null,
        Dictionary<string, object?>? metadata = null,
        Exception? innerException = null)
        : base(message, innerException)
    {
        Trace = trace;
        PluginName = pluginName;
        Metadata = metadata ?? new();
    }
}
