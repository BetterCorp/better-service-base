package bsb

import (
	"encoding/json"
	"testing"
)

func TestJSONIntegerRoundTrip(t *testing.T) {
	const large int64 = 9007199254740993
	value, err := JSONValue(map[string]int64{"id": large})
	if err != nil {
		t.Fatal(err)
	}
	if value.(map[string]any)["id"] != json.Number("9007199254740993") {
		t.Fatal("integer rounded")
	}
	result, err := DecodeValue[map[string]int64](value)
	if err != nil || result["id"] != large {
		t.Fatalf("round trip: %v %v", result, err)
	}
	if DecodeJSON([]byte(`{} {}`), &value) == nil {
		t.Fatal("accepted trailing JSON")
	}
}
