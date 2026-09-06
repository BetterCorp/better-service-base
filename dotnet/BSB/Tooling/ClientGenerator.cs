using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using BSB.Interfaces;

namespace BSB.Tooling;

/// <summary>Produces native clients for any registry service, independently of its implementation language.</summary>
public static class ClientGenerator
{
    public static string Identifier(string name)
    {
        var words = Regex.Split(name, "[^A-Za-z0-9]+").Where(x => x.Length > 0);
        var result = string.Concat(words.Select(x => char.ToUpperInvariant(x[0]) + x[1..]));
        return result.Length == 0 ? "Generated" : char.IsDigit(result[0]) ? "_" + result : result;
    }
    private static string Quote(string value) => JsonSerializer.Serialize(value);

    public static string Generate(EventSchemaExport export, string localName)
    {
        BSBEventSchemas.Import(export); // Reject invalid schemas before producing source.
        var name = Identifier(localName) + "Client";
        var declarations = new StringBuilder();
        var methods = new StringBuilder();
        var used = new HashSet<string>(StringComparer.Ordinal) { name, "Events", "Schema", "Convert" };
        var typeNames = new HashSet<string>(StringComparer.Ordinal) { name };

        string Shape(JsonObject document, string hint)
        {
            var definitions = document["definitions"]?.AsObject() ?? new();
            var references = definitions.Select((p, index) => (p.Key, Name: hint + "Definition" + index)).ToDictionary(p => p.Key, p => p.Name);
            var emitted = new HashSet<string>();
            string Type(JsonNode node, string suggested)
            {
                var kind = node["kind"]?.GetValue<string>();
                switch (kind)
                {
                    case "string": return "string";
                    case "bool": return "bool";
                    case "int8": return "sbyte";
                    case "uint8": return "byte";
                    case "int16": return "short";
                    case "uint16": return "ushort";
                    case "int32": return "int";
                    case "uint32": return "uint";
                    case "int64": return "long";
                    case "uint64": return "ulong";
                    case "float32": return "float";
                    case "int": case "number": case "float64": return "double";
                    case "null": case "any": case "unknown": case "never": return "JsonElement";
                    case "literal": return node["value"]?.GetValueKind() switch { JsonValueKind.String => "string", JsonValueKind.True or JsonValueKind.False => "bool", JsonValueKind.Number => "double", _ => "JsonElement" };
                    case "nullable": case "optional":
                        var inner = Type(node["inner"]!, suggested);
                        return inner.EndsWith('?') ? inner : inner + "?";
                    case "array": return $"List<{Type(node["items"]!, suggested + "Item")}>";
                    case "record": return $"Dictionary<string, {Type(node["valueSchema"] ?? node["values"]!, suggested + "Value")}>";
                    case "ref":
                        var referenceKey = node["ref"]!.GetValue<string>();
                        if (!references.TryGetValue(referenceKey, out var reference)) throw new JsonException($"Unknown schema definition: {referenceKey}");
                        if (emitted.Add(referenceKey))
                        {
                            references[referenceKey] = Type(definitions[referenceKey]!, reference);
                        }
                        else if (references[referenceKey] == reference && !typeNames.Contains(reference))
                            throw new JsonException($"Recursive schema alias must resolve through a named object: {referenceKey}");
                        return references[referenceKey];
                    case "enum":
                        if (node["values"]!.AsArray().Any(x => x?.GetValueKind() != JsonValueKind.String)) return "JsonElement";
                        if (!typeNames.Add(suggested)) throw new JsonException($"Generated type collision: {suggested}");
                        declarations.AppendLine($"[JsonConverter(typeof(JsonStringEnumConverter<{suggested}>))]\npublic enum {suggested}\n{{");
                        var values = new HashSet<string>();
                        foreach (var value in node["values"]!.AsArray())
                        {
                            var text = value!.GetValue<string>(); var member = Identifier(text);
                            if (!values.Add(member)) throw new JsonException($"Generated enum collision: {text}");
                            declarations.AppendLine($"    [JsonStringEnumMemberName({Quote(text)})] {member},");
                        }
                        declarations.AppendLine("}");
                        return suggested;
                    case "object":
                        if (!typeNames.Add(suggested)) throw new JsonException($"Generated type collision: {suggested}");
                        var properties = new StringBuilder();
                        var propertyNames = new HashSet<string> { suggested };
                        var required = node["required"]?.AsArray().Select(x => x!.GetValue<string>()).ToHashSet() ?? new();
                        foreach (var (key, value) in node["properties"]!.AsObject())
                        {
                            var property = Identifier(key);
                            if (!propertyNames.Add(property)) throw new JsonException($"Generated property collision: {key}");
                            var optional = !required.Contains(key) || value!["kind"]!.GetValue<string>() == "optional";
                            var propertyNode = value!;
                            while (propertyNode["kind"]?.GetValue<string>() == "optional") propertyNode = propertyNode["inner"]!;
                            var propertyType = Type(propertyNode, suggested + property);
                            if (optional) propertyType = $"OptionalValue<{propertyType}>";
                            properties.AppendLine($"    [JsonPropertyName({Quote(key)})]");
                            if (optional) properties.AppendLine("    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]");
                            properties.AppendLine($"    public {(optional ? "" : "required ")}{propertyType} {property} {{ get; init; }}");
                        }
                        if (node["unknownKeys"]?.GetValue<string>() == "passthrough")
                            properties.AppendLine("    [JsonExtensionData] public Dictionary<string, JsonElement>? AdditionalProperties { get; init; }");
                        declarations.AppendLine($"public sealed record {suggested}\n{{\n{properties}}}");
                        return suggested;
                    case "union": case "intersection": case "tuple":
                        // C# has no general structural union/intersection type. The complete schema still validates this JSON value.
                        return "JsonElement";
                    default: throw new JsonException($"Unsupported schema kind: {kind}");
                }
            }
            return Type(document["root"]!, hint);
        }

        foreach (var (eventName, definition) in export.Events)
        {
            var method = Identifier(eventName);
            var listens = definition.Category.StartsWith("emit", StringComparison.Ordinal);
            if (listens) method = "On" + method;
            if (!used.Add(method)) throw new JsonException($"Generated method collision: {eventName}");
            var input = Shape(definition.InputSchema!, name + method + "Input");
            var output = definition.OutputSchema is null ? "object?" : Shape(definition.OutputSchema, name + method + "Output");
            var key = Quote(eventName);
            var timeout = definition.DefaultTimeoutSeconds ?? 5;
            if (listens)
            {
                var operation = definition.Type switch { "returnable" => "OnReturnableEvent", "broadcast" => "OnBroadcast", _ => "OnEvent" };
                var result = definition.Type == "returnable" ? $"Task<{output}>" : "Task";
                var lambda = definition.Type == "returnable" ? $"async (trace, value) => (object?)await handler(trace, Convert<{input}>(value))" : $"(trace, value) => handler(trace, Convert<{input}>(value))";
                methods.AppendLine($"    public Task {method}(IObservable obs, Func<IObservable, {input}, {result}> handler) => _events.{operation}({key}, obs, {lambda});");
                if (definition.Type != "broadcast")
                {
                    if (!used.Add(method + "Specific")) throw new JsonException($"Generated method collision: {eventName}Specific");
                    methods.AppendLine($"    public Task {method}Specific(string serverId, IObservable obs, Func<IObservable, {input}, {result}> handler) => _events.{operation}Specific(serverId, {key}, obs, {lambda});");
                }
            }
            else if (definition.Type == "returnable")
            {
                methods.AppendLine($"    public async Task<{output}> {method}(IObservable obs, {input} input, int timeoutSeconds = {timeout}) => Convert<{output}>(await _events.EmitEventAndReturn({key}, obs, input, timeoutSeconds));");
                if (!used.Add(method + "Specific")) throw new JsonException($"Generated method collision: {eventName}Specific");
                methods.AppendLine($"    public async Task<{output}> {method}Specific(string serverId, IObservable obs, {input} input, int timeoutSeconds = {timeout}) => Convert<{output}>(await _events.EmitEventAndReturnSpecific(serverId, {key}, obs, input, timeoutSeconds));");
            }
            else
            {
                methods.AppendLine($"    public Task {method}(IObservable obs, {input} input) => _events.{(definition.Type == "broadcast" ? "EmitBroadcast" : "EmitEvent")}({key}, obs, input);");
                if (definition.Type != "broadcast")
                {
                    if (!used.Add(method + "Specific")) throw new JsonException($"Generated method collision: {eventName}Specific");
                    methods.AppendLine($"    public Task {method}Specific(string serverId, IObservable obs, {input} input) => _events.EmitEventSpecific(serverId, {key}, obs, input);");
                }
            }
        }
        return $$"""
        // Generated by BSB. Regenerate from the saved registry schema.
        #nullable enable
        using System;
        using System.Collections.Generic;
        using System.Threading.Tasks;
        using System.Text.Json;
        using System.Text.Json.Serialization;
        using BSB.Base;
        using BSB.Interfaces;

        {{declarations}}
        public sealed class {{name}}
        {
            private readonly PluginEvents _events;
            private static readonly EventSchemaExport Schema = EventSchemaExport.FromJson({{Quote(export.ToJson())}});
            public {{name}}(PluginEvents context, string targetPlugin = {{Quote(export.PluginId ?? export.PluginName)}})
                => _events = context.CreateClient(targetPlugin, Schema);
            private static T Convert<T>(object? value) => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value), EventSchemaExport.JsonOptions)!;
        {{methods}}
        }
        """;
    }
}
