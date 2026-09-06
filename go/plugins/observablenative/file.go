package observablenative

import (
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type rotatingFile struct {
	mu      sync.Mutex
	path    string
	options config
	file    *os.File
	opened  time.Time
	size    int64
}

func newRotatingFile(path string, options config) (*rotatingFile, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}
	return &rotatingFile{path: path, options: options, file: file, opened: info.ModTime(), size: info.Size()}, nil
}
func (f *rotatingFile) write(data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.file == nil {
		return fmt.Errorf("log file closed")
	}
	interval := time.Duration(0)
	if f.options.Interval == "hourly" {
		interval = time.Hour
	}
	if f.options.Interval == "daily" {
		interval = 24 * time.Hour
	}
	if f.size > 0 && (f.size+int64(len(data)) > f.options.MaxBytes || (interval > 0 && time.Since(f.opened) >= interval)) {
		if err := f.rotate(); err != nil {
			return err
		}
	}
	n, err := f.file.Write(data)
	f.size += int64(n)
	return err
}
func (f *rotatingFile) rotate() error {
	if err := f.file.Close(); err != nil {
		return err
	}
	f.file = nil
	archive := fmt.Sprintf("%s.bsb-%020d", f.path, time.Now().UnixNano())
	if err := os.Rename(f.path, archive); err != nil {
		return err
	}
	if f.options.Compress {
		incoming, err := os.Open(archive)
		if err != nil {
			return err
		}
		out, err := os.OpenFile(archive+".gz", os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			incoming.Close()
			return err
		}
		compressed := gzip.NewWriter(out)
		_, copyErr := io.Copy(compressed, incoming)
		zipErr := compressed.Close()
		closeErr := out.Close()
		incoming.Close()
		if copyErr != nil || zipErr != nil || closeErr != nil {
			return fmt.Errorf("log compression failed")
		}
		if err = os.Remove(archive); err != nil {
			return err
		}
	}
	var err error
	f.file, err = os.OpenFile(f.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	f.opened = time.Now()
	f.size = 0
	if f.options.MaxFiles > 0 {
		entries, err := os.ReadDir(filepath.Dir(f.path))
		if err != nil {
			return err
		}
		archives := []string{}
		prefix := filepath.Base(f.path) + ".bsb-"
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasPrefix(entry.Name(), prefix) {
				continue
			}
			suffix := strings.TrimSuffix(strings.TrimPrefix(entry.Name(), prefix), ".gz")
			if len(suffix) != 20 {
				continue
			}
			if _, err := strconv.ParseInt(suffix, 10, 64); err != nil {
				continue
			}
			archives = append(archives, filepath.Join(filepath.Dir(f.path), entry.Name()))
		}
		sort.Strings(archives)
		for len(archives) > f.options.MaxFiles {
			if err = os.Remove(archives[0]); err != nil {
				return err
			}
			archives = archives[1:]
		}
	}
	return nil
}
func (f *rotatingFile) close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.file == nil {
		return nil
	}
	err := f.file.Close()
	f.file = nil
	return err
}
