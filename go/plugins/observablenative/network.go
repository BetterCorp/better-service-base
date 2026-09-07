package observablenative

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/bettercorp/service-base/go/bsb"
)

type networkWriter struct {
	config     config
	kind       string
	connection net.Conn
	tls        *tls.Config
}

func validHTTP(endpoint string, allowHTTP bool) error {
	u, err := url.Parse(endpoint)
	if err != nil || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("invalid telemetry endpoint")
	}
	_, err = bsb.EndpointOrigin(u.Scheme+"://"+u.Host, allowHTTP)
	return err
}
func newNetworkWriter(options config, kind string) (*networkWriter, error) {
	if options.Host == "" || options.Port < 1 || options.Port > 65535 {
		return nil, fmt.Errorf("invalid network logging address")
	}
	if options.Protocol != "udp" && options.Protocol != "tcp" && options.Protocol != "tls" && !(kind == "observable-graylog" && options.Protocol == "http") {
		return nil, fmt.Errorf("invalid logging protocol")
	}
	if kind == "observable-syslog" {
		facility, ok := options.Facility.(float64)
		if !ok || facility < 0 || facility > 23 || facility != float64(int(facility)) {
			return nil, fmt.Errorf("invalid syslog facility")
		}
		if options.RFC != "3164" && options.RFC != "5424" {
			return nil, fmt.Errorf("invalid syslog RFC")
		}
		if options.Framing != "newline" && options.Framing != "octet-counting" {
			return nil, fmt.Errorf("invalid syslog framing")
		}
	}
	result := &networkWriter{config: options, kind: kind}
	if options.Protocol == "http" {
		if result.config.HTTPEndpoint == "" {
			result.config.HTTPEndpoint = "http://" + net.JoinHostPort(options.Host, strconv.Itoa(options.Port)) + "/gelf"
		}
		if err := validHTTP(result.config.HTTPEndpoint, true); err != nil {
			return nil, err
		}
	}
	if options.Protocol == "tls" {
		roots, err := x509.SystemCertPool()
		if err != nil {
			roots = x509.NewCertPool()
		}
		if options.CACertificatePath != "" {
			data, err := os.ReadFile(options.CACertificatePath)
			if err != nil {
				return nil, err
			}
			if !roots.AppendCertsFromPEM(data) {
				return nil, fmt.Errorf("invalid CA certificate")
			}
		}
		result.tls = &tls.Config{MinVersion: tls.VersionTLS12, RootCAs: roots, ServerName: options.Host}
		if (options.ClientCertificatePath == "") != (options.ClientKeyPath == "") {
			return nil, fmt.Errorf("client certificate and key are both required")
		}
		if options.ClientCertificatePath != "" {
			certificate, err := tls.LoadX509KeyPair(options.ClientCertificatePath, options.ClientKeyPath)
			if err != nil {
				return nil, err
			}
			result.tls.Certificates = []tls.Certificate{certificate}
		}
	}
	return result, nil
}
func (w *networkWriter) close() {
	if w.connection != nil {
		w.connection.Close()
		w.connection = nil
	}
}
func (w *networkWriter) send(ctx context.Context, data []byte) error {
	if w.config.Protocol == "udp" && len(data) > 65507 {
		return fmt.Errorf("UDP log exceeds datagram limit")
	}
	if w.connection == nil {
		dialer := &net.Dialer{Timeout: 5 * time.Second}
		address := net.JoinHostPort(w.config.Host, strconv.Itoa(w.config.Port))
		var err error
		if w.tls != nil {
			w.connection, err = (&tls.Dialer{NetDialer: dialer, Config: w.tls}).DialContext(ctx, "tcp", address)
		} else {
			w.connection, err = dialer.DialContext(ctx, w.config.Protocol, address)
		}
		if err != nil {
			return err
		}
	}
	if err := w.connection.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
		w.close()
		return err
	}
	_, err := io.Copy(w.connection, bytes.NewReader(data))
	if err != nil {
		w.close()
	}
	return err
}
func gelfDatagrams(data []byte, compress bool) ([][]byte, error) {
	if compress {
		var buffer bytes.Buffer
		writer := gzip.NewWriter(&buffer)
		if _, err := writer.Write(data); err != nil {
			return nil, err
		}
		if err := writer.Close(); err != nil {
			return nil, err
		}
		data = buffer.Bytes()
	}
	if len(data) <= 1200 {
		return [][]byte{data}, nil
	}
	count := (len(data) + 1187) / 1188
	if count > 128 {
		return nil, fmt.Errorf("GELF message exceeds 128 chunks")
	}
	id := make([]byte, 8)
	if _, err := rand.Read(id); err != nil {
		return nil, err
	}
	packets := make([][]byte, count)
	for index := 0; index < count; index++ {
		end := min((index+1)*1188, len(data))
		packet := append([]byte{0x1e, 0x0f}, id...)
		packet = append(packet, byte(index), byte(count))
		packets[index] = append(packet, data[index*1188:end]...)
	}
	return packets, nil
}
func severity(level string) int {
	return map[string]int{"trace": 7, "debug": 7, "info": 6, "warn": 4, "error": 3, "fatal": 2}[level]
}
func cleanField(value string, max int) string {
	value = strings.Map(func(r rune) rune {
		if r < '!' || r > '~' {
			return '_'
		}
		return r
	}, value)
	if len(value) > max {
		return value[:max]
	}
	if value == "" {
		return "-"
	}
	return value
}
func (w *networkWriter) export(ctx context.Context, batch []map[string]any) error {
	for _, entry := range batch {
		level, _ := entry["level"].(string)
		timestamp, _ := time.Parse(time.RFC3339Nano, fmt.Sprint(entry["timestamp"]))
		data, err := json.Marshal(entry)
		if err != nil {
			return err
		}
		if w.kind == "observable-graylog" {
			message := map[string]any{"version": "1.1", "host": w.config.Hostname, "short_message": entry["message"], "full_message": string(data), "timestamp": float64(timestamp.UnixNano()) / 1e9, "level": severity(level), "_facility": w.config.Facility, "_plugin": entry["plugin"], "_trace_id": entry["traceId"], "_span_id": entry["spanId"]}
			for key, value := range w.config.AdditionalFields {
				key = "_" + strings.TrimLeft(key, "_")
				if key != "_id" && message[key] == nil {
					message[key] = value
				}
			}
			if w.config.Protocol == "http" {
				if err := post(ctx, w.config.HTTPEndpoint, message, w.config.Headers); err != nil {
					return err
				}
				continue
			}
			data, err = json.Marshal(message)
			if err != nil {
				return err
			}
			if w.config.Protocol == "udp" {
				packets, err := gelfDatagrams(data, w.config.Compress)
				if err != nil {
					return err
				}
				for _, packet := range packets {
					if err = w.send(ctx, packet); err != nil {
						return err
					}
				}
				continue
			}
			data = append(data, 0)
		} else {
			priority := int(w.config.Facility.(float64))*8 + severity(level)
			host, app := cleanField(w.config.Hostname, 255), cleanField(w.config.AppName, 48)
			prefix := fmt.Sprintf("<%d>1 %s %s %s %d - - ", priority, timestamp.Format(time.RFC3339Nano), host, app, os.Getpid())
			if w.config.RFC == "3164" {
				prefix = fmt.Sprintf("<%d>%s %s %s[%d]: ", priority, timestamp.Format("Jan _2 15:04:05"), host, app, os.Getpid())
			}
			data = append([]byte(prefix), data...)
			if w.config.Protocol != "udp" {
				if w.config.Framing == "octet-counting" {
					data = append([]byte(strconv.Itoa(len(data))+" "), data...)
				} else {
					data = append(data, '\n')
				}
			}
		}
		if err = w.send(ctx, data); err != nil {
			return err
		}
	}
	return nil
}
