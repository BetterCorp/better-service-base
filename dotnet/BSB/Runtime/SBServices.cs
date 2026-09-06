namespace BSB.Runtime;

using BSB.Base;
using BSB.Interfaces;
using System.Reflection;

/// <summary>
/// Services subsystem. Manages service plugin instances and handles
/// dependency-ordered lifecycle (init and run phases) using topological
/// sorting based on plugin metadata ordering hints.
/// </summary>
internal class SBServices : IAsyncDisposable
{
    private readonly List<ServiceEntry> _services = new();

    /// <summary>
    /// Register a service instance with the subsystem.
    /// </summary>
    /// <param name="name">Plugin name.</param>
    /// <param name="instance">The service plugin instance.</param>
    /// <param name="metadata">Optional plugin metadata for dependency ordering.</param>
    public void AddService(string name, MainBase instance, BSBPluginMetadata? metadata)
    {
        _services.Add(new ServiceEntry(name, instance, metadata));
    }

    /// <summary>
    /// Initialize all services in dependency order, respecting
    /// InitBeforePlugins/InitAfterPlugins metadata hints.
    /// </summary>
    /// <param name="observable">Observable subsystem for creating per-plugin observables.</param>
    /// <param name="eventsBackend">Events backend for wiring PluginEvents on services.</param>
    public async Task Init(SBObservable observable, BSBEvents eventsBackend)
    {
        var ordered = TopologicalSort(
            _services,
            e => e.Metadata?.InitAfterPlugins,
            e => e.Metadata?.InitBeforePlugins);

        _services.Clear();
        _services.AddRange(ordered);

        foreach (var entry in ordered)
        {
            var obs = observable.CreateObservable(entry.Name, "init");

            WireEvents(entry.Instance, eventsBackend);
            WireObservable(entry.Instance, observable);

            var initMethod = entry.Instance.GetType().GetMethod("Init", new[] { typeof(IObservable) });
            if (initMethod is not null)
            {
                var result = initMethod.Invoke(entry.Instance, new object[] { obs });
                if (result is Task task)
                    await task;
            }

            obs.End();
        }
    }

    /// <summary>
    /// Run all services in dependency order, respecting
    /// RunBeforePlugins/RunAfterPlugins metadata hints.
    /// </summary>
    /// <param name="observable">Observable subsystem for creating per-plugin observables.</param>
    public async Task Run(SBObservable observable)
    {
        var ordered = TopologicalSort(
            _services,
            e => e.Metadata?.RunAfterPlugins,
            e => e.Metadata?.RunBeforePlugins);

        foreach (var entry in ordered)
        {
            var obs = observable.CreateObservable(entry.Name, "run");

            var runMethod = entry.Instance.GetType().GetMethod("Run", new[] { typeof(IObservable) });
            if (runMethod is not null)
            {
                var result = runMethod.Invoke(entry.Instance, new object[] { obs });
                if (result is Task task)
                    await task;
            }

            obs.End();
        }
    }

    /// <inheritdoc />
    public async ValueTask DisposeAsync()
    {
        GC.SuppressFinalize(this);
        // Dispose in reverse order of registration
        List<Exception> errors = new();
        for (int i = _services.Count - 1; i >= 0; i--)
            try { await _services[i].Instance.DisposeAsync(); } catch (Exception error) { errors.Add(error); }
        if (errors.Count > 0) throw new AggregateException(errors);
    }

    /// <summary>
    /// Wire the PluginEvents property on a service instance to the events backend.
    /// BSBService has: public PluginEvents Events { get; internal set; }
    /// We need to create a PluginEvents for the plugin and set its backend.
    /// </summary>
    private static void WireEvents(MainBase instance, BSBEvents eventsBackend)
    {
        var eventsProperty = instance.GetType().GetProperty("Events",
            BindingFlags.Instance | BindingFlags.Public);

        if (eventsProperty is not null && eventsProperty.PropertyType == typeof(PluginEvents))
        {
            var pluginEvents = eventsProperty.GetValue(instance) as PluginEvents;
            pluginEvents?.SetBackend(eventsBackend);
        }
    }

    /// <summary>
    /// Wire independent root trace creation for background work and HTTP requests.
    /// </summary>
    private static void WireObservable(MainBase instance, SBObservable observable)
    {
        var obsProp = instance.GetType().GetProperty("TraceFactory",
            BindingFlags.Instance | BindingFlags.NonPublic);

        if (obsProp is not null && obsProp.CanWrite)
        {
            Func<string, Dictionary<string, object?>?, IObservable> factory = (name, attributes) =>
                observable.CreateObservable(instance.PluginName, name, attributes: attributes);
            obsProp.SetValue(instance, factory);
        }
    }

    /// <summary>
    /// Topological sort using Kahn's algorithm.
    /// "afterPlugins" means: this plugin must come AFTER those plugins.
    /// "beforePlugins" means: this plugin must come BEFORE those plugins.
    /// </summary>
    private static List<ServiceEntry> TopologicalSort(
        List<ServiceEntry> entries,
        Func<ServiceEntry, string[]?> getAfter,
        Func<ServiceEntry, string[]?> getBefore)
    {
        var nameMap = new Dictionary<string, ServiceEntry>();
        var inDegree = new Dictionary<string, int>();
        var adj = new Dictionary<string, HashSet<string>>();

        foreach (var entry in entries)
        {
            nameMap.Add(entry.Name, entry);
            inDegree[entry.Name] = 0;
            adj[entry.Name] = new HashSet<string>();
        }

        IEnumerable<string> Resolve(string name) => nameMap.ContainsKey(name) ? [name] :
            entries.Where(e => e.Metadata?.Name == name).Select(e => e.Name);
        void Edge(string from, string to)
        {
            if (adj[from].Add(to)) inDegree[to]++;
        }

        foreach (var entry in entries)
        {
            // If A says "after B", then B -> A (B must come before A)
            var after = getAfter(entry);
            if (after is not null)
            {
                foreach (var dep in after)
                {
                    foreach (var name in Resolve(dep)) Edge(name, entry.Name);
                }
            }

            // If A says "before B", then A -> B (A must come before B)
            var before = getBefore(entry);
            if (before is not null)
            {
                foreach (var target in before)
                {
                    foreach (var name in Resolve(target)) Edge(entry.Name, name);
                }
            }
        }

        // Kahn's algorithm
        var queue = new Queue<string>();
        foreach (var (name, degree) in inDegree)
        {
            if (degree == 0)
                queue.Enqueue(name);
        }

        var result = new List<ServiceEntry>();
        var visited = new HashSet<string>();

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!visited.Add(current)) continue;

            result.Add(nameMap[current]);

            foreach (var neighbor in adj[current])
            {
                inDegree[neighbor]--;
                if (inDegree[neighbor] == 0)
                    queue.Enqueue(neighbor);
            }
        }

        if (result.Count != entries.Count)
            throw new InvalidOperationException("Plugin lifecycle dependency cycle: " + string.Join(", ", entries.Where(e => !visited.Contains(e.Name)).Select(e => e.Name)));

        return result;
    }

    private sealed record ServiceEntry(string Name, MainBase Instance, BSBPluginMetadata? Metadata);
}
