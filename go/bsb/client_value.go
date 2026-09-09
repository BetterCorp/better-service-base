package bsb

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// DecodeJSON preserves integers when decoding untyped configuration and wire data.
func DecodeJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("unexpected trailing JSON data")
	}
	return nil
}

// Optional preserves omitted versus explicitly null JSON properties.
// Generated fields use json:",omitzero" so unset values are omitted.
type Optional[T any] struct {
	Value   T
	Present bool
}

func Some[T any](value T) Optional[T]                  { return Optional[T]{Value: value, Present: true} }
func (value Optional[T]) IsZero() bool                 { return !value.Present }
func (value Optional[T]) MarshalJSON() ([]byte, error) { return json.Marshal(value.Value) }
func (value *Optional[T]) UnmarshalJSON(data []byte) error {
	if err := DecodeJSON(data, &value.Value); err != nil {
		return err
	}
	value.Present = true
	return nil
}
func DecodeValue[T any](value any) (T, error) {
	var result T
	data, err := json.Marshal(value)
	if err != nil {
		return result, err
	}
	err = DecodeJSON(data, &result)
	return result, err
}
func JSONValue(value any) (any, error) { return DecodeValue[any](value) }
