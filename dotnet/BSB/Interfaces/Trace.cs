namespace BSB.Interfaces;

/// <summary>
/// Distributed trace context - carries traceId and spanId through the system.
/// Compatible with W3C trace context format.
/// TraceId is 32 hex chars, SpanId is 16 hex chars.
/// </summary>
public readonly record struct DTrace(string TraceId, string SpanId)
{
    /// <summary>
    /// Generate a new trace with random IDs in OpenTelemetry-compatible format.
    /// </summary>
    public static DTrace Generate()
    {
        Span<byte> traceBytes = stackalloc byte[16];
        Span<byte> spanBytes = stackalloc byte[8];
        Random.Shared.NextBytes(traceBytes);
        Random.Shared.NextBytes(spanBytes);
        return new DTrace(
            Convert.ToHexString(traceBytes).ToLowerInvariant(),
            Convert.ToHexString(spanBytes).ToLowerInvariant()
        );
    }

    /// <summary>
    /// Create a new span within the same trace (preserves TraceId, generates new SpanId).
    /// </summary>
    public DTrace NewSpan()
    {
        Span<byte> spanBytes = stackalloc byte[8];
        Random.Shared.NextBytes(spanBytes);
        return new DTrace(TraceId, Convert.ToHexString(spanBytes).ToLowerInvariant());
    }
}
