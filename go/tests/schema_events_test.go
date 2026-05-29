package tests

import (
	"testing"

	av "github.com/BetterCorp/AnyVali/sdk/go"
	"github.com/bettercorp/service-base/go/bsb"
)

func TestCreateFireAndForgetEvent(t *testing.T) {
	schema := bsb.CreateFireAndForgetEvent(
		bsb.ObjectSchema(map[string]av.Schema{
			"name": bsb.StringSchema(),
		}),
		"test event",
	)
	if schema.Brand != bsb.BrandFireAndForget {
		t.Errorf("expected brand %q, got %q", bsb.BrandFireAndForget, schema.Brand)
	}
	if schema.Description != "test event" {
		t.Errorf("expected description 'test event', got %q", schema.Description)
	}
	if schema.Input == nil {
		t.Error("expected input schema to be non-nil")
	}
}

func TestCreateReturnableEvent(t *testing.T) {
	schema := bsb.CreateReturnableEvent(
		bsb.ObjectSchema(map[string]av.Schema{"id": bsb.UUIDSchema()}),
		bsb.ObjectSchema(map[string]av.Schema{"name": bsb.StringSchema()}),
		"get by id",
		10,
	)
	if schema.Brand != bsb.BrandReturnable {
		t.Errorf("expected brand %q, got %q", bsb.BrandReturnable, schema.Brand)
	}
	if schema.DefaultTimeout != 10 {
		t.Errorf("expected timeout 10, got %f", schema.DefaultTimeout)
	}
	// Validate that the input schema accepts a valid UUID.
	result := schema.Input.SafeParse(map[string]any{
		"id": "550e8400-e29b-41d4-a716-446655440000",
	})
	if !result.Success {
		t.Error("expected input schema to accept valid UUID object")
	}
}

func TestCreateBroadcastEvent(t *testing.T) {
	schema := bsb.CreateBroadcastEvent(
		bsb.ObjectSchema(map[string]av.Schema{"count": bsb.Int32Schema()}),
		"stats broadcast",
	)
	if schema.Brand != bsb.BrandBroadcast {
		t.Errorf("expected brand %q, got %q", bsb.BrandBroadcast, schema.Brand)
	}
}

func TestEventSchemasValidateNoDuplicates(t *testing.T) {
	schemas := bsb.NewEventSchemas()
	schemas.EmitEvents["test"] = bsb.CreateFireAndForgetEvent(bsb.StringSchema())
	schemas.OnEvents["other"] = bsb.CreateFireAndForgetEvent(bsb.StringSchema())

	if err := schemas.Validate(); err != nil {
		t.Errorf("unexpected validation error: %v", err)
	}
}

func TestEventSchemasValidateDetectsDuplicates(t *testing.T) {
	schemas := bsb.NewEventSchemas()
	schemas.EmitEvents["test"] = bsb.CreateFireAndForgetEvent(bsb.StringSchema())
	schemas.OnEvents["test"] = bsb.CreateFireAndForgetEvent(bsb.StringSchema())

	if err := schemas.Validate(); err == nil {
		t.Error("expected validation error for duplicate event name")
	}
}

func TestExportSchemas(t *testing.T) {
	schemas := bsb.NewEventSchemas()
	schemas.OnReturnableEvents["get-item"] = bsb.CreateReturnableEvent(
		bsb.ObjectSchema(map[string]av.Schema{"id": bsb.UUIDSchema()}),
		bsb.ObjectSchema(map[string]av.Schema{"name": bsb.StringSchema()}),
		"Get item by ID",
	)

	export := bsb.ExportSchemas("test-plugin", "1.0.0", schemas)
	if export.PluginName != "test-plugin" {
		t.Errorf("expected plugin name 'test-plugin', got %q", export.PluginName)
	}
	if len(export.Events) != 1 {
		t.Errorf("expected 1 exported event, got %d", len(export.Events))
	}
	if export.Events["get-item"].Category != "onReturnableEvent" {
		t.Errorf("expected category 'onReturnableEvent', got %q", export.Events["get-item"].Category)
	}
}
