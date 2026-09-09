package observablenative

import (
	"compress/gzip"
	"errors"
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
	closed  bool
}

func newRotatingFile(path string, options config) (*rotatingFile, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0750); err != nil {
		return nil, err
	}
	f := &rotatingFile{path: path, options: options}
	if err := f.open(); err != nil {
		return nil, err
	}
	return f, nil
}
func (f *rotatingFile) open() error {
	file, err := os.OpenFile(f.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return err
	}
	f.file, f.opened, f.size = file, info.ModTime(), info.Size()
	return nil
}
func (f *rotatingFile) write(data []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.closed {
		return fmt.Errorf("log file closed")
	}
	if f.file == nil {
		if err := f.open(); err != nil {
			return err
		}
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
func (f *rotatingFile) rotate() (err error) {
	defer func() {
		if f.file == nil {
			err = errors.Join(err, f.open())
		}
	}()
	err = f.file.Close()
	f.file = nil
	if err != nil {
		return err
	}
	archive := fmt.Sprintf("%s.bsb-%020d", f.path, time.Now().UnixNano())
	if err := os.Rename(f.path, archive); err != nil {
		return err
	}
	// Keep the active path writable even if archive processing fails.
	if err := f.open(); err != nil {
		return err
	}
	if f.options.Compress {
		if err = compressLogArchive(archive); err != nil {
			return err
		}
		if err = os.Remove(archive); err != nil {
			return err
		}
	}
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

func compressLogArchive(archive string) (err error) {
	incoming, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer incoming.Close()
	path := archive + ".gz"
	out, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			err = errors.Join(err, os.Remove(path))
		}
	}()
	compressed := gzip.NewWriter(out)
	_, copyErr := io.Copy(compressed, incoming)
	err = errors.Join(copyErr, compressed.Close(), out.Close())
	if err != nil {
		return fmt.Errorf("log compression failed: %w", err)
	}
	return nil
}

func (f *rotatingFile) close() error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.closed = true
	if f.file == nil {
		return nil
	}
	err := f.file.Close()
	f.file = nil
	return err
}
