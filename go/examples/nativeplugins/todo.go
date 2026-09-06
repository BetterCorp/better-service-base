package nativeplugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	clients "github.com/bettercorp/service-base/go/examples/nativeplugins/bsbclients"
	"github.com/google/uuid"
)

type todoConfig struct {
	Storage struct {
		Path             string
		AutoSaveInterval int
		PrettyPrint      bool
	}
	Http struct {
		Host string
		Port int
		Cors bool
	}
	Features struct {
		MaxTodos      int
		StatsInterval int
	}
}
type Todo struct {
	Plugin
	options           todoConfig
	mu                sync.Mutex
	saveMu            sync.Mutex
	items             map[string]map[string]any
	generation, saved uint64
	server            *http.Server
	cancel            context.CancelFunc
	workers           sync.WaitGroup
}

func newTodo(base Plugin) (bsb.ServicePlugin, error) {
	options, err := bsb.DecodeValue[todoConfig](base.config)
	if err != nil {
		return nil, err
	}
	return &Todo{Plugin: base, options: options, items: map[string]map[string]any{}}, nil
}
func (p *Todo) Init(ctx context.Context, obs bsb.Observable) error {
	file, err := os.Open(p.options.Storage.Path)
	if err == nil {
		data, readErr := io.ReadAll(io.LimitReader(file, 8*1024*1024+1))
		file.Close()
		if readErr != nil {
			return readErr
		}
		if len(data) > 8*1024*1024 {
			return fmt.Errorf("todo storage exceeds 8 MiB")
		}
		var items []map[string]any
		if err = bsb.DecodeJSON(data, &items); err != nil {
			return err
		}
		if items == nil || len(items) > p.options.Features.MaxTodos {
			return fmt.Errorf("invalid todo storage")
		}
		contract, _ := assets.ReadFile(".bsb/schemas/service-demo-todo.json")
		schemas, err := bsb.ImportEventSchemas(contract, false)
		if err != nil {
			return err
		}
		for _, item := range items {
			parsed, err := schemas.OnReturnableEvents["todo.create"].Output.Parse(item)
			if err != nil {
				return err
			}
			item = parsed.(map[string]any)
			id := item["id"].(string)
			if _, exists := p.items[id]; exists {
				return fmt.Errorf("duplicate todo ID")
			}
			p.items[id] = item
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	for _, operation := range []string{"create", "get", "list", "update", "delete"} {
		if err := p.events.OnReturnableEvent(ctx, "todo."+operation, func(ctx context.Context, obs bsb.Observable, value any) (any, error) {
			return p.operation(ctx, obs, operation, value.(map[string]any))
		}); err != nil {
			return err
		}
	}
	return nil
}

// ponytail: one process owns this file; use a database for shared writers.
func (p *Todo) operation(ctx context.Context, obs bsb.Observable, operation string, value map[string]any) (any, error) {
	p.mu.Lock()
	result, event, err := p.mutate(operation, value)
	if err == nil {
		result, err = bsb.JSONValue(result)
	} // detach response before unlocking
	p.mu.Unlock()
	if err != nil {
		return nil, err
	}
	if event != "" {
		payload := result
		if operation == "delete" {
			payload = map[string]any{"id": value["id"]}
		}
		if err = p.events.EmitEvent(bsb.WithObservable(ctx, obs), event, payload); err != nil {
			return nil, err
		}
	}
	return result, nil
}
func (p *Todo) mutate(operation string, value map[string]any) (any, string, error) {
	id, _ := value["id"].(string)
	item, exists := p.items[id]
	now := time.Now().UTC().Format(time.RFC3339Nano)
	switch operation {
	case "create":
		if len(p.items) >= p.options.Features.MaxTodos {
			return nil, "", fmt.Errorf("maximum todo count reached")
		}
		item = bsb.MergeConfig(value, map[string]any{"id": uuid.NewString(), "completed": false, "createdAt": now, "updatedAt": now})
		p.items[item["id"].(string)] = item
		p.generation++
		return item, "todo.created", nil
	case "list":
		items := []any{}
		for _, item := range p.items {
			items = append(items, item)
		}
		return map[string]any{"todos": items, "total": len(items)}, "", nil
	}
	if !exists {
		return nil, "", os.ErrNotExist
	}
	switch operation {
	case "get":
		return item, "", nil
	case "update":
		for _, key := range []string{"title", "description", "completed"} {
			if v, ok := value[key]; ok {
				item[key] = v
			}
		}
		item["updatedAt"] = now
		p.generation++
		return item, "todo.updated", nil
	case "delete":
		delete(p.items, id)
		p.generation++
		return map[string]any{"success": true}, "todo.deleted", nil
	}
	return nil, "", fmt.Errorf("unknown operation")
}
func (p *Todo) save() error {
	p.saveMu.Lock()
	defer p.saveMu.Unlock()
	p.mu.Lock()
	if p.saved == p.generation {
		p.mu.Unlock()
		return nil
	}
	generation := p.generation
	items := []any{}
	for _, item := range p.items {
		items = append(items, item)
	}
	var data []byte
	var err error
	if p.options.Storage.PrettyPrint {
		data, err = json.MarshalIndent(items, "", "  ")
	} else {
		data, err = json.Marshal(items)
	}
	p.mu.Unlock()
	if err != nil {
		return err
	}
	if len(data) > 8*1024*1024 {
		return fmt.Errorf("todo storage exceeds 8 MiB")
	}
	path := p.options.Storage.Path
	if err = os.MkdirAll(filepath.Dir(path), 0750); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".bsb-todo-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err = file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err = file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err = file.Close(); err != nil {
		return err
	}
	if err = os.Rename(file.Name(), path); err != nil {
		return err
	}
	p.mu.Lock()
	p.saved = generation
	p.mu.Unlock()
	return nil
}
func (p *Todo) Run(ctx context.Context, obs bsb.Observable) error {
	client, err := clients.NewServiceDemoTodoClient(p.events, p.name)
	if err != nil {
		return err
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if p.options.Http.Cors {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == "OPTIONS" {
				w.WriteHeader(204)
				return
			}
		}
		if r.Method == "GET" {
			names := map[string]string{"/": "index.html", "/index.html": "index.html", "/app.js": "app.js", "/style.css": "style.css"}
			if name, ok := names[r.URL.Path]; ok {
				data, err := assets.ReadFile("static/" + name)
				if err != nil {
					http.Error(w, "asset unavailable", 500)
					return
				}
				mime := map[string]string{"index.html": "text/html; charset=utf-8", "app.js": "text/javascript", "style.css": "text/css"}
				w.Header().Set("Content-Type", mime[name])
				w.Write(data)
				return
			}
		}
		span := obs.StartSpan("http.request")
		defer span.End()
		callCtx := bsb.WithObservable(r.Context(), span)
		body := map[string]any{}
		if r.Method == "POST" || r.Method == "PATCH" {
			data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
			if err != nil {
				http.Error(w, "body too large", 413)
				return
			}
			if bsb.DecodeJSON(data, &body) != nil || body == nil {
				http.Error(w, "invalid JSON object", 400)
				return
			}
		}
		event := ""
		status := 200
		if r.URL.Path == "/api/todos" {
			switch r.Method {
			case "GET":
				event = "list"
			case "POST":
				event = "create"
				status = 201
			}
		} else if strings.HasPrefix(r.URL.Path, "/api/todos/") {
			id, err := uuid.Parse(strings.TrimPrefix(r.URL.Path, "/api/todos/"))
			if err != nil {
				http.Error(w, "invalid ID", 400)
				return
			}
			body["id"] = id.String()
			event = map[string]string{"GET": "get", "PATCH": "update", "DELETE": "delete"}[r.Method]
		}
		if event == "" {
			http.NotFound(w, r)
			return
		}
		result, err := client.Events().EmitEventAndReturn(callCtx, "todo."+event, body)
		if err != nil {
			status = 400
			if errors.Is(err, os.ErrNotExist) {
				status = 404
			}
			http.Error(w, "request failed", status)
			return
		}
		data, err := json.Marshal(result)
		if err != nil {
			http.Error(w, "response encoding failed", 500)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		w.Write(data)
	})
	listener, err := net.Listen("tcp", net.JoinHostPort(p.options.Http.Host, fmt.Sprint(p.options.Http.Port)))
	if err != nil {
		return err
	}
	p.server = &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 35 * time.Second, IdleTimeout: 60 * time.Second}
	ctx, p.cancel = context.WithCancel(ctx)
	p.workers.Add(1)
	go func() {
		defer p.workers.Done()
		if err := p.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			obs.Log().Error(err.Error())
		}
	}()
	repeat := func(interval time.Duration, action func() error) {
		if interval <= 0 {
			return
		}
		p.workers.Add(1)
		go func() {
			defer p.workers.Done()
			ticker := time.NewTicker(interval)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					if err := action(); err != nil {
						obs.Log().Error(err.Error())
					}
				}
			}
		}()
	}
	repeat(time.Duration(p.options.Storage.AutoSaveInterval)*time.Millisecond, p.save)
	repeat(time.Duration(p.options.Features.StatsInterval)*time.Second, func() error {
		p.mu.Lock()
		total, completed := len(p.items), 0
		for _, item := range p.items {
			if item["completed"] == true {
				completed++
			}
		}
		p.mu.Unlock()
		return p.events.EmitBroadcast(ctx, "todo.stats", map[string]any{"total": total, "completed": completed, "pending": total - completed, "timestamp": time.Now().UTC().Format(time.RFC3339Nano)})
	})
	return nil
}
func (p *Todo) Dispose() error {
	if p.cancel != nil {
		p.cancel()
	}
	var shutdown error
	if p.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		shutdown = p.server.Shutdown(ctx)
		cancel()
		if shutdown != nil {
			p.server.Close()
		}
	}
	p.workers.Wait()
	return errors.Join(shutdown, p.save())
}
