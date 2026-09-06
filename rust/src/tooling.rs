use crate::{
    config::{MAX_JSON, read_bounded},
    contract::Contract,
    generator, http,
    vault::atomic_write,
};
use anyhow::{Context, Result, bail, ensure};
use reqwest::{
    Method, Url,
    header::{HeaderMap, HeaderValue},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    time::Duration,
};
use tokio::process::Command;

#[derive(Deserialize)]
struct Manifest {
    rust: Vec<Entry>,
}
#[derive(Deserialize)]
struct Entry {
    id: String,
    #[serde(rename = "crate")]
    package: String,
}
pub fn plugin_id(id: &str) -> Result<(String, String)> {
    ensure!(!id.is_empty() && id.len() <= 200, "invalid plugin ID");
    let parts: Vec<_> = id.split('/').collect();
    ensure!(parts.len() <= 2, "invalid plugin ID");
    for part in &parts {
        let raw = part.strip_prefix('@').unwrap_or(part);
        ensure!(
            !raw.is_empty() && raw.as_bytes()[0].is_ascii_alphanumeric() || raw.starts_with('_'),
            "invalid plugin ID"
        );
        ensure!(
            raw.bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c)),
            "invalid plugin ID"
        );
    }
    Ok(if parts.len() == 1 {
        ("_".into(), parts[0].into())
    } else {
        (parts[0].into(), parts[1].into())
    })
}
fn source_language(value: &str) -> Result<String> {
    let language = if value == "dotnet" { "csharp" } else { value };
    ensure!(
        ["nodejs", "csharp", "python", "go", "rust", "java"].contains(&language),
        "unsupported implementation language"
    );
    Ok(language.into())
}
fn exact_version(value: &str) -> bool {
    let core = value.split(['-', '+']).next().unwrap_or_default();
    let parts: Vec<_> = core.split('.').collect();
    parts.len() == 3
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|c| c.is_ascii_digit()))
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-+".contains(&c))
}
pub struct RegistryClient {
    origin: Url,
    token: String,
}
impl RegistryClient {
    pub fn new(endpoint: Option<&str>, token: Option<&str>, allow_http: bool) -> Result<Self> {
        let endpoint = endpoint.map(str::to_owned).unwrap_or_else(|| {
            std::env::var("BSB_REGISTRY_URL").unwrap_or_else(|_| "https://io.bsbcode.dev".into())
        });
        Ok(Self {
            origin: http::origin(&endpoint, allow_http)?,
            token: token
                .map(str::to_owned)
                .unwrap_or_else(|| std::env::var("BSB_REGISTRY_TOKEN").unwrap_or_default()),
        })
    }
    async fn request(
        &self,
        method: Method,
        segments: &[&str],
        query: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Result<Value> {
        let mut url = self.origin.clone();
        url.path_segments_mut()
            .map_err(|_| anyhow::anyhow!("invalid Registry origin"))?
            .clear()
            .extend(segments);
        url.query_pairs_mut().extend_pairs(query.iter().copied());
        let mut headers = HeaderMap::new();
        if !self.token.is_empty() {
            headers.insert(
                "authorization",
                HeaderValue::from_str(&format!("Bearer {}", self.token))?,
            );
        }
        http::request(
            &http::client(Duration::from_secs(10))?,
            method,
            url,
            headers,
            body,
            MAX_JSON,
        )
        .await
    }
    async fn language(&self, id: &str, source: Option<&str>) -> Result<String> {
        if let Some(source) = source {
            return source_language(source);
        }
        let (org, name) = plugin_id(id)?;
        let response = self
            .request(
                Method::GET,
                &["plugins", &org, &name, "implementations"],
                &[],
                None,
            )
            .await?;
        let entries = response["implementations"]
            .as_array()
            .context("implementation list required")?;
        ensure!(
            entries.len() == 1,
            "specify --source-language when implementation is ambiguous"
        );
        source_language(
            entries[0]["language"]
                .as_str()
                .context("implementation language required")?,
        )
    }
    pub async fn info(&self, id: &str, source: Option<&str>) -> Result<Value> {
        let (org, name) = plugin_id(id)?;
        let source = self.language(id, source).await?;
        self.request(
            Method::GET,
            &["plugins", &org, &name],
            &[("language", &source)],
            None,
        )
        .await
    }
    pub async fn schema(
        &self,
        id: &str,
        source: Option<&str>,
        version: Option<&str>,
    ) -> Result<Value> {
        let (org, name) = plugin_id(id)?;
        let source = self.language(id, source).await?;
        let version = if let Some(version) = version {
            version.into()
        } else {
            let info = self.info(id, Some(&source)).await?;
            info.get("plugin").unwrap_or(&info)["version"]
                .as_str()
                .context("exact version required")?
                .to_owned()
        };
        ensure!(exact_version(&version), "exact semantic version required");
        let mut schema = self
            .request(
                Method::GET,
                &["plugins", &org, &name, &version, "schema"],
                &[("language", &source)],
                None,
            )
            .await?;
        ensure!(schema.is_object(), "schema response must be an object");
        schema["pluginId"] = json!(name);
        schema["source"] = json!({"registry":self.origin.as_str().trim_end_matches('/'),"org":org,"name":name,"language":source,"version":version});
        Ok(schema)
    }
    pub async fn install(
        &self,
        cwd: &Path,
        id: &str,
        source: Option<&str>,
        version: Option<&str>,
    ) -> Result<Vec<PathBuf>> {
        let schema = self.schema(id, source, version).await?;
        let (org, name) = plugin_id(id)?;
        let language = schema["source"]["language"]
            .as_str()
            .context("source language required")?;
        let name = format!("{org}~{name}~{language}");
        let data = serde_json::to_string_pretty(&schema)?;
        generator::generate(&data, &name)?;
        let directory = cwd.join(".bsb/schemas");
        match tokio::fs::read_dir(&directory).await {
            Ok(mut entries) => {
                while let Some(entry) = entries.next_entry().await? {
                    let path = entry.path();
                    if path.extension().is_none_or(|v| v != "json") {
                        continue;
                    }
                    let existing = path
                        .file_stem()
                        .and_then(|v| v.to_str())
                        .context("invalid snapshot name")?;
                    ensure!(
                        existing == name || generator::snake(existing) != generator::snake(&name),
                        "installed client names collide"
                    );
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        atomic_write(
            &cwd.join(".bsb/schemas").join(format!("{name}.json")),
            data.as_bytes(),
        )
        .await?;
        sync_clients(cwd).await
    }
    pub async fn publish(
        &self,
        cwd: &Path,
        org: &str,
        selected: Option<&str>,
        vault: bool,
    ) -> Result<Value> {
        ensure!(!self.token.is_empty(), "Registry token required");
        build_host(cwd).await?;
        let manifest: Manifest =
            serde_json::from_slice(&read_bounded(&cwd.join("bsb-plugin.json"), MAX_JSON).await?)?;
        let mut results = Vec::new();
        for entry in manifest.rust {
            if selected.is_some_and(|id| id != entry.id) {
                continue;
            }
            let data = read_bounded(
                &cwd.join("lib/schemas").join(format!("{}.json", entry.id)),
                MAX_JSON,
            )
            .await?;
            let contract: Contract = serde_json::from_slice(&data)?;
            ensure!(exact_version(&contract.version), "invalid plugin version");
            let mut metadata = json!({"displayName":entry.id,"description":contract.description,"category":contract.category,"tags":[]});
            for key in ["author", "license", "homepage", "repository", "tags"] {
                if let Some(value) = contract.metadata.get(key) {
                    metadata[key] = value.clone();
                }
            }
            let mut events = json!({"pluginName":entry.id,"version":contract.version,"events":contract.events,"capabilities":contract.capabilities});
            if vault {
                events["pluginId"] = json!(entry.id)
            }
            let mut body = json!({"org":org,"name":entry.id,"version":contract.version,"language":"rust","metadata":metadata,"eventSchema":events,"package":{"rust":entry.package},"visibility":"public"});
            if let Some(schema) = contract.config_schema {
                body["configSchema"] = schema
            }
            if !vault {
                let paths = if contract.documentation.is_empty() {
                    vec!["README.md".into()]
                } else {
                    contract.documentation
                };
                ensure!(paths.len() <= 20, "at most 20 documentation files allowed");
                let mut docs = Vec::new();
                for path in paths {
                    let data = read_bounded(&cwd.join(path), 1000000).await?;
                    let text = String::from_utf8(data)?;
                    ensure!(!text.trim().is_empty(), "empty documentation");
                    docs.push(text);
                }
                body["documentation"] = json!(docs)
            }
            let segments = if vault {
                vec!["api", "plugins", "publish"]
            } else {
                vec!["plugins"]
            };
            results.push(
                self.request(Method::POST, &segments, &[], Some(&body))
                    .await?,
            );
        }
        ensure!(!results.is_empty(), "no matching Rust plugins to publish");
        Ok(json!(results))
    }
}
pub async fn sync_clients(cwd: &Path) -> Result<Vec<PathBuf>> {
    let directory = cwd.join(".bsb/schemas");
    let mut entries = match tokio::fs::read_dir(directory).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(error) => return Err(error.into()),
    };
    let mut sources = BTreeMap::new();
    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != "json") {
            continue;
        }
        let local = path
            .file_stem()
            .and_then(|v| v.to_str())
            .context("invalid schema filename")?;
        let module = generator::snake(local);
        ensure!(!sources.contains_key(&module), "client module collision");
        let data = String::from_utf8(read_bounded(&path, MAX_JSON).await?)?;
        sources.insert(module, generator::generate(&data, local)?);
    }
    let destination = cwd.join("src/bsbclients");
    let mut written = Vec::new();
    let mut modules = String::from("// Code generated by BSB. DO NOT EDIT.\n");
    for (module, source) in sources {
        let path = destination.join(format!("{module}.rs"));
        atomic_write(&path, source.as_bytes()).await?;
        modules.push_str(&format!("pub mod {module};\n"));
        written.push(path)
    }
    atomic_write(&destination.join("mod.rs"), modules.as_bytes()).await?;
    Ok(written)
}
fn dependency(mut value: toml::Value, cwd: &Path) -> Result<toml::Value> {
    if value.is_str() {
        value = toml::Value::Table(toml::map::Map::from_iter([("version".into(), value)]));
    }
    let table = value.as_table_mut().context("invalid Cargo dependency")?;
    if let Some(path) = table.get("path").and_then(toml::Value::as_str) {
        table.insert(
            "path".into(),
            toml::Value::String(cwd.join(path).to_string_lossy().into_owned()),
        );
    }
    Ok(value)
}
pub async fn build_host(cwd: &Path) -> Result<PathBuf> {
    let cwd = tokio::fs::canonicalize(cwd).await?;
    let manifest: Manifest =
        serde_json::from_slice(&read_bounded(&cwd.join("bsb-plugin.json"), MAX_JSON).await?)?;
    ensure!(!manifest.rust.is_empty(), "Rust plugin entries required");
    let cargo: toml::Value = toml::from_str(&String::from_utf8(
        read_bounded(&cwd.join("Cargo.toml"), MAX_JSON).await?,
    )?)?;
    let package = cargo["package"]["name"]
        .as_str()
        .context("Cargo package name required")?;
    let mut dependencies = cargo["dependencies"]
        .as_table()
        .context("BSB dependency required")?
        .clone();
    if dependencies
        .values()
        .any(|v| v.get("workspace").and_then(toml::Value::as_bool) == Some(true))
    {
        // Let Cargo locate the workspace instead of guessing ancestor directories.
        let output = Command::new("cargo")
            .args(["locate-project", "--workspace", "--message-format", "plain"])
            .current_dir(&cwd)
            .output()
            .await?;
        ensure!(output.status.success(), "Cargo workspace lookup failed");
        let workspace = PathBuf::from(String::from_utf8(output.stdout)?.trim());
        let root = workspace.parent().context("workspace directory required")?;
        let manifest: toml::Value = toml::from_str(&String::from_utf8(
            read_bounded(&workspace, MAX_JSON).await?,
        )?)?;
        for (name, value) in &mut dependencies {
            if value.get("workspace").and_then(toml::Value::as_bool) != Some(true) {
                continue;
            }
            let mut inherited = dependency(
                manifest
                    .get("workspace")
                    .and_then(|v| v.get("dependencies"))
                    .and_then(|v| v.get(name))
                    .context("missing workspace dependency")?
                    .clone(),
                root,
            )?;
            let table = inherited.as_table_mut().unwrap();
            for (key, setting) in value.as_table().unwrap() {
                if key == "workspace" {
                    continue;
                }
                if key == "features" {
                    table
                        .entry(key.clone())
                        .or_insert_with(|| toml::Value::Array(vec![]))
                        .as_array_mut()
                        .context("invalid inherited features")?
                        .extend(
                            setting
                                .as_array()
                                .context("invalid dependency features")?
                                .clone(),
                        );
                } else {
                    table.insert(key.clone(), setting.clone());
                }
            }
            *value = inherited;
        }
    }
    let (_, bsb) = dependencies
        .iter()
        .find(|(name, value)| {
            name.as_str() == "better-service-base"
                || value.get("package").and_then(toml::Value::as_str) == Some("better-service-base")
        })
        .context("add better-service-base as a direct dependency")?;
    let mut linked = toml::map::Map::new();
    let mut runtime = dependency(bsb.clone(), &cwd)?;
    runtime.as_table_mut().unwrap().insert(
        "package".into(),
        toml::Value::String("better-service-base".into()),
    );
    linked.insert("bsb".into(), runtime);
    let mut source = String::from(
        "fn main(){let runtime=bsb::runtime().expect(\"BSB runtime\");let mut registry=bsb::host::Registry::new();\n",
    );
    let mut imports = BTreeSet::new();
    let mut ids = BTreeSet::new();
    for entry in &manifest.rust {
        plugin_id(&entry.id)?;
        ensure!(
            !entry.id.contains('/') && ids.insert(entry.id.clone()),
            "invalid or duplicate plugin ID"
        );
        if !imports.insert(entry.package.clone()) {
            continue;
        }
        let key = format!("plugin{}", imports.len());
        let value = if entry.package.replace('-', "_") == package.replace('-', "_") {
            toml::Value::Table(toml::map::Map::from_iter([
                ("package".into(), toml::Value::String(package.into())),
                (
                    "path".into(),
                    toml::Value::String(cwd.to_string_lossy().into_owned()),
                ),
            ]))
        } else {
            let (alias, value) = dependencies
                .iter()
                .find(|(name, _)| name.replace('-', "_") == entry.package.replace('-', "_"))
                .context("plugin crate missing from Cargo dependencies")?;
            let mut value = dependency(value.clone(), &cwd)?;
            value
                .as_table_mut()
                .unwrap()
                .entry("package")
                .or_insert(toml::Value::String(alias.clone()));
            value
        };
        linked.insert(key.clone(), value);
        source.push_str(&format!(
            "{key}::register(&mut registry).expect(\"plugin registration\");\n"
        ));
    }
    source.push_str("if let Err(error)=runtime.block_on(bsb::host::main_with_registry(registry)){eprintln!(\"BSB: {error:#}\");std::process::exit(1);}}\n");
    let mut generated = toml::map::Map::new();
    generated.insert(
        "package".into(),
        toml::Value::Table(toml::map::Map::from_iter([
            ("name".into(), toml::Value::String("bsb-linked-host".into())),
            ("version".into(), toml::Value::String("0.0.0".into())),
            ("edition".into(), toml::Value::String("2024".into())),
        ])),
    );
    generated.insert("dependencies".into(), toml::Value::Table(linked));
    generated.insert("workspace".into(), toml::Value::Table(Default::default()));
    let directory = cwd.join(".bsb/host");
    atomic_write(
        &directory.join("Cargo.toml"),
        toml::to_string(&generated)?.as_bytes(),
    )
    .await?;
    atomic_write(&directory.join("src/main.rs"), source.as_bytes()).await?;
    let target = std::env::var_os("CARGO_TARGET_DIR")
        .map(|v| cwd.join(v))
        .unwrap_or_else(|| directory.join("target"));
    let status = Command::new("cargo")
        .args(["build", "--release", "--manifest-path"])
        .arg(directory.join("Cargo.toml"))
        .arg("--target-dir")
        .arg(&target)
        .current_dir(&cwd)
        .status()
        .await?;
    ensure!(status.success(), "linked BSB build failed");
    let extension = std::env::consts::EXE_SUFFIX;
    let destination = cwd.join(format!("lib/bsb{extension}"));
    tokio::fs::create_dir_all(destination.parent().unwrap()).await?;
    tokio::fs::copy(
        target.join(format!("release/bsb-linked-host{extension}")),
        &destination,
    )
    .await?;
    let output = Command::new(&destination)
        .arg("export")
        .current_dir(&cwd)
        .output()
        .await?;
    ensure!(output.status.success(), "linked plugin export failed");
    let contracts: Vec<Contract> = serde_json::from_slice(&output.stdout)?;
    let found: BTreeSet<_> = contracts.iter().map(|v| v.plugin_id.clone()).collect();
    ensure!(
        ids.is_subset(&found),
        "linked package did not register all manifest plugins"
    );
    for contract in contracts {
        plugin_id(&contract.plugin_id)?;
        ensure!(
            !contract.plugin_id.contains('/'),
            "export requires local plugin names"
        );
        atomic_write(
            &cwd.join("lib/schemas")
                .join(format!("{}.json", contract.plugin_id)),
            &serde_json::to_vec_pretty(&contract.export()?)?,
        )
        .await?;
    }
    Ok(destination)
}
pub async fn command(cwd: &Path, args: &[String]) -> Result<bool> {
    if args == ["plugin", "build"] {
        println!("{}", build_host(cwd).await?.display());
        return Ok(true);
    }
    if args.first().map(String::as_str) != Some("client") {
        return Ok(false);
    }
    let action = args.get(1).context("client command required")?;
    let mut flags = BTreeMap::new();
    let mut positional = Vec::new();
    let mut index = 2;
    while index < args.len() {
        let arg = &args[index];
        if let Some(key) = arg.strip_prefix("--") {
            ensure!(
                [
                    "source-language",
                    "version",
                    "target",
                    "token",
                    "org",
                    "plugin",
                    "allow-insecure-http"
                ]
                .contains(&key),
                "unknown option {arg}"
            );
            if key == "allow-insecure-http" {
                flags.insert(key, "true");
            } else {
                index += 1;
                flags.insert(
                    key,
                    args.get(index).context("missing option value")?.as_str(),
                );
            }
        } else {
            positional.push(arg.as_str())
        }
        index += 1;
    }
    if action == "sync" {
        println!("{}", json!(sync_clients(cwd).await?));
        return Ok(true);
    }
    let client = RegistryClient::new(
        flags.get("target").copied(),
        flags.get("token").copied(),
        flags.contains_key("allow-insecure-http")
            || std::env::var("BSB_REGISTRY_ALLOW_INSECURE_HTTP").as_deref() == Ok("true"),
    )?;
    let source = flags.get("source-language").copied();
    let version = flags.get("version").copied();
    let result = match action.as_str() {
        "list" => {
            client
                .request(Method::GET, &["plugins"], &[("limit", "100")], None)
                .await?
        }
        "publish" => {
            client
                .publish(
                    cwd,
                    flags.get("org").copied().unwrap_or("_"),
                    flags.get("plugin").copied(),
                    flags.contains_key("target"),
                )
                .await?
        }
        "info" | "schema" | "install" => {
            ensure!(
                positional.len() == 1,
                "client command requires one plugin ID"
            );
            match action.as_str() {
                "info" => client.info(positional[0], source).await?,
                "schema" => client.schema(positional[0], source, version).await?,
                _ => json!(client.install(cwd, positional[0], source, version).await?),
            }
        }
        _ => bail!("unknown client command"),
    };
    println!("{}", serde_json::to_string_pretty(&result)?);
    Ok(true)
}
