using System.Diagnostics;

namespace BSB.Interfaces;

/// <summary>
/// A monotonically increasing counter metric instrument.
/// </summary>
public interface ICounter
{
    /// <summary>
    /// Increment the counter by the given value (default 1).
    /// </summary>
    void Increment(double value = 1, Dictionary<string, string>? labels = null);
}

/// <summary>
/// A gauge metric instrument that can go up and down.
/// </summary>
public interface IGauge
{
    /// <summary>
    /// Set the gauge to an absolute value.
    /// </summary>
    void Set(double value, Dictionary<string, string>? labels = null);

    /// <summary>
    /// Increment the gauge by the given value (default 1).
    /// </summary>
    void Increment(double value = 1, Dictionary<string, string>? labels = null);

    /// <summary>
    /// Decrement the gauge by the given value (default 1).
    /// </summary>
    void Decrement(double value = 1, Dictionary<string, string>? labels = null);
}

/// <summary>
/// A histogram metric instrument for recording value distributions.
/// </summary>
public interface IHistogram
{
    /// <summary>
    /// Record a single value observation.
    /// </summary>
    void Record(double value, Dictionary<string, string>? labels = null);
}

/// <summary>
/// A timer that measures elapsed duration and implements IDisposable for using-block patterns.
/// </summary>
public interface ITimer : IDisposable
{
    /// <summary>
    /// Stop the timer and return elapsed milliseconds.
    /// Calling Stop multiple times returns the same value.
    /// </summary>
    double Stop();
}

/// <summary>
/// Default timer implementation using <see cref="Stopwatch"/>.
/// </summary>
public sealed class DefaultTimer : ITimer
{
    private readonly Stopwatch _stopwatch = Stopwatch.StartNew();
    private bool _stopped;

    /// <inheritdoc />
    public double Stop()
    {
        if (!_stopped)
        {
            _stopwatch.Stop();
            _stopped = true;
        }
        return _stopwatch.Elapsed.TotalMilliseconds;
    }

    /// <inheritdoc />
    public void Dispose() => Stop();
}
