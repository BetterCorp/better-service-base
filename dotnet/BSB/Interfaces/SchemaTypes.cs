using System.Text.Json;
using System.Text.Json.Nodes;
using AnyVali;
using AnyVali.Schemas;

namespace BSB.Interfaces;

/// <summary>BSB's compatibility facade over the native AnyVali SDK.</summary>
public abstract class BSBType
{
    public string? Description { get; init; }
    protected abstract Schema BuildSchema();
    public Schema ToSchema() => Description is null ? BuildSchema() : BuildSchema().Describe(Description);
    public JsonObject ToAnyVali() => JsonNode.Parse(V.Export(ToSchema()).ToJson())!.AsObject();
    // Retained for source compatibility; interchange exports use AnyVali documents.
    public JsonObject ToJsonSchema() => ToAnyVali();
    public bool Validate(object? value) => ToSchema().SafeParse(ToWireValue(value)).Success;
    public object? Parse(object? value) => ToSchema().Parse(ToWireValue(value));
    public void ValidateOrThrow(object? value)
    {
        if (!Validate(value)) throw new BSBValidationException("Schema validation failed", this, value);
    }
    public static BSBType Import(JsonObject document) => new BSBAnyVali(V.Import(AnyValiDocument.FromJson(document.ToJsonString())));
    public static implicit operator BSBType(Schema schema) => new BSBAnyVali(schema);

    /// <summary>Apply the same JSON boundary to local and transported payloads.</summary>
    public static object? ToWireValue(object? value)
    {
        var element = value is JsonElement json ? json : JsonSerializer.SerializeToElement(value);
        return element.ValueKind switch
        {
            JsonValueKind.Object => element.EnumerateObject().ToDictionary(p => p.Name, p => ToWireValue(p.Value)),
            JsonValueKind.Array => element.EnumerateArray().Select(x => ToWireValue(x)).ToList(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var integer) ? (object)integer : element.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => throw new JsonException("Unsupported event value"),
        };
    }
}

public sealed class BSBAnyVali(Schema schema) : BSBType
{
    protected override Schema BuildSchema() => schema;
}

public class BSBValidationException(string message, BSBType schema, object? value) : Exception(message)
{
    public BSBType Schema { get; } = schema;
    public object? Value { get; } = value;
}

public class BSBString : BSBType
{
    public int? MinLength { get; init; }
    public int? MaxLength { get; init; }
    public string? Pattern { get; init; }
    protected override Schema BuildSchema()
    {
        var schema = V.String();
        if (MinLength is int min) schema = schema.MinLength(min);
        if (MaxLength is int max) schema = schema.MaxLength(max);
        if (Pattern is not null) schema = schema.Pattern(Pattern);
        return schema;
    }
}

public class BSBNumber : BSBType
{
    public double? Min { get; init; }
    public double? Max { get; init; }
    public bool IntegerOnly { get; init; }
    public string? Kind { get; init; }
    protected override Schema BuildSchema()
    {
        NumberSchema schema = Kind switch
        {
            "int32" => V.Int32(), "int64" => V.Int64(),
            "float32" => V.Float32(), "float64" => V.Float64(),
            _ => IntegerOnly ? V.Int() : V.Number(),
        };
        if (Min is double min) schema = schema.Min(min);
        if (Max is double max) schema = schema.Max(max);
        return schema;
    }
}

public class BSBBoolean : BSBType { protected override Schema BuildSchema() => V.Bool(); }
public class BSBObject : BSBType
{
    public Dictionary<string, BSBType> Properties { get; init; } = new();
    public List<string>? Required { get; init; }
    protected override Schema BuildSchema() => V.Object(Properties.ToDictionary(p => p.Key,
        p => Required is null || Required.Contains(p.Key) ? p.Value.ToSchema() : V.Optional(p.Value.ToSchema())));
}
public class BSBArray : BSBType
{
    public required BSBType Items { get; init; }
    public int? MinLength { get; init; }
    public int? MaxLength { get; init; }
    protected override Schema BuildSchema()
    {
        var schema = V.Array(Items.ToSchema());
        if (MinLength is int min) schema = schema.MinItems(min);
        if (MaxLength is int max) schema = schema.MaxItems(max);
        return schema;
    }
}
public class BSBEnum : BSBType
{
    public required string[] Values { get; init; }
    protected override Schema BuildSchema() => V.Enum(Values.Cast<object>().ToArray());
}
public class BSBUuid : BSBType { protected override Schema BuildSchema() => V.String().Format("uuid"); }
public class BSBDateTime : BSBType { protected override Schema BuildSchema() => V.String().Format("date-time"); }
public class BSBEmail : BSBType { protected override Schema BuildSchema() => V.String().Format("email"); }
public class BSBUri : BSBType { protected override Schema BuildSchema() => V.String().Format("url"); }
public class BSBBytes : BSBType { protected override Schema BuildSchema() => V.Unknown(); }
public class BSBUnknown : BSBType { protected override Schema BuildSchema() => V.Unknown(); }

/// <summary>Compatibility builders. Any AnyVali schema also converts directly to BSBType.</summary>
public static class BSBTypes
{
    public static BSBString String(string? description = null, int? min = null, int? max = null, string? pattern = null)
        => new() { Description = description, MinLength = min, MaxLength = max, Pattern = pattern };
    public static BSBNumber Int32(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max, IntegerOnly = true, Kind = "int32" };
    public static BSBNumber Int64(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max, IntegerOnly = true, Kind = "int64" };
    public static BSBNumber Float(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max, Kind = "float32" };
    public static BSBNumber Double(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max, Kind = "float64" };
    public static BSBNumber Number(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max };
    public static BSBBoolean Boolean(string? description = null) => new() { Description = description };
    public static BSBUuid Uuid(string? description = null) => new() { Description = description };
    public static BSBDateTime DateTime(string? description = null) => new() { Description = description };
    public static BSBEmail Email(string? description = null) => new() { Description = description };
    public static BSBUri Uri(string? description = null) => new() { Description = description };
    public static BSBBytes Bytes(string? description = null) => new() { Description = description };
    public static BSBObject Object(Dictionary<string, BSBType> properties, string? description = null, List<string>? required = null)
        => new() { Properties = properties, Description = description, Required = required };
    public static BSBArray Array(BSBType items, string? description = null, int? minLength = null, int? maxLength = null)
        => new() { Items = items, Description = description, MinLength = minLength, MaxLength = maxLength };
    public static BSBEnum Enum(string[] values, string? description = null) => new() { Values = values, Description = description };
    public static BSBUnknown Unknown(string? description = null) => new() { Description = description };
    public static BSBType Optional(BSBType inner) => V.Optional(inner.ToSchema());
    public static BSBType Nullable(BSBType inner) => V.Nullable(inner.ToSchema());
    public static BSBType Record(BSBType value) => V.Record(value.ToSchema());
    public static BSBType Union(params BSBType[] variants) => V.Union(variants.Select(v => v.ToSchema()).ToArray());
}
