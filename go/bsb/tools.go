package bsb

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/rand"
	"regexp"
	"strings"
	"time"
)

// CleanStringStrength defines sanitization levels.
type CleanStringStrength int

const (
	CleanSoft   CleanStringStrength = iota // Alphanumeric, spaces, basic punctuation
	CleanHard                              // Alphanumeric only
	CleanExHard                            // Alphanumeric, no spaces
	CleanURL                               // URL-safe characters
	CleanIP                                // IP address characters
	CleanEmail                             // Email-safe characters
)

var cleanRegexes = map[CleanStringStrength]*regexp.Regexp{
	CleanSoft:   regexp.MustCompile(`[^a-zA-Z0-9 _.@\-]`),
	CleanHard:   regexp.MustCompile(`[^a-zA-Z0-9 ]`),
	CleanExHard: regexp.MustCompile(`[^a-zA-Z0-9]`),
	CleanURL:    regexp.MustCompile(`[^a-zA-Z0-9\-._~:/?#\[\]@!$&'()*+,;=%]`),
	CleanIP:     regexp.MustCompile(`[^0-9.:]`),
	CleanEmail:  regexp.MustCompile(`[^a-zA-Z0-9@._+\-]`),
}

// CleanString sanitizes a string based on the given strength.
func CleanString(s string, strength CleanStringStrength, maxLength ...int) string {
	re, ok := cleanRegexes[strength]
	if !ok {
		re = cleanRegexes[CleanSoft]
	}
	result := re.ReplaceAllString(s, "")
	if len(maxLength) > 0 && maxLength[0] > 0 && len(result) > maxLength[0] {
		result = result[:maxLength[0]]
	}
	return result
}

// AutoCapitalizeWords capitalizes the first letter of each word.
func AutoCapitalizeWords(s string) string {
	words := strings.Fields(s)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// FlattenObject converts a nested map to a single-level map with dot-notation keys.
func FlattenObject(obj map[string]any) map[string]any {
	result := make(map[string]any)
	flattenRecursive("", obj, result)
	return result
}

func flattenRecursive(prefix string, obj map[string]any, result map[string]any) {
	for k, v := range obj {
		key := k
		if prefix != "" {
			key = prefix + "." + k
		}
		if nested, ok := v.(map[string]any); ok {
			flattenRecursive(key, nested, result)
		} else {
			result[key] = v
		}
	}
}

// GenerateAppIDHash returns the first 2 characters of the SHA256 hash of the appID.
func GenerateAppIDHash(appID string) string {
	h := sha256.Sum256([]byte(appID))
	return hex.EncodeToString(h[:])[:2]
}

// GenerateTimeBasedID creates a time-based identifier with appID prefix.
func GenerateTimeBasedID(byteLength int, appID string) string {
	now := time.Now().UnixMilli()
	prefix := GenerateAppIDHash(appID)
	b := make([]byte, byteLength)
	for i := range b {
		b[i] = byte(rand.Intn(256))
	}
	return prefix + hex.EncodeToString([]byte{
		byte(now >> 40), byte(now >> 32), byte(now >> 24),
		byte(now >> 16), byte(now >> 8), byte(now),
	}) + hex.EncodeToString(b)
}

// Delay sleeps for the specified duration. Defaults to 1 second.
func Delay(d ...time.Duration) {
	dur := time.Second
	if len(d) > 0 {
		dur = d[0]
	}
	time.Sleep(dur)
}

// NormalizeAttributeKey replaces periods, colons, slashes, spaces, and hyphens
// with underscores for compatibility with observability backends.
func NormalizeAttributeKey(key string) string {
	replacer := strings.NewReplacer(
		".", "_",
		":", "_",
		"/", "_",
		" ", "_",
		"-", "_",
	)
	return replacer.Replace(key)
}

// StringReplaceWithMap replaces {key} placeholders with values from the map.
func StringReplaceWithMap(template string, values map[string]any) string {
	result := template
	for k, v := range values {
		placeholder := "{" + k + "}"
		result = strings.ReplaceAll(result, placeholder, fmt.Sprintf("%v", v))
	}
	return result
}
