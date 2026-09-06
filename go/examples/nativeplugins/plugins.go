// Package nativeplugins demonstrates BSB-owned startup with native plugin packages.
package nativeplugins

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	av "github.com/BetterCorp/AnyVali/sdk/go"
	"github.com/bettercorp/service-base/go/bsb"
	clients "github.com/bettercorp/service-base/go/examples/nativeplugins/bsbclients"
)

//go:embed .bsb/schemas/*.json static/*
var assets embed.FS

type Plugin struct {
	name    string
	config  map[string]any
	events  *bsb.PluginEvents
	backend *bsb.ObservableBackend
	running atomic.Bool
}

func (p *Plugin) Metadata() bsb.PluginMetadata {
	meta := bsb.PluginMetadata{Name: p.name, Version: "1.0.0", Category: bsb.PluginTypeService, Description: "Native BSB example"}
	if p.name == "service-default3" {
		meta.InitAfterPlugins = []string{"service-default2"}
	}
	return meta
}
func (p *Plugin) SetEvents(events *bsb.PluginEvents)                  { p.events = events }
func (p *Plugin) SetObservableBackend(backend *bsb.ObservableBackend) { p.backend = backend }
func (p *Plugin) Dispose() error                                      { return nil }
func Register(registry *bsb.PluginRegistry) {
	for _, name := range []string{"service-default0", "service-default1", "service-default2", "service-default3", "service-default4", "service-benchmarkify", "service-demo-todo"} {
		data, err := assets.ReadFile(".bsb/schemas/" + name + ".json")
		if err != nil {
			panic(err)
		}
		events, err := bsb.ImportEventSchemas(data, false)
		if err != nil {
			panic(err)
		}
		config := bsb.BSBSchema(av.Object(map[string]av.Schema{}))
		switch name {
		case "service-default0":
			config = av.Object(map[string]av.Schema{"testa": av.Float64().Min(0).Default(0), "testb": av.Float64().Min(0).Default(0)})
		case "service-benchmarkify":
			config = av.Object(map[string]av.Schema{"iterations": av.Int32().Min(1).Max(100000).Default(1000)})
		case "service-demo-todo":
			var raw struct {
				Config json.RawMessage `json:"configSchema"`
			}
			if err := json.Unmarshal(data, &raw); err != nil {
				panic(err)
			}
			config, err = bsb.ImportSchemaJSON(raw.Config)
			if err != nil {
				panic(err)
			}
		}
		registry.RegisterContract(bsb.PluginContract{Metadata: (&Plugin{name: name}).Metadata(), Config: config, Events: events, Documentation: []string{"README.md"}})
		registry.RegisterService(name, func(config map[string]any) (bsb.ServicePlugin, error) {
			base := Plugin{name: name, config: config}
			if name == "service-demo-todo" {
				return newTodo(base)
			}
			return &base, nil
		})
	}
}
func multiply(_ context.Context, _ bsb.Observable, value any) (any, error) {
	pair, err := bsb.DecodeValue[struct{ A, B float64 }](value)
	return pair.A * pair.B, err
}
func reverse(text string) string {
	chars := []rune(text)
	for i, j := 0, len(chars)-1; i < j; i, j = i+1, j-1 {
		chars[i], chars[j] = chars[j], chars[i]
	}
	return string(chars)
}
func (p *Plugin) Init(ctx context.Context, obs bsb.Observable) error {
	switch p.name {
	case "service-default1":
		zero, err := clients.NewServiceDefault0Client(p.events)
		if err != nil {
			return err
		}
		if err = zero.OnCalculate(ctx, func(_ context.Context, _ bsb.Observable, v clients.ServiceDefault0ClientOnCalculateInput) (float64, error) {
			return v.A * v.B, nil
		}); err != nil {
			return err
		}
		if err = zero.OnTest(ctx, func(_ context.Context, o bsb.Observable, v clients.ServiceDefault0ClientOnTestInput) error {
			o.Log().Info(v.A + v.B)
			return nil
		}); err != nil {
			return err
		}
		if err = p.events.OnReturnableEvent(ctx, "calculate", multiply); err != nil {
			return err
		}
		if err = p.events.OnReturnableEvent(ctx, "text.transform", func(_ context.Context, _ bsb.Observable, value any) (any, error) {
			v, err := bsb.DecodeValue[clients.ServiceDefault1ClientTextTransformInput](value)
			if err != nil {
				return nil, err
			}
			switch string(v.Transformation) {
			case "uppercase":
				return strings.ToUpper(v.Text), nil
			case "lowercase":
				return strings.ToLower(v.Text), nil
			case "reverse":
				return reverse(v.Text), nil
			case "capitalize":
				chars := []rune(strings.ToLower(v.Text))
				if len(chars) > 0 {
					return strings.ToUpper(string(chars[0])) + string(chars[1:]), nil
				}
				return "", nil
			}
			return nil, fmt.Errorf("unknown transformation")
		}); err != nil {
			return err
		}
		if err = p.events.OnEvent(ctx, "data.received", func(ctx context.Context, o bsb.Observable, value any) error {
			v := value.(map[string]any)
			return p.events.EmitEvent(bsb.WithObservable(ctx, o), "data.processed", map[string]any{"itemId": v["itemId"], "result": map[string]any{"processed": true, "timestamp": time.Now().UTC().Format(time.RFC3339Nano)}, "processingTime": 0})
		}); err != nil {
			return err
		}
		return p.events.OnBroadcast(ctx, "config.updated", func(_ context.Context, o bsb.Observable, _ any) error {
			o.Log().Info("Configuration updated")
			return nil
		})
	case "service-default2":
		if err := p.events.OnReturnableEvent(ctx, "calculate", multiply); err != nil {
			return err
		}
		three, err := clients.NewServiceDefault3Client(p.events)
		if err != nil {
			return err
		}
		return three.OnCalculate(ctx, func(_ context.Context, _ bsb.Observable, v clients.ServiceDefault3ClientOnCalculateInput) (float64, error) {
			return v.A * v.B, nil
		})
	case "service-default3":
		return p.events.OnReturnableEvent(ctx, "onReverseReturnable", func(_ context.Context, _ bsb.Observable, value any) (any, error) {
			return reverse(value.(map[string]any)["text"].(string)), nil
		})
	case "service-benchmarkify":
		if err := p.events.OnReturnableEvent(ctx, "add", func(_ context.Context, _ bsb.Observable, value any) (any, error) {
			v, err := bsb.DecodeValue[clients.ServiceBenchmarkifyClientAddInput](value)
			return v.A + v.B, err
		}); err != nil {
			return err
		}
		if err := p.events.OnReturnableEvent(ctx, "void", func(context.Context, bsb.Observable, any) (any, error) { return nil, nil }); err != nil {
			return err
		}
		return p.events.OnEvent(ctx, "benchmark.trigger", func(ctx context.Context, o bsb.Observable, _ any) error { return p.Run(ctx, o) })
	}
	return nil
}
func (p *Plugin) Run(ctx context.Context, obs bsb.Observable) error {
	ctx = bsb.WithObservable(ctx, obs)
	switch p.name {
	case "service-default0":
		if err := p.events.EmitEvent(ctx, "test", map[string]any{"a": "test", "b": "test"}); err != nil {
			return err
		}
		result, err := p.events.EmitEventAndReturn(ctx, "calculate", map[string]any{"a": p.config["testa"], "b": p.config["testb"]})
		if err != nil {
			return err
		}
		obs.Log().Info("Calculation result: {result}", map[string]any{"result": result})
	case "service-default2":
		one, err := clients.NewServiceDefault1Client(p.events)
		if err != nil {
			return err
		}
		value, err := one.Calculate(ctx, clients.ServiceDefault1ClientCalculateInput{A: 5, B: 5})
		if err != nil {
			return err
		}
		obs.Log().Info("Calculation result: {result}", map[string]any{"result": value})
	case "service-default3":
		value, err := p.events.EmitEventAndReturn(ctx, "calculate", map[string]any{"a": 18, "b": 19})
		if err != nil {
			return err
		}
		obs.Log().Info("Calculation result: {result}", map[string]any{"result": value})
	case "service-benchmarkify":
		if !p.running.CompareAndSwap(false, true) {
			return fmt.Errorf("benchmark already running")
		}
		defer p.running.Store(false)
		client, err := clients.NewServiceBenchmarkifyClient(p.events, p.name)
		if err != nil {
			return err
		}
		iterations, err := bsb.DecodeValue[int](p.config["iterations"])
		if err != nil {
			return err
		}
		results := []any{}
		for _, operation := range []string{"add", "void"} {
			start := time.Now()
			for i := 0; i < iterations; i++ {
				if operation == "add" {
					_, err = client.Add(ctx, clients.ServiceBenchmarkifyClientAddInput{A: 5, B: 3})
				} else {
					_, err = client.Void(ctx, clients.ServiceBenchmarkifyClientVoidInput{})
				}
				if err != nil {
					return err
				}
			}
			elapsed := time.Since(start).Seconds()
			results = append(results, map[string]any{"operation": operation, "duration": elapsed * 1000, "opsPerSecond": float64(iterations) / max(elapsed, .000001)})
		}
		return p.events.EmitBroadcast(ctx, "benchmark.results", map[string]any{"testName": "native-rpc", "results": results, "timestamp": time.Now().UTC().Format(time.RFC3339Nano)})
	default:
		obs.Log().Info("Running " + p.name)
	}
	return nil
}
