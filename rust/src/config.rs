use anyhow::{Context, Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{collections::BTreeMap, path::Path};
use tokio::io::AsyncReadExt;

pub const MAX_JSON: usize = 4 * 1024 * 1024;
pub fn merge(base: &Value, overlay: &Value) -> Value {
    match (base.as_object(), overlay.as_object()) {
        (Some(base), Some(overlay)) => {
            let mut result = base.clone();
            for (key, value) in overlay {
                result.insert(
                    key.clone(),
                    merge(result.get(key).unwrap_or(&Value::Null), value),
                );
            }
            Value::Object(result)
        }
        _ => overlay.clone(),
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Definition {
    pub plugin: String,
    #[serde(default)]
    pub version: String,
    pub enabled: bool,
    pub config: Value,
    #[serde(default)]
    pub filter: Value,
}
#[derive(Clone, Debug)]
pub struct Config {
    pub groups: BTreeMap<String, BTreeMap<String, Definition>>,
}
impl Config {
    pub fn load(document: &Value, profile: &str) -> Result<Self> {
        ensure!(document.is_object(), "configuration must be an object");
        let profile = if profile.is_empty() {
            "default"
        } else {
            profile
        };
        let direct = ["services", "events", "observable"]
            .iter()
            .any(|key| document.get(*key).is_some());
        let selected = if direct {
            if profile == "default" {
                document.clone()
            } else {
                let overlay = document
                    .get("profiles")
                    .and_then(|v| v.get(profile))
                    .context("unknown deployment profile")?;
                ensure!(overlay.is_object(), "profile must be an object");
                merge(document, overlay)
            }
        } else {
            let overlay = document
                .get(profile)
                .context("unknown deployment profile")?;
            ensure!(overlay.is_object(), "profile must be an object");
            merge(document.get("default").unwrap_or(&json!({})), overlay)
        };
        if let Some(language) = selected.get("language") {
            ensure!(language == "rust", "deployment profile must target rust");
        }
        let mut groups = BTreeMap::new();
        for group in ["services", "events", "observable"] {
            let mut definitions = BTreeMap::new();
            if let Some(entries) = selected.get(group) {
                for (name, raw) in entries
                    .as_object()
                    .context("plugin group must be an object")?
                {
                    ensure!(
                        !name.is_empty() && raw.is_object(),
                        "invalid plugin definition"
                    );
                    let enabled = match raw.get("enabled") {
                        None => true,
                        Some(value) => value.as_bool().context("enabled must be boolean")?,
                    };
                    if let Some(language) = raw.get("language") {
                        ensure!(
                            !enabled || language == "rust",
                            "enabled plugin {name} must target rust"
                        );
                    }
                    let plugin = match raw.get("plugin") {
                        None => name.as_str(),
                        Some(value) => {
                            value.as_str().context("plugin identity must be a string")?
                        }
                    };
                    ensure!(!plugin.is_empty(), "empty plugin identity");
                    let version = match raw.get("version") {
                        None => String::new(),
                        Some(value) => value
                            .as_str()
                            .context("plugin version must be a string")?
                            .into(),
                    };
                    let config = raw.get("config").cloned().unwrap_or_else(|| json!({}));
                    ensure!(config.is_object(), "plugin config must be an object");
                    definitions.insert(
                        name.clone(),
                        Definition {
                            plugin: plugin.into(),
                            version,
                            enabled,
                            config,
                            filter: raw.get("filter").cloned().unwrap_or(Value::Null),
                        },
                    );
                }
            }
            groups.insert(group.into(), definitions);
        }
        Ok(Self { groups })
    }
    pub fn resolve(&self, target: &str) -> Result<String> {
        let services = &self.groups["services"];
        if services
            .get(target)
            .is_some_and(|definition| definition.plugin != target)
        {
            return Ok(target.into());
        }
        let matches: Vec<_> = services
            .iter()
            .filter(|(_, value)| value.plugin == target)
            .collect();
        let enabled: Vec<_> = matches.iter().filter(|(_, value)| value.enabled).collect();
        match enabled.as_slice() {
            [(name, _)] => Ok((*name).clone()),
            [_, _, ..] => bail!("ambiguous service {target}; specify its alias"),
            [] => match matches.as_slice() {
                [] => Ok(target.into()),
                [(name, _)] => Ok((*name).clone()),
                _ => bail!("ambiguous service {target}; specify its alias"),
            },
        }
    }
}
pub async fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>> {
    let file = tokio::fs::File::open(path).await?;
    let mut bytes = Vec::new();
    file.take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .await?;
    ensure!(bytes.len() <= limit, "file exceeds size limit");
    Ok(bytes)
}
pub async fn local(cwd: &Path, provider: &str, profile: &str) -> Result<Config> {
    let data = match provider {
        "config-default" => {
            let name =
                std::env::var("BSB_CONFIG_FILE").unwrap_or_else(|_| "sec-config.json".into());
            read_bounded(&cwd.join(name), MAX_JSON).await?
        }
        "config-env" => std::env::var("BSB_CONFIG_JSON")
            .context("BSB_CONFIG_JSON required")?
            .into_bytes(),
        _ => bail!("unknown local configuration provider"),
    };
    ensure!(data.len() <= MAX_JSON, "configuration exceeds 4 MiB");
    Config::load(&serde_json::from_slice(&data)?, profile)
}
