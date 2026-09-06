using BSB.Interfaces;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace BSB.Examples;

// ponytail: one in-process lock and JSON snapshots suit the demo's 1,000 items; use a database for multiple writers.
public sealed class TodoStore(string path, bool pretty, int maximum)
{
    private readonly Dictionary<string, JsonObject> _items = new();
    private readonly object _gate = new();
    private readonly SemaphoreSlim _save = new(1);
    private long _generation;
    private long _saved;
    public async Task Load()
    {
        if (!File.Exists(path)) return;
        var items = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsArray();
        var schema = Contracts.Events("service-demo-todo").OnReturnableEvents["todo.create"].Output;
        foreach (var node in items) {
            schema.Parse(node);
            var item = node!.AsObject();
            if (!_items.TryAdd(item["id"]!.GetValue<string>(), item.DeepClone().AsObject())) throw new InvalidDataException("Duplicate todo ID in storage");
        }
        if (_items.Count > maximum) throw new InvalidDataException("Stored todos exceed maxTodos");
    }
    public JsonObject List() { lock (_gate) return new() { ["todos"] = new JsonArray(_items.Values.Select(x => x.DeepClone()).ToArray()), ["total"] = _items.Count }; }
    public JsonObject Stats() {
        lock (_gate) { var completed = _items.Values.Count(x => x["completed"]!.GetValue<bool>());
            return new() { ["total"] = _items.Count, ["completed"] = completed, ["pending"] = _items.Count - completed, ["timestamp"] = DateTimeOffset.UtcNow.ToString("O") }; }
    }
    public JsonObject Get(string id) { lock (_gate) return _items.TryGetValue(id, out var item) ? item.DeepClone().AsObject() : throw new KeyNotFoundException("Todo not found"); }
    public JsonObject Create(JsonObject input)
    {
        lock (_gate) {
            if (_items.Count >= maximum) throw new InvalidOperationException("Maximum todo count reached");
            var item = input.DeepClone().AsObject(); var now = DateTimeOffset.UtcNow.ToString("O");
            item["id"] = Guid.NewGuid().ToString(); item["completed"] = false; item["createdAt"] = now; item["updatedAt"] = now;
            _items.Add(item["id"]!.GetValue<string>(), item); _generation++;
            return item.DeepClone().AsObject();
        }
    }
    public JsonObject Update(JsonObject input)
    {
        lock (_gate) {
            var item = Get(input["id"]!.GetValue<string>());
            foreach (var key in new[] { "title", "description", "completed" }) if (input.ContainsKey(key)) item[key] = input[key]!.DeepClone();
            item["updatedAt"] = DateTimeOffset.UtcNow.ToString("O"); _items[item["id"]!.GetValue<string>()] = item; _generation++;
            return item.DeepClone().AsObject();
        }
    }
    public JsonObject Delete(string id) { lock (_gate) { if (!_items.Remove(id)) throw new KeyNotFoundException("Todo not found"); _generation++; return new() { ["success"] = true }; } }
    public async Task Save()
    {
        await _save.WaitAsync();
        string? temporary = null;
        try {
            string json; long generation;
            lock (_gate) {
                if (_saved == _generation) return;
                generation = _generation;
                json = JsonSerializer.Serialize(_items.Values, new JsonSerializerOptions { WriteIndented = pretty });
            }
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            temporary = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            await File.WriteAllTextAsync(temporary, json);
            File.Move(temporary, path, true);
            lock (_gate) _saved = generation; // Concurrent mutations remain dirty for the next save.
        }
        finally { if (temporary is not null && File.Exists(temporary)) File.Delete(temporary); _save.Release(); }
    }
}
