package tests

import (
	"encoding/json"
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

func TestImportEventSchemasRejectsUnsafeMetadata(t *testing.T) {
	schemas := bsb.NewEventSchemas()
	schemas.OnReturnableEvents["lookup"] = bsb.CreateReturnableEvent(bsb.StringSchema(), bsb.StringSchema(), "lookup", 5)
	data, err := json.Marshal(bsb.ExportSchemas("service-test", "1.0.0", schemas))
	if err != nil {
		t.Fatal(err)
	}
	var contract map[string]any
	if err = json.Unmarshal(data, &contract); err != nil {
		t.Fatal(err)
	}
	events := contract["events"].(map[string]any)
	definition := events["lookup"].(map[string]any)
	delete(definition, "defaultTimeout")
	omittedTimeout, _ := json.Marshal(contract)
	imported, err := bsb.ImportEventSchemas(omittedTimeout, false)
	if err != nil || imported.OnReturnableEvents["lookup"].DefaultTimeout != 5 {
		t.Fatalf("omitted timeout did not default to five seconds: %v %v", imported.OnReturnableEvents["lookup"].DefaultTimeout, err)
	}
	definition["defaultTimeout"] = float64(0)
	explicitZero, _ := json.Marshal(contract)
	if _, err = bsb.ImportEventSchemas(explicitZero, false); err == nil {
		t.Fatal("explicit zero event timeout accepted")
	}
	definition["defaultTimeout"] = float64(86401)
	invalidTimeout, _ := json.Marshal(contract)
	if _, err = bsb.ImportEventSchemas(invalidTimeout, false); err == nil {
		t.Fatal("event timeout above portable maximum accepted")
	}
	definition["defaultTimeout"] = float64(86400)
	maximumTimeout, _ := json.Marshal(contract)
	if _, err = bsb.ImportEventSchemas(maximumTimeout, false); err != nil {
		t.Fatalf("portable maximum timeout rejected: %v", err)
	}
	events["bad\nname"] = definition
	delete(events, "lookup")
	invalidName, _ := json.Marshal(contract)
	if _, err = bsb.ImportEventSchemas(invalidName, false); err == nil {
		t.Fatal("control character in event name accepted")
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
