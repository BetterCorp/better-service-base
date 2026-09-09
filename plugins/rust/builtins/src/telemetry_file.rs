use crate::telemetry::Options;
use anyhow::{Context, Result};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

pub(super) struct RotatingFile {
    path: PathBuf,
    options: Options,
    file: Option<File>,
    opened: SystemTime,
    size: u64,
}
impl RotatingFile {
    fn open(path: &Path) -> Result<File> {
        let mut options = OpenOptions::new();
        options.create(true).append(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        Ok(options.open(path)?)
    }
    pub fn new(path: &str, options: Options) -> Result<Self> {
        let path = PathBuf::from(path);
        fs::create_dir_all(path.parent().unwrap_or(Path::new(".")))?;
        let file = Self::open(&path)?;
        let meta = file.metadata()?;
        Ok(Self {
            path,
            options,
            file: Some(file),
            opened: meta.modified().unwrap_or_else(|_| SystemTime::now()),
            size: meta.len(),
        })
    }
    pub fn write(&mut self, data: &[u8]) -> Result<()> {
        let interval = match self.options.interval.as_str() {
            "hourly" => Some(Duration::from_secs(3600)),
            "daily" => Some(Duration::from_secs(86400)),
            _ => None,
        };
        if self.size > 0
            && (self.size + data.len() as u64 + 1 > self.options.max_bytes
                || interval.is_some_and(|interval| {
                    self.opened
                        .elapsed()
                        .is_ok_and(|elapsed| elapsed >= interval)
                }))
        {
            self.rotate()?;
        }
        let file = self.file.as_mut().context("log file closed")?;
        file.write_all(data)?;
        file.write_all(b"\n")?;
        self.size += data.len() as u64 + 1;
        Ok(())
    }
    fn rotate(&mut self) -> Result<()> {
        self.close()?;
        let archive = PathBuf::from(format!(
            "{}.bsb-{:020}",
            self.path.display(),
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)?
                .as_nanos()
        ));
        fs::rename(&self.path, &archive)?;
        // Reopen before compression so an archive failure cannot disable future logging.
        self.file = Some(Self::open(&self.path)?);
        self.opened = SystemTime::now();
        self.size = 0;
        if self.options.compress {
            compress_archive(&archive, |source, output| {
                let mut encoder =
                    flate2::write::GzEncoder::new(output, flate2::Compression::default());
                std::io::copy(source, &mut encoder)?;
                encoder.finish()?.sync_all()?;
                Ok(())
            })?;
        }
        if self.options.max_files > 0 {
            let prefix = format!(
                "{}.bsb-",
                self.path
                    .file_name()
                    .context("log filename required")?
                    .to_string_lossy()
            );
            let mut archives = Vec::new();
            for entry in fs::read_dir(self.path.parent().unwrap_or(Path::new(".")))? {
                let entry = entry?;
                if !entry.file_type()?.is_file() {
                    continue;
                }
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if let Some(suffix) = name.strip_prefix(&prefix) {
                    let suffix = suffix.strip_suffix(".gz").unwrap_or(suffix);
                    if suffix.len() == 20 && suffix.bytes().all(|c| c.is_ascii_digit()) {
                        archives.push(entry.path())
                    }
                }
            }
            archives.sort();
            let remove = archives.len().saturating_sub(self.options.max_files);
            for path in archives.into_iter().take(remove) {
                fs::remove_file(path)?;
            }
        }
        Ok(())
    }
    pub fn close(&mut self) -> Result<()> {
        if let Some(file) = self.file.take() {
            file.sync_all()?;
        }
        Ok(())
    }
}

fn compress_archive(
    archive: &Path,
    compress: impl FnOnce(&mut File, File) -> Result<()>,
) -> Result<()> {
    let mut source = File::open(archive)?;
    let compressed = PathBuf::from(format!("{}.gz", archive.display()));
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let output = options.open(&compressed)?;
    if let Err(error) = compress(&mut source, output) {
        fs::remove_file(&compressed).context("failed to remove partial gzip archive")?;
        return Err(error);
    }
    drop(source);
    fs::remove_file(archive)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use anyhow::bail;

    #[test]
    fn compression_failure_removes_partial_and_preserves_source() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let archive = directory
            .path()
            .join("application.log.bsb-00000000000000000001");
        fs::write(&archive, b"complete source")?;
        assert!(
            compress_archive(&archive, |_, mut output| {
                output.write_all(b"partial")?;
                bail!("injected compression failure")
            })
            .is_err()
        );
        assert_eq!(fs::read(&archive)?, b"complete source");
        assert!(!PathBuf::from(format!("{}.gz", archive.display())).exists());
        Ok(())
    }
}
