package bsb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const MaxJSONBytes = 4 * 1024 * 1024

type HTTPStatusError struct{ Status int }

func (e *HTTPStatusError) Error() string { return fmt.Sprintf("HTTP %d", e.Status) }

func EndpointOrigin(raw string, allowHTTP bool) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return "", fmt.Errorf("invalid endpoint URL")
	}
	if u.Scheme != "https" && !(allowHTTP && u.Scheme == "http") {
		return "", fmt.Errorf("endpoint requires HTTPS")
	}
	if u.Path != "" && u.Path != "/" {
		return "", fmt.Errorf("endpoint must be an origin without an API path")
	}
	u.Path = ""
	u.Host = strings.ToLower(u.Host)
	return u.String(), nil
}

// JSONRequest bounds reads and never forwards credentials through redirects.
func JSONRequest(ctx context.Context, method, endpoint string, body any, headers map[string]string, timeout time.Duration, output any) error {
	return JSONRequestLimit(ctx, method, endpoint, body, headers, timeout, output, MaxJSONBytes)
}

func JSONRequestLimit(ctx context.Context, method, endpoint string, body any, headers map[string]string, timeout time.Duration, output any, requestLimit int) error {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return err
		}
		if len(data) > requestLimit {
			return fmt.Errorf("request exceeds size limit")
		}
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, bytes.NewReader(data))
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	client := &http.Client{Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return &HTTPStatusError{response.StatusCode}
	}
	data, err = io.ReadAll(io.LimitReader(response.Body, MaxJSONBytes+1))
	if err != nil {
		return err
	}
	if len(data) > MaxJSONBytes {
		return fmt.Errorf("response exceeds size limit")
	}
	if len(data) == 0 {
		return nil
	}
	return DecodeJSON(data, output)
}
