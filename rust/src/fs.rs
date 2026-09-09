use anyhow::{Context, Result};
use std::path::Path;
use tokio::io::AsyncWriteExt;

pub async fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().context("file parent required")?;
    tokio::fs::create_dir_all(parent).await?;
    let temporary = parent.join(format!(".bsb-{}", uuid::Uuid::new_v4()));
    let result = async {
        let mut options = tokio::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        options.mode(0o600);
        let mut file = options.open(&temporary).await?;
        file.write_all(bytes).await?;
        file.sync_all().await?;
        drop(file);
        tokio::fs::rename(&temporary, path).await?;
        Ok::<_, anyhow::Error>(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn atomic_write_replaces_existing_file_without_temporary_files() -> Result<()> {
        let directory = tempfile::tempdir()?;
        let path = directory.path().join("state.json");
        atomic_write(&path, b"old").await?;
        atomic_write(&path, b"new").await?;
        assert_eq!(tokio::fs::read(&path).await?, b"new");
        assert_eq!(std::fs::read_dir(directory.path())?.count(), 1);
        Ok(())
    }
}
