package tooling

import (
	"context"
	"encoding/json"
	"fmt"
	"go/format"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
)

type Manifest struct {
	Go []struct {
		ID      string `json:"id"`
		Package string `json:"package"`
	} `json:"go"`
}

func BuildHost(ctx context.Context, cwd string) (string, error) {
	data, err := os.ReadFile(filepath.Join(cwd, "bsb-plugin.json"))
	if err != nil {
		return "", err
	}
	var manifest Manifest
	if err = json.Unmarshal(data, &manifest); err != nil {
		return "", err
	}
	imports := map[string]bool{}
	for _, entry := range manifest.Go {
		if entry.Package != "" {
			imports[entry.Package] = true
		}
	}
	if len(imports) == 0 {
		return "", fmt.Errorf("bsb-plugin.json requires Go plugin entries with package import paths")
	}
	var source strings.Builder
	source.WriteString("package main\nimport (\n\"github.com/bettercorp/service-base/go/host\"\n")
	packages := keys(imports)
	for index, pkg := range packages {
		if strings.ContainsAny(pkg, "\x00\r\n\\\" ") || strings.HasPrefix(pkg, ".") {
			return "", fmt.Errorf("invalid Go import path")
		}
		fmt.Fprintf(&source, "plugin%d %s\n", index, strconv.Quote(pkg))
	}
	source.WriteString(")\nfunc main(){registry:=host.NewRegistry();")
	for index := range packages {
		fmt.Fprintf(&source, "plugin%d.Register(registry);", index)
	}
	source.WriteString("host.Main(registry)}")
	generated, err := format.Source([]byte(source.String()))
	if err != nil {
		return "", err
	}
	directory := filepath.Join(cwd, ".bsb", "host")
	if err = os.MkdirAll(directory, 0755); err != nil {
		return "", err
	}
	if err = os.WriteFile(filepath.Join(directory, "main.go"), generated, 0644); err != nil {
		return "", err
	}
	destination := filepath.Join(cwd, "lib", "bsb")
	if runtime.GOOS == "windows" {
		destination += ".exe"
	}
	if err = os.MkdirAll(filepath.Dir(destination), 0755); err != nil {
		return "", err
	}
	command := exec.CommandContext(ctx, "go", "build", "-mod=mod", "-o", destination, "./.bsb/host")
	command.Dir = cwd
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	if err = command.Run(); err != nil {
		return "", fmt.Errorf("build BSB host: %w", err)
	}
	exported := exec.CommandContext(ctx, destination, "export")
	exported.Dir = cwd
	exported.Stderr = os.Stderr
	data, err = exported.Output()
	if err != nil {
		return "", fmt.Errorf("export linked plugin contracts: %w", err)
	}
	var contracts []map[string]any
	if err = json.Unmarshal(data, &contracts); err != nil {
		return "", err
	}
	found := map[string]bool{}
	for _, contract := range contracts {
		id, _ := contract["pluginId"].(string)
		_, name, err := ParsePluginID(id)
		if err != nil || strings.Contains(id, "/") {
			return "", fmt.Errorf("export requires a local plugin name")
		}
		if found[id] {
			return "", fmt.Errorf("duplicate exported plugin %s", id)
		}
		found[id] = true
		schema, err := json.MarshalIndent(contract, "", "  ")
		if err != nil {
			return "", err
		}
		path := filepath.Join(cwd, "lib", "schemas", name+".json")
		if err = os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return "", err
		}
		if err = os.WriteFile(path, schema, 0644); err != nil {
			return "", err
		}
	}
	for _, entry := range manifest.Go {
		if !found[entry.ID] {
			return "", fmt.Errorf("linked package did not export contract for %s", entry.ID)
		}
	}
	return destination, nil
}

func SyncClients(cwd string) ([]string, error) {
	files, err := filepath.Glob(filepath.Join(cwd, ".bsb", "schemas", "*.json"))
	if err != nil {
		return nil, err
	}
	sort.Strings(files)
	generated := map[string][]byte{}
	names := map[string]bool{}
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			return nil, err
		}
		name := strings.TrimSuffix(filepath.Base(file), ".json")
		class := identifier(name) + "Client"
		if names[class] {
			return nil, fmt.Errorf("client class collision: %s", class)
		}
		names[class] = true
		code, err := GenerateClient(data, name)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		generated[identifier(name)+".go"] = code
	}
	output := filepath.Join(cwd, "bsbclients")
	if err = os.MkdirAll(output, 0755); err != nil {
		return nil, err
	}
	written := []string{}
	for _, name := range keys(generated) {
		path := filepath.Join(output, name)
		if err = os.WriteFile(path, generated[name], 0644); err != nil {
			return nil, err
		}
		written = append(written, path)
	}
	return written, nil
}
