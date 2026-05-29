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
        for (int i = _services.Count - 1; i >= 0; i--)
            await _services[i].Instance.DisposeAsync();
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
    /// Wire the InternalObservable property on a service instance so that
    /// CreateTrace works at runtime.
    /// BSBService has: internal IObservable? InternalObservable { get; set; }
    /// </summary>
    private static void WireObservable(MainBase instance, SBObservable observable)
    {
        var obsProp = instance.GetType().GetProperty("InternalObservable",
            BindingFlags.Instance | BindingFlags.NonPublic);

        if (obsProp is not null && obsProp.CanWrite)
        {
            var obs = observable.CreateObservable(instance.PluginName, "trace-root");
            obsProp.SetValue(instance, obs);
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
        if (entries.Count <= 1)
            return new List<ServiceEntry>(entries);

        var nameMap = new Dictionary<string, ServiceEntry>();
        var inDegree = new Dictionary<string, int>();
        var adj = new Dictionary<string, List<string>>();

        foreach (var entry in entries)
        {
            nameMap[entry.Name] = entry;
            inDegree[entry.Name] = 0;
            adj[entry.Name] = new List<string>();
        }

        foreach (var entry in entries)
        {
            // If A says "after B", then B -> A (B must come before A)
            var after = getAfter(entry);
            if (after is not null)
            {
                foreach (var dep in after)
                {
                    if (adj.ContainsKey(dep))
                    {
                        adj[dep].Add(entry.Name);
                        inDegree[entry.Name]++;
                    }
                }
            }

            // If A says "before B", then A -> B (A must come before B)
            var before = getBefore(entry);
            if (before is not null)
            {
                foreach (var target in before)
                {
                    if (adj.ContainsKey(entry.Name) && inDegree.ContainsKey(target))
                    {
                        adj[entry.Name].Add(target);
                        inDegree[target]++;
                    }
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

        // Append any remaining entries (cycle or unresolved) in original order
        foreach (var entry in entries)
        {
            if (!visited.Contains(entry.Name))
                result.Add(entry);
        }

        return result;
    }

    private sealed record ServiceEntry(string Name, MainBase Instance, BSBPluginMetadata? Metadata);
}
