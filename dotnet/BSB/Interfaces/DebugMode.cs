namespace BSB.Interfaces;

/// <summary>
/// Runtime debug mode for the service.
/// </summary>
public enum DebugMode
{
    /// <summary>
    /// Full debug output, verbose logging, development-only features enabled.
    /// </summary>
    Development,

    /// <summary>
    /// Production runtime with additional debug diagnostics enabled.
    /// </summary>
    ProductionDebug,

    /// <summary>
    /// Production runtime with minimal overhead.
    /// </summary>
    Production
}
