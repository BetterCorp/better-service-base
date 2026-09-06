package tooling

import (
	"encoding/json"
	"fmt"
	"go/format"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/bettercorp/service-base/go/bsb"
)

func identifier(raw string) string {
	var out strings.Builder
	upper := true
	for _, r := range raw {
		if r < 128 && (unicode.IsLetter(r) || unicode.IsDigit(r)) {
			if out.Len() == 0 && unicode.IsDigit(r) {
				out.WriteByte('X')
			}
			if upper {
				r = unicode.ToUpper(r)
			}
			out.WriteRune(r)
			upper = false
		} else {
			upper = true
		}
	}
	if out.Len() == 0 {
		return "Value"
	}
	return out.String()
}
func keys[T any](values map[string]T) []string {
	result := make([]string, 0, len(values))
	for key := range values {
		result = append(result, key)
	}
	sort.Strings(result)
	return result
}

type generator struct {
	declarations []string
	names        map[string]bool
}

func (g *generator) reserve(name string) error {
	if g.names[name] {
		return fmt.Errorf("generated name collision: %s", name)
	}
	g.names[name] = true
	return nil
}
func child(node map[string]any, primary, alias string) map[string]any {
	value, _ := node[primary].(map[string]any)
	if value == nil {
		value, _ = node[alias].(map[string]any)
	}
	return value
}
func (g *generator) shape(document *bsb.SchemaDocument, hint string) (string, error) {
	if document == nil {
		return "json.RawMessage", nil
	}
	references := map[string]string{}
	seen := map[string]bool{}
	for index, key := range keys(document.Definitions) {
		references[key] = fmt.Sprintf("%sDefinition%d", hint, index)
	}
	var native func(map[string]any, string) (string, error)
	native = func(node map[string]any, name string) (string, error) {
		kind, _ := node["kind"].(string)
		switch kind {
		case "string":
			return "string", nil
		case "bool":
			return "bool", nil
		case "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "float32", "float64":
			return kind, nil
		case "int":
			return "int64", nil
		case "number":
			return "float64", nil
		case "any", "unknown", "never", "null", "union", "intersection", "tuple":
			return "json.RawMessage", nil
		case "literal", "enum":
			var values []any
			if kind == "literal" {
				values = []any{node["value"]}
			} else {
				values, _ = node["values"].([]any)
			}
			allStrings := len(values) > 0
			for _, value := range values {
				if _, ok := value.(string); !ok {
					allStrings = false
				}
			}
			if allStrings {
				if err := g.reserve(name); err != nil {
					return "", err
				}
				g.declarations = append(g.declarations, "type "+name+" string")
				for index, value := range values {
					constant := fmt.Sprintf("%sValue%d", name, index)
					if err := g.reserve(constant); err != nil {
						return "", err
					}
					g.declarations = append(g.declarations, fmt.Sprintf("const %s %s = %s", constant, name, strconv.Quote(value.(string))))
				}
				return name, nil
			}
			return "json.RawMessage", nil
		case "optional", "nullable":
			inner, err := native(child(node, "schema", "inner"), name)
			if err != nil {
				return "", err
			}
			if kind == "optional" {
				return "bsb.Optional[" + inner + "]", nil
			}
			return "*" + inner, nil
		case "array":
			value, err := native(child(node, "items", "item"), name+"Item")
			return "[]" + value, err
		case "record":
			shape := child(node, "valueSchema", "values")
			if shape == nil {
				shape = child(node, "value", "value")
			}
			value, err := native(shape, name+"Value")
			return "map[string]" + value, err
		case "ref":
			key, _ := node["ref"].(string)
			key = strings.TrimPrefix(key, "#/definitions/")
			reference, ok := references[key]
			if !ok {
				return "", fmt.Errorf("unknown schema reference %s", key)
			}
			if !seen[key] {
				seen[key] = true
				value, err := native(document.Definitions[key], reference)
				if err != nil {
					return "", err
				}
				if value != reference {
					if err = g.reserve(reference); err != nil {
						return "", err
					}
					g.declarations = append(g.declarations, "type "+reference+" = "+value)
				}
			}
			return "*" + reference, nil
		case "object":
			if err := g.reserve(name); err != nil {
				return "", err
			}
			properties, _ := node["properties"].(map[string]any)
			required := map[string]bool{}
			if values, ok := node["required"].([]any); ok {
				for _, key := range values {
					if text, ok := key.(string); ok {
						required[text] = true
					}
				}
			}
			fields := []string{}
			used := map[string]bool{}
			for _, key := range keys(properties) {
				field := identifier(key)
				if used[field] {
					return "", fmt.Errorf("field collision in %s: %s", name, field)
				}
				used[field] = true
				schema, ok := properties[key].(map[string]any)
				if !ok {
					return "", fmt.Errorf("invalid property schema")
				}
				fieldType, err := native(schema, name+field)
				if err != nil {
					return "", err
				}
				optional := schema["kind"] == "optional" || !required[key]
				tag := key
				if optional {
					tag += ",omitzero"
					if schema["kind"] != "optional" {
						fieldType = "bsb.Optional[" + fieldType + "]"
					}
				}
				fields = append(fields, fmt.Sprintf("%s %s %s", field, fieldType, strconv.Quote("json:"+strconv.Quote(tag))))
			}
			g.declarations = append(g.declarations, "type "+name+" struct {\n"+strings.Join(fields, "\n")+"\n}")
			return name, nil
		}
		return "", fmt.Errorf("unsupported schema kind %q", kind)
	}
	return native(document.Root, hint)
}

// GenerateClient retains the full contract for runtime validation; types add compile-time checks.
func GenerateClient(data []byte, localName string) ([]byte, error) {
	if _, err := bsb.ImportEventSchemas(data, true); err != nil {
		return nil, err
	}
	var contract bsb.PortableContract
	if err := json.Unmarshal(data, &contract); err != nil {
		return nil, err
	}
	target := contract.PluginID
	if target == "" {
		target = contract.PluginName
	}
	if target == "" {
		return nil, fmt.Errorf("contract requires plugin identity")
	}
	class := identifier(localName) + "Client"
	g := generator{names: map[string]bool{class: true}}
	methods := []string{}
	used := map[string]bool{"Specific": true, "Events": true}
	for _, event := range keys(contract.Events) {
		definition := contract.Events[event]
		category := bsb.FlipEventCategory[definition.Category]
		method := identifier(event)
		listens := strings.HasPrefix(category, "on")
		if listens {
			method = "On" + method
		}
		if used[method] {
			return nil, fmt.Errorf("client method collision %s", method)
		}
		used[method] = true
		input, err := g.shape(definition.Input, class+method+"Input")
		if err != nil {
			return nil, err
		}
		output := "json.RawMessage"
		if definition.Output != nil {
			output, err = g.shape(definition.Output, class+method+"Output")
			if err != nil {
				return nil, err
			}
		}
		quoted := strconv.Quote(event)
		switch category {
		case "emitEvents", "emitBroadcast":
			operation := "EmitEvent"
			if category == "emitBroadcast" {
				operation = "EmitBroadcast"
			}
			methods = append(methods, fmt.Sprintf("func(c *%s) %s(ctx context.Context,payload %s)error {value,err:=bsb.JSONValue(payload);if err!=nil{return err};return c.events.%s(ctx,%s,value)}", class, method, input, operation, quoted))
		case "emitReturnableEvents":
			methods = append(methods, fmt.Sprintf("func(c *%s) %s(ctx context.Context,payload %s,timeout ...time.Duration)(%s,error){var zero %s;value,err:=bsb.JSONValue(payload);if err!=nil{return zero,err};result,err:=c.events.EmitEventAndReturn(ctx,%s,value,timeout...);if err!=nil{return zero,err};return bsb.DecodeValue[%s](result)}", class, method, input, output, output, quoted, output))
		case "onEvents", "onBroadcast":
			operation := "OnEvent"
			if category == "onBroadcast" {
				operation = "OnBroadcast"
			}
			methods = append(methods, fmt.Sprintf("func(c *%s) %s(ctx context.Context,handler func(context.Context,bsb.Observable,%s)error)error{return c.events.%s(ctx,%s,func(ctx context.Context,obs bsb.Observable,value any)error{payload,err:=bsb.DecodeValue[%s](value);if err!=nil{return err};return handler(bsb.WithObservable(ctx,obs),obs,payload)})}", class, method, input, operation, quoted, input))
		case "onReturnableEvents":
			methods = append(methods, fmt.Sprintf("func(c *%s) %s(ctx context.Context,handler func(context.Context,bsb.Observable,%s)(%s,error))error{return c.events.OnReturnableEvent(ctx,%s,func(ctx context.Context,obs bsb.Observable,value any)(any,error){payload,err:=bsb.DecodeValue[%s](value);if err!=nil{return nil,err};result,err:=handler(bsb.WithObservable(ctx,obs),obs,payload);if err!=nil{return nil,err};return bsb.JSONValue(result)})}", class, method, input, output, quoted, input))
		}
	}
	imports := []string{"context", "github.com/bettercorp/service-base/go/bsb"}
	body := strings.Join(append(g.declarations, methods...), "\n")
	if strings.Contains(body, "json.") {
		imports = append(imports, "encoding/json")
	}
	if strings.Contains(body, "time.") {
		imports = append(imports, "time")
	}
	if len(methods) == 0 {
		imports = imports[1:]
	}
	for index, item := range imports {
		imports[index] = strconv.Quote(item)
	}
	source := fmt.Sprintf("// Code generated by BSB. DO NOT EDIT.\npackage bsbclients\nimport (%s)\ntype %s struct { events *bsb.PluginEvents }\nfunc New%s(parent *bsb.PluginEvents,target ...string)(*%s,error){schemas,err:=bsb.ImportEventSchemas([]byte(%s),true);if err!=nil{return nil,err};name:=%s;if len(target)>0{name=target[0]};events,err:=parent.ClientTarget(name,schemas);if err!=nil{return nil,err};return &%s{events:events},nil}\nfunc(c *%s) Specific(serverID string)(*%s,error){events,err:=c.events.Specific(serverID);if err!=nil{return nil,err};return &%s{events:events},nil}\n%s", strings.Join(imports, ";"), class, class, class, strconv.Quote(string(data)), strconv.Quote(target), class, class, class, class, body)
	source += fmt.Sprintf("\nfunc(c *%s) Events() *bsb.PluginEvents { return c.events }\n", class)
	return format.Source([]byte(source))
}
