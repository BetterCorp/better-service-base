namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;

/// <summary>
/// Observable subsystem. Manages observable plugin instances and provides the
/// <see cref="ObservableBackend"/> factory for creating <see cref="IObservable"/>
/// instances scoped to specific plugins and spans.
/// </summary>
internal class SBObservable : IAsyncDisposable
{
    private readonly List<IObservablePlugin> _observers = new();
    private readonly List<MainBase> _instances = new(); // for lifecycle management
    private ResourceContext _resource = new();

    /// <summary>
    /// Set the resource context that identifies this service instance.
    /// </summary>
    public void SetResource(ResourceContext resource) => _resource = resource;

    /// <summary>
    /// Add an observable plugin to the dispatch list. If the plugin is a MainBase
    /// instance, it will also be tracked for lifecycle management (init/dispose).
    /// </summary>
    public void AddObserver(IObservablePlugin observer)
    {
        _observers.Add(observer);
        if (observer is MainBase mb)
            _instances.Add(mb);
    }

    /// <summary>
    /// Remove an observable plugin from the dispatch list (e.g. bootstrap observer).
    /// </summary>
    public void RemoveObserver(IObservablePlugin observer)
    {
        _observers.Remove(observer);
        if (observer is MainBase mb)
            _instances.Remove(mb);
    }

    /// <summary>
    /// Create an <see cref="IObservable"/> instance for the given plugin and span.
    /// </summary>
    /// <param name="pluginName">Name of the plugin creating this observable.</param>
    /// <param name="spanName">Human-readable name for the span.</param>
    /// <param name="trace">Optional trace context. A new trace is generated if null.</param>
    /// <param name="attributes">Optional initial span attributes.</param>
    /// <returns>A new observable for logging, metrics, and tracing.</returns>
    public IObservable CreateObservable(
        string pluginName,
        string spanName,
        DTrace? trace = null,
        Dictionary<string, object?>? attributes = null)
    {
        return new ObservableBackend(pluginName, spanName, _resource, _observers, trace, attributes);
    }

    /// <summary>
    /// Initialize all observable plugin instances. Uses reflection to call Init
    /// since BSBObservable&lt;TConfig&gt; may have different TConfig types.
    /// </summary>
    public async Task Init(IObservable obs)
    {
        var seen = new HashSet<object>(ReferenceEqualityComparer.Instance);
        foreach (var instance in _instances)
        {
            if (!seen.Add(instance)) continue;

            var initMethod = instance.GetType().GetMethod("Init", new[] { typeof(IObservable) });
            if (initMethod is not null)
            {
                var result = initMethod.Invoke(instance, new object[] { obs });
                if (result is Task task)
                    await task;
            }
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        foreach (var instance in _instances)
            await instance.DisposeAsync();
    }
}
