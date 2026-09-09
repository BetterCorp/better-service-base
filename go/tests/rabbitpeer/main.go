package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/url"
	"os"
	"sync/atomic"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
	"github.com/bettercorp/service-base/plugins/go/eventsrabbitmq"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	endpoint, err := url.Parse(os.Getenv("BSB_RABBITMQ_URL"))
	if err != nil {
		return err
	}
	password, _ := endpoint.User.Password()
	rabbit, err := eventsrabbitmq.New(map[string]any{"platformKey": os.Getenv("BSB_INTEROP_PLATFORM"), "endpoints": []string{endpoint.String()}, "credentials": map[string]any{"username": endpoint.User.Username(), "password": password}})
	if err != nil {
		return err
	}
	defer rabbit.Dispose()
	ctx := context.Background()
	backend := bsb.NewObservableBackend(bsb.ModeProduction, "interop", "go")
	obs := bsb.NewObservable(bsb.NewDTrace(), bsb.ResourceContext{}, backend, "go")
	if err = rabbit.Init(ctx, obs); err != nil {
		return err
	}
	var digest atomic.Value
	digest.Store("")
	data := make([]byte, 1024*1024)
	for i := range data {
		data[i] = byte(i % 256)
	}
	listeners := map[string]bsb.ReturnableListener{
		"echo": func(ctx context.Context, span bsb.Observable, value any) (any, error) {
			return map[string]any{"value": value, "trace": span.TraceID()}, nil
		},
		"call": func(ctx context.Context, span bsb.Observable, value any) (any, error) {
			input := value.(map[string]any)
			return rabbit.EmitEventAndReturn(ctx, span, input["target"].(string), "echo", 10*time.Second, input["value"])
		},
		"crash": func(ctx context.Context, span bsb.Observable, value any) (any, error) {
			if os.Getenv("BSB_INTEROP_CRASH_FIRST") == "true" {
				fmt.Println("CRASH_READY")
				<-ctx.Done()
			}
			return value, nil
		},
		"receive": func(ctx context.Context, span bsb.Observable, value any) (any, error) {
			digest.Store("")
			return rabbit.ReceiveStream(ctx, span, "go", "file", func(ctx context.Context, span bsb.Observable, stream io.Reader) error {
				hash := sha256.New()
				if _, err := io.Copy(hash, stream); err != nil {
					return err
				}
				digest.Store(hex.EncodeToString(hash.Sum(nil)))
				return nil
			}, 5*time.Second)
		},
		"digest": func(ctx context.Context, span bsb.Observable, value any) (any, error) {
			value = digest.Load()
			if value == "" {
				return nil, nil
			}
			return value, nil
		},
		"send": func(ctx context.Context, span bsb.Observable, value any) (any, error) {
			input := value.(map[string]any)
			err := rabbit.SendStream(ctx, span, input["target"].(string), "file", input["id"].(string), bytes.NewReader(data))
			return err == nil, err
		},
	}
	for event, listener := range listeners {
		if err = rabbit.OnReturnableEvent(ctx, obs, "go", event, listener); err != nil {
			return err
		}
	}
	fmt.Println("READY")
	_, err = bufio.NewReader(os.Stdin).ReadString('\n')
	return err
}
