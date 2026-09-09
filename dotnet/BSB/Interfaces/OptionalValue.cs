using System.Text.Json;
using System.Text.Json.Serialization;

namespace BSB.Interfaces;

/// <summary>Preserves the difference between an omitted property and an explicitly supplied null.</summary>
[JsonConverter(typeof(OptionalValueConverter))]
public readonly record struct OptionalValue<T>
{
    private readonly T? _value;
    public bool IsSet { get; }
    public T Value => IsSet ? _value! : throw new InvalidOperationException("Optional value was not supplied");
    public OptionalValue(T value) { _value = value; IsSet = true; }
    public static implicit operator OptionalValue<T>(T value) => new(value);
}

public sealed class OptionalValueConverter : JsonConverterFactory
{
    public override bool CanConvert(Type type) => type.IsGenericType && type.GetGenericTypeDefinition() == typeof(OptionalValue<>);
    public override JsonConverter CreateConverter(Type type, JsonSerializerOptions options) =>
        (JsonConverter)Activator.CreateInstance(typeof(Converter<>).MakeGenericType(type.GetGenericArguments()))!;
    private sealed class Converter<T> : JsonConverter<OptionalValue<T>>
    {
        public override bool HandleNull => true;
        public override OptionalValue<T> Read(ref Utf8JsonReader reader, Type type, JsonSerializerOptions options) =>
            new(JsonSerializer.Deserialize<T>(ref reader, options)!);
        public override void Write(Utf8JsonWriter writer, OptionalValue<T> value, JsonSerializerOptions options)
        {
            if (!value.IsSet) throw new JsonException("An unset optional value can only be serialized as an omitted property");
            JsonSerializer.Serialize(writer, value.Value, options);
        }
    }
}
