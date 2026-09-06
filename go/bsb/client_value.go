package bsb

import "encoding/json"

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
	if err := json.Unmarshal(data, &value.Value); err != nil {
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
	err = json.Unmarshal(data, &result)
	return result, err
}
func JSONValue(value any) (any, error) { return DecodeValue[any](value) }
