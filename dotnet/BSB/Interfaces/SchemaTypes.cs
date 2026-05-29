using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace BSB.Interfaces;

/// <summary>
/// Base class for all BSB schema types. Provides validation and JSON Schema export.
/// Used for event schemas (cross-language compatible).
/// </summary>
public abstract class BSBType
{
    /// <summary>
    /// Human-readable description of this type, included in JSON Schema output.
    /// </summary>
    public string? Description { get; init; }

    /// <summary>
    /// Convert this type definition to a JSON Schema object.
    /// </summary>
    public abstract JsonObject ToJsonSchema();

    /// <summary>
    /// Validate a value against this type. Returns true if valid.
    /// </summary>
    public abstract bool Validate(object? value);

    /// <summary>
    /// Validate and throw <see cref="BSBValidationException"/> if invalid.
    /// </summary>
    public void ValidateOrThrow(object? value)
    {
        if (!Validate(value))
            throw new BSBValidationException($"Validation failed for {GetType().Name}", this, value);
    }
}

/// <summary>
/// Exception thrown when a value fails BSB type validation.
/// </summary>
public class BSBValidationException : Exception
{
    /// <summary>
    /// The schema that the value was validated against.
    /// </summary>
    public BSBType Schema { get; }

    /// <summary>
    /// The value that failed validation.
    /// </summary>
    public object? Value { get; }

    /// <summary>
    /// Create a new validation exception.
    /// </summary>
    public BSBValidationException(string message, BSBType schema, object? value) : base(message)
    {
        Schema = schema;
        Value = value;
    }
}

// --- Concrete BSB Types ---

/// <summary>
/// String type with optional length and pattern constraints.
/// </summary>
public class BSBString : BSBType
{
    /// <summary>
    /// Minimum allowed string length.
    /// </summary>
    public int? MinLength { get; init; }

    /// <summary>
    /// Maximum allowed string length.
    /// </summary>
    public int? MaxLength { get; init; }

    /// <summary>
    /// Regex pattern the string must match.
    /// </summary>
    public string? Pattern { get; init; }

    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "string" };
        if (Description is not null) schema["description"] = Description;
        if (MinLength.HasValue) schema["minLength"] = MinLength.Value;
        if (MaxLength.HasValue) schema["maxLength"] = MaxLength.Value;
        if (Pattern is not null) schema["pattern"] = Pattern;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value)
    {
        if (value is not string s) return false;
        if (MinLength.HasValue && s.Length < MinLength.Value) return false;
        if (MaxLength.HasValue && s.Length > MaxLength.Value) return false;
        if (Pattern is not null && !Regex.IsMatch(s, Pattern)) return false;
        return true;
    }
}

/// <summary>
/// Numeric type with optional range constraints and integer-only mode.
/// </summary>
public class BSBNumber : BSBType
{
    /// <summary>
    /// Minimum allowed value (inclusive).
    /// </summary>
    public double? Min { get; init; }

    /// <summary>
    /// Maximum allowed value (inclusive).
    /// </summary>
    public double? Max { get; init; }

    /// <summary>
    /// When true, only integer values are accepted.
    /// </summary>
    public bool IntegerOnly { get; init; }

    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = IntegerOnly ? "integer" : "number" };
        if (Description is not null) schema["description"] = Description;
        if (Min.HasValue) schema["minimum"] = Min.Value;
        if (Max.HasValue) schema["maximum"] = Max.Value;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value)
    {
        if (value is null) return false;
        double d;
        try { d = Convert.ToDouble(value); }
        catch { return false; }
        if (IntegerOnly && d != Math.Floor(d)) return false;
        if (Min.HasValue && d < Min.Value) return false;
        if (Max.HasValue && d > Max.Value) return false;
        return true;
    }
}

/// <summary>
/// Boolean type.
/// </summary>
public class BSBBoolean : BSBType
{
    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "boolean" };
        if (Description is not null) schema["description"] = Description;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => value is bool;
}

/// <summary>
/// Object type with named properties and optional required list.
/// </summary>
public class BSBObject : BSBType
{
    /// <summary>
    /// Named property definitions.
    /// </summary>
    public Dictionary<string, BSBType> Properties { get; init; } = new();

    /// <summary>
    /// List of required property names. Defaults to all properties if not specified.
    /// </summary>
    public List<string>? Required { get; init; }

    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "object" };
        if (Description is not null) schema["description"] = Description;
        var props = new JsonObject();
        foreach (var (key, type) in Properties)
            props[key] = type.ToJsonSchema();
        schema["properties"] = props;
        if (Required is { Count: > 0 })
            schema["required"] = new JsonArray(Required.Select(r => (JsonNode)JsonValue.Create(r)!).ToArray());
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value)
    {
        if (value is JsonElement je && je.ValueKind == JsonValueKind.Object) return true;
        if (value is IDictionary<string, object?>) return true;
        return false;
    }
}

/// <summary>
/// Array type with a typed item schema and optional length constraints.
/// </summary>
public class BSBArray : BSBType
{
    /// <summary>
    /// Schema for each item in the array.
    /// </summary>
    public required BSBType Items { get; init; }

    /// <summary>
    /// Minimum number of items.
    /// </summary>
    public int? MinLength { get; init; }

    /// <summary>
    /// Maximum number of items.
    /// </summary>
    public int? MaxLength { get; init; }

    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "array" };
        if (Description is not null) schema["description"] = Description;
        schema["items"] = Items.ToJsonSchema();
        if (MinLength.HasValue) schema["minItems"] = MinLength.Value;
        if (MaxLength.HasValue) schema["maxItems"] = MaxLength.Value;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => value is System.Collections.IEnumerable and not string;
}

/// <summary>
/// Enum type restricted to a set of allowed string values.
/// </summary>
public class BSBEnum : BSBType
{
    /// <summary>
    /// Allowed values.
    /// </summary>
    public required string[] Values { get; init; }

    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "string" };
        if (Description is not null) schema["description"] = Description;
        schema["enum"] = new JsonArray(Values.Select(v => (JsonNode)JsonValue.Create(v)!).ToArray());
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => value is string s && Values.Contains(s);
}

/// <summary>
/// UUID/GUID type (JSON Schema format: "uuid").
/// </summary>
public class BSBUuid : BSBType
{
    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "string", ["format"] = "uuid" };
        if (Description is not null) schema["description"] = Description;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => value is string s && Guid.TryParse(s, out _);
}

/// <summary>
/// Date-time type (JSON Schema format: "date-time", ISO 8601).
/// </summary>
public class BSBDateTime : BSBType
{
    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "string", ["format"] = "date-time" };
        if (Description is not null) schema["description"] = Description;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) =>
        (value is string s && DateTimeOffset.TryParse(s, out _)) ||
        value is DateTime ||
        value is DateTimeOffset;
}

/// <summary>
/// Email address type (JSON Schema format: "email").
/// </summary>
public class BSBEmail : BSBType
{
    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "string", ["format"] = "email" };
        if (Description is not null) schema["description"] = Description;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => value is string s && s.Contains('@') && s.Contains('.');
}

/// <summary>
/// URI type (JSON Schema format: "uri").
/// </summary>
public class BSBUri : BSBType
{
    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "string", ["format"] = "uri" };
        if (Description is not null) schema["description"] = Description;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => value is string s && Uri.TryCreate(s, UriKind.Absolute, out _);
}

/// <summary>
/// Binary data type (JSON Schema content encoding: "base64").
/// </summary>
public class BSBBytes : BSBType
{
    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject { ["type"] = "string", ["contentEncoding"] = "base64" };
        if (Description is not null) schema["description"] = Description;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => value is string or byte[];
}

/// <summary>
/// Unknown/any type - accepts all values. Use sparingly.
/// </summary>
public class BSBUnknown : BSBType
{
    /// <inheritdoc />
    public override JsonObject ToJsonSchema()
    {
        var schema = new JsonObject();
        if (Description is not null) schema["description"] = Description;
        return schema;
    }

    /// <inheritdoc />
    public override bool Validate(object? value) => true;
}

/// <summary>
/// Static builder API for BSB types. Mirrors the Node.js <c>bsb.*</c> namespace.
/// Used for defining event schemas in a cross-language compatible way.
/// </summary>
public static class BSBTypes
{
    /// <summary>
    /// Create a string type with optional constraints.
    /// </summary>
    public static BSBString String(string? description = null, int? min = null, int? max = null, string? pattern = null)
        => new() { Description = description, MinLength = min, MaxLength = max, Pattern = pattern };

    /// <summary>
    /// Create a 32-bit integer type with optional range.
    /// </summary>
    public static BSBNumber Int32(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max, IntegerOnly = true };

    /// <summary>
    /// Create a 64-bit integer type with optional range.
    /// </summary>
    public static BSBNumber Int64(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max, IntegerOnly = true };

    /// <summary>
    /// Create a float type with optional range.
    /// </summary>
    public static BSBNumber Float(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max };

    /// <summary>
    /// Create a double type with optional range.
    /// </summary>
    public static BSBNumber Double(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max };

    /// <summary>
    /// Create a generic number type with optional range.
    /// </summary>
    public static BSBNumber Number(string? description = null, double? min = null, double? max = null)
        => new() { Description = description, Min = min, Max = max };

    /// <summary>
    /// Create a boolean type.
    /// </summary>
    public static BSBBoolean Boolean(string? description = null)
        => new() { Description = description };

    /// <summary>
    /// Create a UUID/GUID type.
    /// </summary>
    public static BSBUuid Uuid(string? description = null)
        => new() { Description = description };

    /// <summary>
    /// Create an ISO 8601 date-time type.
    /// </summary>
    public static BSBDateTime DateTime(string? description = null)
        => new() { Description = description };

    /// <summary>
    /// Create an email address type.
    /// </summary>
    public static BSBEmail Email(string? description = null)
        => new() { Description = description };

    /// <summary>
    /// Create an absolute URI type.
    /// </summary>
    public static BSBUri Uri(string? description = null)
        => new() { Description = description };

    /// <summary>
    /// Create a binary data type (base64 encoded in JSON).
    /// </summary>
    public static BSBBytes Bytes(string? description = null)
        => new() { Description = description };

    /// <summary>
    /// Create an object type with named properties. All properties are required by default.
    /// </summary>
    public static BSBObject Object(Dictionary<string, BSBType> properties, string? description = null, List<string>? required = null)
        => new() { Properties = properties, Description = description, Required = required ?? properties.Keys.ToList() };

    /// <summary>
    /// Create an array type with a typed item schema.
    /// </summary>
    public static BSBArray Array(BSBType items, string? description = null, int? minLength = null, int? maxLength = null)
        => new() { Items = items, Description = description, MinLength = minLength, MaxLength = maxLength };

    /// <summary>
    /// Create an enum type restricted to specific string values.
    /// </summary>
    public static BSBEnum Enum(string[] values, string? description = null)
        => new() { Values = values, Description = description };

    /// <summary>
    /// Create an unknown/any type. Use sparingly.
    /// </summary>
    public static BSBUnknown Unknown(string? description = null)
        => new() { Description = description };
}
