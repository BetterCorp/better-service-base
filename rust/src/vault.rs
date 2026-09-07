use crate::{
    config::{Config, merge, read_bounded},
    http,
};
use aes_gcm::{
    Aes256Gcm, Nonce,
    aead::{Aead, KeyInit, OsRng, Payload, rand_core::RngCore},
};
use anyhow::{Context, Result, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use google_cloud_auth::credentials::idtoken;
use reqwest::{
    Method,
    header::{HeaderMap, HeaderValue},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::io::AsyncWriteExt;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    language: String,
    profile: String,
    application: String,
    group: String,
    version: u64,
    config: Value,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Cached {
    fetched_at: chrono::DateTime<chrono::Utc>,
    response: Response,
}
#[derive(Serialize, Deserialize)]
struct Envelope {
    iv: String,
    data: String,
}
pub struct Vault {
    endpoint: reqwest::Url,
    key_id: String,
    secret: String,
    cache_dir: PathBuf,
    timeout: Duration,
    stale: chrono::Duration,
    audience: Option<String>,
}
impl Vault {
    pub fn new(cwd: &Path, raw: &Value, google: bool) -> Result<Self> {
        let setting = |key: &str| -> String {
            raw.get(key)
                .map(|v| {
                    v.as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| v.to_string())
                })
                .unwrap_or_else(|| std::env::var(key).unwrap_or_default())
        };
        let duration = |key: &str, default: i64, min: i64, max: i64| -> Result<i64> {
            let value = setting(key);
            let value = if value.is_empty() {
                default
            } else {
                value.parse()?
            };
            ensure!((min..=max).contains(&value), "invalid {key}");
            Ok(value)
        };
        let endpoint = http::origin(&setting("vaultUrl"), setting("allowInsecureHttp") == "true")?;
        let key_id = setting("apiKeyId");
        let secret = setting("apiSecret");
        let audience = if google {
            Some(setting("googleAudience"))
        } else {
            None
        };
        ensure!(
            !key_id.is_empty()
                && !secret.is_empty()
                && audience.as_ref().is_none_or(|v| !v.is_empty()),
            "Vault credentials and Google audience required"
        );
        let cache = setting("cacheDir");
        let cache_dir = if cache.is_empty() {
            cwd.join(".bsb/config-vault")
        } else {
            cwd.join(cache)
        };
        Ok(Self {
            endpoint,
            key_id,
            secret,
            cache_dir,
            timeout: Duration::from_millis(duration("timeoutMs", 5000, 1000, 60000)? as u64),
            stale: chrono::Duration::hours(duration("staleAllowedHours", 24, 0, 8760)?),
            audience,
        })
    }
    fn binding(&self) -> Vec<u8> {
        format!(
            "{}\n{}\nrust",
            self.endpoint.as_str().trim_end_matches('/'),
            self.key_id
        )
        .into_bytes()
    }
    fn cipher(&self) -> Result<Aes256Gcm> {
        let mut key = [0u8; 32];
        hkdf::Hkdf::<Sha256>::new(Some(&self.binding()), self.secret.as_bytes())
            .expand(b"BSB config-vault cache v1", &mut key)
            .map_err(|_| anyhow::anyhow!("cache key derivation failed"))?;
        Ok(Aes256Gcm::new_from_slice(&key)?)
    }
    fn cache_path(&self) -> PathBuf {
        let hash = Sha256::digest(self.binding());
        let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
        self.cache_dir.join(format!("{hex}.json"))
    }
    async fn fetch(&self) -> Result<Response> {
        let client = http::client(self.timeout)?;
        let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
        let mut credentials = None;
        let mut refreshed = false;
        loop {
            let mut headers = HeaderMap::new();
            headers.insert("x-vault-key-id", HeaderValue::from_str(&self.key_id)?);
            headers.insert("x-vault-secret", HeaderValue::from_str(&self.secret)?);
            if let Some(audience) = &self.audience {
                if credentials.is_none() {
                    credentials = Some(
                        idtoken::Builder::new(audience)
                            .build()
                            .context("Google identity unavailable")?,
                    )
                }
                let token =
                    tokio::time::timeout_at(deadline, credentials.as_ref().unwrap().id_token())
                        .await
                        .context("Google identity deadline exceeded")??;
                headers.insert(
                    "x-serverless-authorization",
                    HeaderValue::from_str(&format!("Bearer {token}"))?,
                );
            }
            let response = tokio::time::timeout_at(
                deadline,
                http::request(
                    &client,
                    Method::GET,
                    self.endpoint.join("runtime/config")?,
                    headers,
                    None,
                    crate::config::MAX_JSON,
                ),
            )
            .await;
            let error = match response {
                Ok(Ok(value)) => return Ok(serde_json::from_value(value)?),
                Ok(Err(error)) => error,
                Err(_) => return Err(http::Status(504).into()),
            };
            if self.audience.is_some()
                && !refreshed
                && error
                    .downcast_ref::<http::Status>()
                    .is_some_and(|s| s.0 == 401 || s.0 == 403)
            {
                credentials = None;
                refreshed = true;
                continue;
            }
            if !http::retryable(&error) || tokio::time::Instant::now() >= deadline {
                return Err(error);
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    }
    fn apply(&self, response: &Response, overrides: &str) -> Result<Config> {
        ensure!(
            response.language == "rust" && response.version > 0 && response.config.is_object(),
            "invalid Vault deployment language or response"
        );
        for value in [&response.profile, &response.application, &response.group] {
            ensure!(
                !value.is_empty() && value.len() <= 100,
                "invalid Vault deployment identity"
            );
        }
        let mut document = response.config.clone();
        apply_overrides(&mut document, &response.profile, overrides)?;
        let config = Config::load(&document, &response.profile)?;
        ensure!(
            config.groups["services"].values().any(|v| v.enabled),
            "Vault requires an enabled service"
        );
        Ok(config)
    }
    pub async fn load(&self) -> Result<Config> {
        let overrides = std::env::var("BSB_CONFIG_OVERRIDES").unwrap_or_default();
        match self.fetch().await {
            Ok(response) => {
                let config = self.apply(&response, &overrides)?;
                if self.write_cache(response).await.is_err() {
                    eprintln!("BSB Vault: encrypted cache write failed")
                };
                Ok(config)
            }
            Err(error) => {
                if !http::retryable(&error) || self.stale <= chrono::Duration::zero() {
                    return Err(error);
                }
                let response = self
                    .read_cache()
                    .await
                    .context("Vault unavailable and cache unusable")?;
                let config = self.apply(&response, &overrides)?;
                eprintln!("BSB Vault: using encrypted cached configuration");
                Ok(config)
            }
        }
    }
    async fn write_cache(&self, response: Response) -> Result<()> {
        let bytes = serde_json::to_vec(&Cached {
            fetched_at: chrono::Utc::now(),
            response,
        })?;
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let ciphertext = self
            .cipher()?
            .encrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &bytes,
                    aad: &self.binding(),
                },
            )
            .map_err(|_| anyhow::anyhow!("cache encryption failed"))?;
        atomic_write(
            &self.cache_path(),
            &serde_json::to_vec(&Envelope {
                iv: STANDARD.encode(nonce),
                data: STANDARD.encode(ciphertext),
            })?,
        )
        .await
    }
    async fn read_cache(&self) -> Result<Response> {
        let envelope: Envelope =
            serde_json::from_slice(&read_bounded(&self.cache_path(), 6 * 1024 * 1024).await?)?;
        let nonce = STANDARD.decode(envelope.iv)?;
        ensure!(nonce.len() == 12, "invalid cache nonce");
        let bytes = self
            .cipher()?
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &STANDARD.decode(envelope.data)?,
                    aad: &self.binding(),
                },
            )
            .map_err(|_| anyhow::anyhow!("cache authentication failed"))?;
        let cached: Cached = serde_json::from_slice(&bytes)?;
        let age = chrono::Utc::now() - cached.fetched_at;
        ensure!(
            age >= chrono::Duration::zero() && age <= self.stale,
            "cache expired or clock moved backwards"
        );
        Ok(cached.response)
    }
}
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
pub fn apply_overrides(document: &mut Value, profile: &str, raw: &str) -> Result<()> {
    if raw.is_empty() {
        return Ok(());
    }
    ensure!(raw.len() <= 128 * 1024, "overrides exceed size limit");
    let patch: Value = serde_json::from_str(raw)?;
    fn safe(value: &Value, depth: usize, nodes: &mut usize) -> Result<()> {
        *nodes += 1;
        ensure!(
            depth <= 64 && *nodes <= 10000,
            "override complexity limit exceeded"
        );
        match value {
            Value::Object(values) => {
                for (key, child) in values {
                    ensure!(
                        !["__proto__", "prototype", "constructor"].contains(&key.as_str()),
                        "forbidden override key"
                    );
                    safe(child, depth + 1, nodes)?
                }
            }
            Value::Array(values) => {
                for child in values {
                    safe(child, depth + 1, nodes)?
                }
            }
            _ => {}
        }
        Ok(())
    }
    safe(&patch, 0, &mut 0)?;
    fn allowed(value: &Value, prefix: &str, paths: &BTreeSet<String>) -> Result<()> {
        for (key, value) in value.as_object().context("override must be an object")? {
            let path = format!("{prefix}{key}");
            if paths.contains(&path) {
                continue;
            }
            ensure!(
                value.as_object().is_some_and(|v| !v.is_empty()),
                "override path not permitted: {path}"
            );
            allowed(value, &format!("{path}."), paths)?
        }
        Ok(())
    }
    let selected = document
        .get_mut(profile)
        .context("unknown override profile")?;
    for (group, plugins) in patch.as_object().context("overrides must be an object")? {
        ensure!(
            ["services", "events", "observable"].contains(&group.as_str()),
            "invalid override group"
        );
        for (name, fields) in plugins.as_object().context("invalid override plugins")? {
            let entry = selected
                .get_mut(group)
                .and_then(|v| v.get_mut(name))
                .context("unknown override plugin")?;
            let paths: BTreeSet<String> = serde_json::from_value(
                entry
                    .get("envOverridePaths")
                    .context("overrides not permitted")?
                    .clone(),
            )?;
            allowed(fields, "", &paths)?;
            entry["config"] = merge(entry.get("config").unwrap_or(&json!({})), fields);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn atomic_write_replaces_existing_file() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("cache.json");
        tokio::fs::write(&path, b"previous contents").await?;
        atomic_write(&path, b"current").await?;
        assert_eq!(tokio::fs::read(path).await?, b"current");
        Ok(())
    }
    #[tokio::test]
    async fn cached_config_does_not_mask_authentication_or_invalid_responses() -> Result<()> {
        use tokio::{
            io::{AsyncReadExt, AsyncWriteExt},
            net::TcpListener,
        };
        for (status, body) in [
            (403, "{}"),
            (200, "{invalid"),
            (
                200,
                r#"{"language":"go","profile":"default","application":"app","group":"group","version":1,"config":{}}"#,
            ),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").await?;
            let address = listener.local_addr()?;
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await?;
                let mut headers = vec![];
                while !headers.ends_with(b"\r\n\r\n") {
                    headers.push(socket.read_u8().await?);
                    ensure!(headers.len() < 16384, "header limit");
                }
                let headers = String::from_utf8(headers)?;
                assert!(headers.starts_with("GET /runtime/config "));
                assert!(headers.contains("x-vault-key-id: key"));
                socket.write_all(format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await?;
                Ok::<_, anyhow::Error>(())
            });
            let dir = tempfile::tempdir()?;
            let vault = Vault::new(
                dir.path(),
                &json!({"vaultUrl":format!("http://{address}"),"allowInsecureHttp":true,"apiKeyId":"key","apiSecret":"secret"}),
                false,
            )?;
            vault
                .write_cache(Response {
                    language: "rust".into(),
                    profile: "default".into(),
                    application: "app".into(),
                    group: "group".into(),
                    version: 1,
                    config: json!({"default":{"services":{"worker":{}}}}),
                })
                .await?;
            assert!(
                tokio::time::timeout(Duration::from_secs(2), vault.load())
                    .await?
                    .is_err()
            );
            server.await??;
        }
        Ok(())
    }
    #[tokio::test]
    async fn cache_authentication_language_and_override_policy() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let raw = json!({"vaultUrl":"https://vault.example","apiKeyId":"key","apiSecret":"secret"});
        let vault = Vault::new(dir.path(), &raw, false)?;
        let response = Response {
            language: "rust".into(),
            profile: "default".into(),
            application: "app".into(),
            group: "group".into(),
            version: 1,
            config: json!({"default":{"services":{"worker":{"config":{"count":1},"envOverridePaths":["count"]}}}}),
        };
        vault.write_cache(response.clone()).await?;
        let cached = vault.read_cache().await?;
        assert_eq!(cached.config, response.config);
        let mut changed = raw.clone();
        changed["apiSecret"] = json!("wrong");
        assert!(
            Vault::new(dir.path(), &changed, false)?
                .read_cache()
                .await
                .is_err()
        );
        let mut other = response.clone();
        other.language = "go".into();
        assert!(vault.apply(&other, "").is_err());
        assert_eq!(
            vault
                .apply(&response, r#"{"services":{"worker":{"count":2}}}"#)?
                .groups["services"]["worker"]
                .config["count"],
            2
        );
        assert!(
            vault
                .apply(&response, r#"{"services":{"worker":{"enabled":false}}}"#)
                .is_err()
        );
        let path = vault.cache_path();
        let mut envelope: Envelope = serde_json::from_slice(&tokio::fs::read(&path).await?)?;
        envelope.data = "AAAA".into();
        tokio::fs::write(path, serde_json::to_vec(&envelope)?).await?;
        assert!(vault.read_cache().await.is_err());
        Ok(())
    }
}
