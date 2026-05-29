package tests

import (
	"testing"

	av "github.com/BetterCorp/AnyVali/sdk/go"
	"github.com/bettercorp/service-base/go/bsb"
)

func TestStringSchema(t *testing.T) {
	s := bsb.StringSchema().MinLength(1).MaxLength(100)
	result := s.SafeParse("hello")
	if !result.Success {
		t.Errorf("expected parse to succeed for valid string")
	}
	result = s.SafeParse("")
	if result.Success {
		t.Errorf("expected parse to fail for empty string with minLength=1")
	}
}

func TestFloat64Schema(t *testing.T) {
	s := bsb.Float64Schema().Min(0).Max(100)
	result := s.SafeParse(float64(50))
	if !result.Success {
		t.Errorf("expected parse to succeed for valid float64")
	}
	result = s.SafeParse(float64(150))
	if result.Success {
		t.Errorf("expected parse to fail for out-of-range float64")
	}
}

func TestInt32Schema(t *testing.T) {
	s := bsb.Int32Schema()
	result := s.SafeParse(int64(42))
	if !result.Success {
		t.Errorf("expected parse to succeed for valid int32")
	}
}

func TestBoolSchema(t *testing.T) {
	s := bsb.BoolSchema()
	result := s.SafeParse(true)
	if !result.Success {
		t.Errorf("expected parse to succeed for valid bool")
	}
	result = s.SafeParse("not a bool")
	if result.Success {
		t.Errorf("expected parse to fail for non-bool")
	}
}

func TestUUIDSchema(t *testing.T) {
	s := bsb.UUIDSchema()
	result := s.SafeParse("550e8400-e29b-41d4-a716-446655440000")
	if !result.Success {
		t.Errorf("expected parse to succeed for valid UUID")
	}
	result = s.SafeParse("not-a-uuid")
	if result.Success {
		t.Errorf("expected parse to fail for invalid UUID")
	}
}

func TestObjectSchema(t *testing.T) {
	s := bsb.ObjectSchema(map[string]av.Schema{
		"name":  bsb.StringSchema(),
		"age":   bsb.Int32Schema(),
		"email": bsb.OptionalWrap(bsb.EmailSchema()),
	})

	// Valid input: name + age required, email optional.
	result := s.SafeParse(map[string]any{
		"name": "Alice",
		"age":  int64(30),
	})
	if !result.Success {
		t.Errorf("expected parse to succeed for valid object, got issues: %v", result.Issues)
	}

	// Missing required field.
	result = s.SafeParse(map[string]any{
		"name": "Alice",
	})
	if result.Success {
		t.Errorf("expected parse to fail when required field 'age' is missing")
	}
}

func TestArraySchema(t *testing.T) {
	s := bsb.ArraySchema(bsb.StringSchema())
	result := s.SafeParse([]any{"a", "b", "c"})
	if !result.Success {
		t.Errorf("expected parse to succeed for valid string array")
	}
	result = s.SafeParse([]any{"a", 42})
	if result.Success {
		t.Errorf("expected parse to fail for mixed-type array")
	}
}

func TestEnumSchema(t *testing.T) {
	s := bsb.EnumSchema("active", "inactive", "pending")
	result := s.SafeParse("active")
	if !result.Success {
		t.Errorf("expected parse to succeed for valid enum value")
	}
	result = s.SafeParse("unknown")
	if result.Success {
		t.Errorf("expected parse to fail for invalid enum value")
	}
}

func TestSchemaExportJSON(t *testing.T) {
	s := bsb.ObjectSchema(map[string]av.Schema{
		"id":   bsb.UUIDSchema(),
		"name": bsb.StringSchema(),
	})

	jsonBytes, err := bsb.ExportSchemaJSON(s, bsb.ExportPortable)
	if err != nil {
		t.Fatalf("ExportSchemaJSON failed: %v", err)
	}
	if len(jsonBytes) == 0 {
		t.Fatal("expected non-empty JSON output")
	}
}

func TestVoidSchema(t *testing.T) {
	s := bsb.VoidSchema()
	result := s.SafeParse(nil)
	if !result.Success {
		t.Errorf("expected parse to succeed for nil input")
	}
	result = s.SafeParse("not null")
	if result.Success {
		t.Errorf("expected parse to fail for non-null input")
	}
}

func TestNullableWrap(t *testing.T) {
	s := bsb.NullableWrap(bsb.StringSchema())
	result := s.SafeParse(nil)
	if !result.Success {
		t.Errorf("expected nullable string to accept nil")
	}
	result = s.SafeParse("hello")
	if !result.Success {
		t.Errorf("expected nullable string to accept valid string")
	}
}
