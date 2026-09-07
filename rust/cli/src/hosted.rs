use crate::tooling::{exact_version, install_schema, plugin_id, source_language};
use anyhow::{Context, Result, ensure};
use bsb::{config::MAX_JSON, http};
use reqwest::{Method, Url, header::HeaderMap};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, path::Path, time::Duration};

#[derive(Deserialize)]
struct Discovery {
    bsb: u64,
    plugins: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
    id: String,
    language: String,
    version: String,
    schema: Value,
}

pub struct HostedClient {
    origin: Url,
    canonical_origin: String,
}

impl HostedClient {
    pub fn new(origin: &str, allow_http: bool) -> Result<Self> {
        let mut origin = http::origin(origin, allow_http)?;
        if let Some(host) = origin.host_str() {
            origin.set_host(Some(&host.to_ascii_lowercase()))?;
        }
        if matches!(
            (origin.scheme(), origin.port()),
            ("http", Some(80)) | ("https", Some(443))
        ) {
            ensure!(origin.set_port(None).is_ok(), "invalid hosted origin port");
        }
        let canonical_origin = origin.as_str().trim_end_matches('/').to_owned();
        Ok(Self {
            origin,
            canonical_origin,
        })
    }

    async fn request(&self, url: Url) -> Result<Value> {
        http::request(
            &http::client(Duration::from_secs(10))?,
            Method::GET,
            url,
            HeaderMap::new(),
            None,
            MAX_JSON,
        )
        .await
    }

    fn valid_entry(entry: &Entry) -> Result<(String, String, String)> {
        let (org, name) = plugin_id(&entry.id)?;
        let language = source_language(&entry.language)?;
        ensure!(
            exact_version(&entry.version),
            "exact semantic version required"
        );
        Ok((org, name, language))
    }

    fn schema_url(&self, link: &str) -> Result<Url> {
        let url = self.origin.join(".well-known/bsb")?.join(link)?;
        ensure!(
            url.origin() == self.origin.origin()
                && url.username().is_empty()
                && url.password().is_none()
                && url.fragment().is_none(),
            "schema link must remain on the hosted origin"
        );
        Ok(url)
    }

    pub async fn install(
        &self,
        cwd: &Path,
        selected: Option<&str>,
        source: Option<&str>,
        version: Option<&str>,
    ) -> Result<Vec<std::path::PathBuf>> {
        let discovery: Discovery =
            serde_json::from_value(self.request(self.origin.join(".well-known/bsb")?).await?)?;
        ensure!(discovery.bsb == 1, "unsupported hosted discovery version");
        ensure!(discovery.plugins.len() <= 128, "too many hosted plugins");
        let selected = selected.map(plugin_id).transpose()?;
        let source = source.map(source_language).transpose()?;
        if let Some(version) = version {
            ensure!(exact_version(version), "exact semantic version required");
        }
        let mut identities = BTreeSet::new();
        let mut matches = Vec::new();
        for entry in &discovery.plugins {
            let (org, name, language) = Self::valid_entry(entry)?;
            ensure!(
                entry.schema.is_object() || entry.schema.is_string(),
                "hosted schema must be an object or link"
            );
            ensure!(
                identities.insert((
                    org.clone(),
                    name.clone(),
                    language.clone(),
                    entry.version.clone(),
                )),
                "duplicate hosted plugin identity"
            );
            if selected
                .as_ref()
                .is_none_or(|(selected_org, selected_name)| {
                    selected_org == &org && selected_name == &name
                })
                && source.as_deref().is_none_or(|value| value == language)
                && version.is_none_or(|value| value == entry.version)
            {
                matches.push((entry, org, name, language));
            }
        }
        ensure!(
            matches.len() == 1,
            "hosted plugin selection is ambiguous or absent"
        );
        let (entry, org, name, language) = matches.pop().unwrap();
        let mut schema = match &entry.schema {
            Value::Object(_) => entry.schema.clone(),
            Value::String(link) => self.request(self.schema_url(link)?).await?,
            _ => anyhow::bail!("hosted schema must be an object or link"),
        };
        ensure!(
            schema.get("events").is_some_and(Value::is_object),
            "hosted schema events required"
        );
        if schema.get("pluginId").is_none() {
            schema["pluginId"] = schema
                .get("pluginName")
                .cloned()
                .unwrap_or_else(|| json!(name));
        }
        let target = schema["pluginId"]
            .as_str()
            .context("hosted schema plugin ID required")?;
        let (_, target_name) = plugin_id(target)?;
        ensure!(
            target_name == target,
            "hosted schema plugin ID must be unqualified"
        );
        if let Some(version) = schema.get("version") {
            ensure!(
                version.as_str() == Some(entry.version.as_str()),
                "hosted schema version must match discovery"
            );
        } else {
            schema["version"] = json!(entry.version);
        }
        schema["source"] = json!({
            "url": self.canonical_origin,
            "org": org,
            "name": name,
            "language": language,
            "version": entry.version,
        });
        let hash = format!("{:x}", Sha256::digest(self.canonical_origin.as_bytes()));
        let local = format!("hosted~{}~{org}~{name}~{language}", &hash[..16]);
        install_schema(cwd, &schema, &local).await
    }
}
