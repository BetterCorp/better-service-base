// Generate example clients from the shared, versioned portable contracts.
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/bettercorp/service-base/go/tooling"
)

func main() {
	if err := generate(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func generate() error {
	files, err := filepath.Glob(filepath.Join("..", "..", "contracts", "examples", "*.json"))
	if err != nil {
		return err
	}
	if len(files) == 0 {
		return fmt.Errorf("shared example contracts are missing")
	}
	output := filepath.Join(".bsb", "schemas")
	if err := os.MkdirAll(output, 0755); err != nil {
		return err
	}
	for _, source := range files {
		data, err := os.ReadFile(source)
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(output, filepath.Base(source)), data, 0644); err != nil {
			return err
		}
	}
	_, err = tooling.SyncClients(".")
	return err
}
