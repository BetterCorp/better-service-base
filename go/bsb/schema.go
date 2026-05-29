package bsb

import (
	av "github.com/BetterCorp/AnyVali/sdk/go"
)

// BSBSchema is the base schema interface, backed by the anyvali SDK.
type BSBSchema = av.Schema

// Re-export anyvali types that BSB consumers need.
type (
	ParseResult    = av.ParseResult
	SchemaIssue    = av.ValidationIssue
	SchemaDocument = av.Document
	ExportMode     = av.ExportMode
	UnknownKeyMode = av.UnknownKeyMode
)

// Re-export anyvali constants.
const (
	ExportPortable ExportMode = av.Portable
	ExportExtended ExportMode = av.Extended

	UnknownKeysReject UnknownKeyMode = av.Reject
	UnknownKeysStrip  UnknownKeyMode = av.Strip
	UnknownKeysAllow  UnknownKeyMode = av.Allow
)

// StringSchema creates a string schema.
func StringSchema() *av.StringSchema {
	return av.String()
}

// Int32Schema creates a 32-bit integer schema.
func Int32Schema() *av.IntSchema {
	return av.Int32()
}

// Int64Schema creates a 64-bit integer schema.
func Int64Schema() *av.IntSchema {
	return av.Int64()
}

// Float64Schema creates a float64 schema.
func Float64Schema() *av.Float64Schema {
	return av.Float64()
}

// BoolSchema creates a boolean schema.
func BoolSchema() *av.BoolSchema {
	return av.Bool()
}

// UUIDSchema creates a UUID-formatted string schema.
func UUIDSchema() *av.StringSchema {
	return av.String().Format("uuid")
}

// DateTimeSchema creates a date-time formatted string schema.
func DateTimeSchema() *av.StringSchema {
	return av.String().Format("date-time")
}

// EmailSchema creates an email-formatted string schema.
func EmailSchema() *av.StringSchema {
	return av.String().Format("email")
}

// URISchema creates a URI-formatted string schema.
func URISchema() *av.StringSchema {
	return av.String().Format("uri")
}

// ObjectSchema creates an object schema with the given properties.
// Unknown keys are stripped by default (matching Node.js behavior).
func ObjectSchema(props map[string]av.Schema) *av.ObjectSchema {
	return av.Object(props).UnknownKeys(av.Strip)
}

// ArraySchema creates an array schema with the given item schema.
func ArraySchema(items av.Schema) *av.ArraySchema {
	return av.Array(items)
}

// EnumSchema creates an enum schema from the given values.
func EnumSchema(values ...any) *av.EnumSchema {
	return av.Enum(values...)
}

// UnionSchema creates a union (oneOf) schema from the given schemas.
func UnionSchema(types ...av.Schema) *av.UnionSchema {
	return av.Union(types...)
}

// VoidSchema creates a null schema representing void/no-data.
func VoidSchema() *av.NullSchema {
	return av.Null()
}

// OptionalWrap wraps a schema to make it optional.
func OptionalWrap(s av.Schema) *av.OptionalSchema {
	return av.Optional(s)
}

// NullableWrap wraps a schema to allow null values.
func NullableWrap(s av.Schema) *av.NullableSchema {
	return av.Nullable(s)
}

// RecordSchema creates a record (map) schema where all values match the given schema.
func RecordSchema(v av.Schema) *av.RecordSchema {
	return av.Record(v)
}

// ExportSchema exports a schema as a portable SchemaDocument.
func ExportSchema(schema av.Schema, mode ExportMode) (*SchemaDocument, error) {
	return av.Export(schema, mode)
}

// ExportSchemaJSON exports a schema as JSON bytes.
func ExportSchemaJSON(schema av.Schema, mode ExportMode) ([]byte, error) {
	return av.ExportJSON(schema, mode)
}

// ImportSchema imports a SchemaDocument into a Schema.
func ImportSchema(doc *SchemaDocument) (av.Schema, error) {
	return av.Import(doc)
}

// ImportSchemaJSON imports JSON bytes into a Schema.
func ImportSchemaJSON(data []byte) (av.Schema, error) {
	return av.ImportJSON(data)
}
