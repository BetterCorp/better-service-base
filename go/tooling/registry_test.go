package tooling

import (
	"encoding/json"
	"os"
	"testing"
)

func TestVersionPatternUsesStrictSemVer(t *testing.T) {
	data, err := os.ReadFile("../../tests/fixtures/semver-versions.json")
	if err != nil {
		t.Fatal(err)
	}
	var versions struct {
		Valid   []string `json:"valid"`
		Invalid []string `json:"invalid"`
	}
	if err := json.Unmarshal(data, &versions); err != nil {
		t.Fatal(err)
	}
	for _, version := range versions.Valid {
		if !versionPattern.MatchString(version) {
			t.Errorf("valid SemVer rejected: %q", version)
		}
	}
	for _, version := range versions.Invalid {
		if versionPattern.MatchString(version) {
			t.Errorf("invalid SemVer accepted: %q", version)
		}
	}
}
