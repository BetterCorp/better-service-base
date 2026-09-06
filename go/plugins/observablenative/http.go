package observablenative

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

func (p *Plugin) validateHTTP() error {
	if err := validHTTP(p.config.Endpoint, p.kind != "observable-axiom" || p.config.AllowInsecureHTTP); err != nil {
		return err
	}
	if p.kind == "observable-axiom" && (p.config.Token == "" || p.config.Dataset == "") {
		return fmt.Errorf("Axiom token and dataset required")
	}
	return nil
}
func post(ctx context.Context, endpoint string, body any, headers map[string]string) error {
	var last error
	for attempt := 0; attempt < 3; attempt++ {
		var result map[string]any
		last = bsb.JSONRequestLimit(ctx, http.MethodPost, endpoint, body, headers, 5*time.Second, &result, 64*1024*1024)
		if last == nil {
			if partial, ok := result["partialSuccess"].(map[string]any); ok {
				for key, value := range partial {
					if (key == "errorMessage" && value != "") || (key != "errorMessage" && fmt.Sprint(value) != "0") {
						return fmt.Errorf("collector partially rejected telemetry")
					}
				}
			}
			if failed, err := strconv.ParseFloat(fmt.Sprint(result["failed"]), 64); err == nil && failed > 0 {
				return fmt.Errorf("collector rejected events")
			}
			return nil
		}
		var status *bsb.HTTPStatusError
		if errors.As(last, &status) && status.Status != 429 && status.Status != 502 && status.Status != 503 && status.Status != 504 {
			return last
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(attempt+1) * 250 * time.Millisecond):
		}
	}
	return last
}
func otlpValue(value any) any {
	switch v := value.(type) {
	case bool:
		return map[string]any{"boolValue": v}
	case json.Number:
		if integer, err := v.Int64(); err == nil {
			return map[string]any{"intValue": strconv.FormatInt(integer, 10)}
		}
		number, err := v.Float64()
		if err == nil {
			return map[string]any{"doubleValue": number}
		}
		return map[string]any{"stringValue": v.String()}
	case float64:
		return map[string]any{"doubleValue": v}
	case int64:
		return map[string]any{"intValue": strconv.FormatInt(v, 10)}
	case map[string]any:
		return map[string]any{"kvlistValue": map[string]any{"values": attributes(v)}}
	case []any:
		values := []any{}
		for _, item := range v {
			values = append(values, otlpValue(item))
		}
		return map[string]any{"arrayValue": map[string]any{"values": values}}
	default:
		return map[string]any{"stringValue": fmt.Sprint(value)}
	}
}
func attributes(values map[string]any) []any {
	result := []any{}
	for key, value := range values {
		result = append(result, map[string]any{"key": key, "value": otlpValue(value)})
	}
	return result
}
func object(value any) map[string]any { result, _ := value.(map[string]any); return result }
func (p *Plugin) otlp(signal string, entries []map[string]any) map[string]any {
	resources := map[string]any{}
	for key, value := range p.config.ResourceAttributes {
		resources[key] = value
	}
	resources["service.name"] = p.config.ServiceName
	if p.config.ServiceVersion != "" {
		resources["service.version"] = p.config.ServiceVersion
	}
	if signal == "metrics" {
		latest := map[string]map[string]any{}
		for _, entry := range entries {
			latest[fmt.Sprint(entry["plugin"])+"\x00"+fmt.Sprint(entry["name"])+"\x00"+fmt.Sprint(entry["kind"])] = entry
		}
		entries = nil
		for _, entry := range latest {
			entries = append(entries, entry)
		}
	}
	grouped := map[string][]any{}
	for _, entry := range entries {
		plugin := fmt.Sprint(entry["plugin"])
		var item map[string]any
		switch signal {
		case "logs":
			timestamp, _ := time.Parse(time.RFC3339Nano, fmt.Sprint(entry["timestamp"]))
			level := fmt.Sprint(entry["level"])
			item = map[string]any{"timeUnixNano": fmt.Sprint(timestamp.UnixNano()), "severityNumber": 1 + levels[level]*4, "severityText": strings.ToUpper(level), "body": otlpValue(entry["message"]), "traceId": entry["traceId"], "spanId": entry["spanId"], "attributes": attributes(object(entry["meta"]))}
		case "traces":
			item = map[string]any{"traceId": entry["traceId"], "spanId": entry["spanId"], "parentSpanId": entry["parentSpanId"], "name": entry["name"], "kind": 1, "startTimeUnixNano": entry["startedNs"], "endTimeUnixNano": entry["endedNs"], "attributes": attributes(object(entry["attributes"])), "status": map[string]any{"code": 0}}
			if message, _ := entry["error"].(string); message != "" {
				item["status"] = map[string]any{"code": 2, "message": message}
			}
		case "metrics":
			point := map[string]any{"timeUnixNano": entry["timestampNs"], "startTimeUnixNano": entry["startedNs"]}
			item = map[string]any{"name": entry["name"], "description": entry["description"], "unit": entry["unit"]}
			kind := fmt.Sprint(entry["kind"])
			if kind == "histogram" {
				point["count"] = fmt.Sprint(entry["count"])
				point["sum"] = entry["sum"]
				point["bucketCounts"] = []string{fmt.Sprint(entry["count"])}
				point["explicitBounds"] = []float64{}
				item["histogram"] = map[string]any{"aggregationTemporality": 2, "dataPoints": []any{point}}
			} else {
				point["asDouble"] = entry["value"]
				if kind == "counter" {
					delete(point, "asDouble")
					point["asInt"] = fmt.Sprint(entry["value"])
					item["sum"] = map[string]any{"aggregationTemporality": 2, "isMonotonic": true, "dataPoints": []any{point}}
				} else {
					item["gauge"] = map[string]any{"dataPoints": []any{point}}
				}
			}
		}
		grouped[plugin] = append(grouped[plugin], item)
	}
	scopes := []any{}
	field := map[string]string{"logs": "logRecords", "traces": "spans", "metrics": "metrics"}[signal]
	for plugin, items := range grouped {
		scopes = append(scopes, map[string]any{"scope": map[string]any{"name": plugin}, field: items})
	}
	suffix := map[string]string{"logs": "Logs", "traces": "Spans", "metrics": "Metrics"}[signal]
	return map[string]any{"resource" + suffix: []any{map[string]any{"resource": map[string]any{"attributes": attributes(resources)}, "scope" + suffix: scopes}}}
}
func (p *Plugin) export(ctx context.Context, batch []map[string]any) error {
	if len(batch) == 0 {
		return nil
	}
	if p.network != nil {
		return p.network.export(ctx, batch)
	}
	endpoint := strings.TrimRight(p.config.Endpoint, "/")
	if p.kind == "observable-zipkin" {
		spans := []any{}
		for _, entry := range batch {
			if entry["signal"] != "traces" {
				continue
			}
			start, _ := strconv.ParseInt(fmt.Sprint(entry["startedNs"]), 10, 64)
			end, _ := strconv.ParseInt(fmt.Sprint(entry["endedNs"]), 10, 64)
			tags := map[string]string{}
			for key, value := range object(entry["attributes"]) {
				tags[key] = fmt.Sprint(value)
			}
			if value := fmt.Sprint(entry["error"]); value != "" {
				tags["error"] = value
			}
			spans = append(spans, map[string]any{"traceId": entry["traceId"], "id": entry["spanId"], "parentId": entry["parentSpanId"], "name": entry["name"], "timestamp": start / 1000, "duration": max(int64(1), (end-start)/1000), "tags": tags, "localEndpoint": map[string]any{"serviceName": p.config.ServiceName}})
		}
		if len(spans) > 0 {
			return post(ctx, endpoint, spans, p.config.Headers)
		}
		return nil
	}
	headers := map[string]string{}
	for key, value := range p.config.Headers {
		headers[key] = value
	}
	if p.kind == "observable-axiom" {
		headers["Authorization"] = "Bearer " + p.config.Token
		headers["X-Axiom-Dataset"] = p.config.Dataset
		if p.config.OrgID != "" {
			headers["X-Axiom-Org-Id"] = p.config.OrgID
		}
		events := []any{}
		for _, entry := range batch {
			if entry["signal"] != "traces" {
				entry["_time"] = entry["timestamp"]
				if entry["_time"] == nil {
					entry["_time"] = entry["timestampNs"]
				}
				entry["service"] = p.config.ServiceName
				events = append(events, entry)
			}
		}
		if len(events) > 0 {
			if err := post(ctx, endpoint+"/v1/datasets/"+url.PathEscape(p.config.Dataset)+"/ingest", events, headers); err != nil {
				return err
			}
		}
	}
	for _, signal := range []string{"logs", "metrics", "traces"} {
		if p.kind == "observable-axiom" && signal != "traces" {
			continue
		}
		entries := []map[string]any{}
		for _, entry := range batch {
			if entry["signal"] == signal {
				entries = append(entries, entry)
			}
		}
		if len(entries) > 0 {
			if err := post(ctx, endpoint+"/v1/"+signal, p.otlp(signal, entries), headers); err != nil {
				return err
			}
		}
	}
	return nil
}
func (p *Plugin) OnMetric(plugin string, entry map[string]any) {
	if !p.config.Metrics || p.local() || p.kind == "observable-zipkin" || p.kind == "observable-syslog" || p.kind == "observable-graylog" {
		return
	}
	entry = bsb.MergeConfig(entry, map[string]any{"signal": "metrics", "plugin": plugin})
	p.enqueue(redact(entry, p.config.Redact))
}
