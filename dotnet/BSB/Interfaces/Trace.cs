namespace BSB.Interfaces;

/// <summary>
/// Distributed trace context - carries traceId and spanId through the system.
/// Compatible with W3C trace context format.
/// TraceId is 32 hex chars, SpanId is 16 hex chars.
/// </summary>
public readonly record struct DTrace(
    [property: System.Text.Json.Serialization.JsonPropertyName("t")] string TraceId,
    [property: System.Text.Json.Serialization.JsonPropertyName("s")] string SpanId)
{
    [System.Text.Json.Serialization.JsonIgnore]
    public bool IsValid => ValidHex(TraceId, 32) && ValidHex(SpanId, 16);
    private static bool ValidHex(string? value, int length) => value?.Length == length &&
        value.Any(c => c != '0') && value.All(c => c is >= '0' and <= '9' or >= 'a' and <= 'f');
    /// <summary>
    /// Generate a new trace with random IDs in OpenTelemetry-compatible format.
    /// </summary>
    public static DTrace Generate()
    {
        Span<byte> traceBytes = stackalloc byte[16];
        Span<byte> spanBytes = stackalloc byte[8];
        System.Security.Cryptography.RandomNumberGenerator.Fill(traceBytes);
        System.Security.Cryptography.RandomNumberGenerator.Fill(spanBytes);
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
        System.Security.Cryptography.RandomNumberGenerator.Fill(spanBytes);
        return new DTrace(TraceId, Convert.ToHexString(spanBytes).ToLowerInvariant());
    }
}
