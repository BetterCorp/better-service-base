use anyhow::Context;
use bsb::{Result, contract::Contract, generator, json};
use bsb_cli::tooling;
use std::{fs, path::Path, process::Command};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

async fn hosted_server(
    responses: Vec<(&'static str, u16, bsb::Value)>,
) -> Result<(String, tokio::task::JoinHandle<Result<()>>)> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let origin = format!("http://{}", listener.local_addr()?);
    let server = tokio::spawn(async move {
        for (path, status, body) in responses {
            let (mut stream, _) = listener.accept().await?;
            let mut bytes = vec![];
            while !bytes.ends_with(b"\r\n\r\n") {
                bytes.push(stream.read_u8().await?);
                anyhow::ensure!(bytes.len() < 16384, "oversized headers");
            }
            let headers = String::from_utf8(bytes)?;
            assert!(
                headers.starts_with(&format!("GET {path} HTTP/1.1")),
                "{headers}"
            );
            assert!(
                !headers.to_ascii_lowercase().contains("\r\nauthorization:"),
                "hosted requests must not send tokens: {headers}"
            );
            let body = body.to_string();
            let location = if status == 302 {
                "Location: /redirect\r\n"
            } else {
                ""
            };
            stream
                .write_all(
                    format!(
                        "HTTP/1.1 {status} Test\r\n{location}Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                    .as_bytes(),
                )
                .await?;
        }
        Ok(())
    });
    Ok((origin, server))
}

#[test]
fn shared_contracts_generate_compiling_rust_clients() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let source = directory.path().join("src");
    fs::create_dir_all(&source)?;
    let mut modules = String::new();
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let contracts = root.join("../../plugins/contracts/examples");
    for entry in fs::read_dir(contracts)? {
        let path = entry?.path();
        if path.extension().is_none_or(|v| v != "json") {
            continue;
        }
        let raw = fs::read_to_string(&path)?;
        let mut value: bsb::Value = bsb::serde_json::from_str(&raw)?;
        value["pluginId"] = value["pluginName"].clone();
        if value["pluginId"].is_null() {
            value["pluginId"] = json!(path.file_stem().unwrap().to_str().unwrap())
        }
        let contract: Contract = bsb::serde_json::from_value(value.clone())?;
        contract.validate()?;
        let name = path.file_stem().unwrap().to_str().unwrap();
        let module = generator::snake(name);
        let generated = generator::generate(&bsb::serde_json::to_string(&value)?, name)?;
        fs::write(source.join(format!("{module}.rs")), generated)?;
        modules.push_str(&format!("pub mod {module};\n"));
    }
    let recursive = json!({"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"ref","ref":"#/definitions/Node"},"definitions":{"Node":{"kind":"object","properties":{"value":{"kind":"int64"},"next":{"kind":"optional","inner":{"kind":"nullable","inner":{"kind":"ref","ref":"#/definitions/Node"}}}}}},"extensions":{}});
    let tree = json!({"pluginId":"tree","events":{"echo":{"type":"returnable","category":"onReturnableEvents","inputSchema":recursive,"outputSchema":recursive}}});
    fs::write(
        source.join("tree.rs"),
        generator::generate(&tree.to_string(), "tree")?,
    )?;
    modules.push_str("pub mod tree;\n");
    // Compile event and property names from every strict/reserved keyword.
    // Source: https://doc.rust-lang.org/reference/keywords.html
    let keywords = "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self static struct super trait true type unsafe use where while abstract become box do final gen macro override priv try typeof unsized virtual yield";
    let mut properties = bsb::serde_json::Map::new();
    let mut events = bsb::serde_json::Map::new();
    for word in keywords.split_whitespace() {
        properties.insert(word.into(), json!({"kind":"string"}));
        events.insert(word.into(), json!({"type":"fire-and-forget","category":"onEvents","inputSchema":{"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"string"}}}));
    }
    events.insert("fields".into(), json!({"type":"fire-and-forget","category":"onEvents","inputSchema":{"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"object","properties":properties}}}));
    let keywords = json!({"pluginId":"keywords","events":events});
    fs::write(
        source.join("keywords.rs"),
        generator::generate(&keywords.to_string(), "keywords")?,
    )?;
    modules.push_str("pub mod keywords;\n");
    fs::write(source.join("lib.rs"), modules)?;
    let manifest = json!({"package":{"name":"generated-check","version":"0.0.0","edition":"2024"},"dependencies":{"bsb":{"package":"better-service-base","path":root.join("..").to_string_lossy()}}});
    fs::write(
        directory.path().join("Cargo.toml"),
        toml::to_string(&manifest)?,
    )?;
    let status = Command::new("cargo")
        .arg("check")
        .arg("--manifest-path")
        .arg(directory.path().join("Cargo.toml"))
        .env("CARGO_TARGET_DIR", directory.path().join("target"))
        .status()?;
    anyhow::ensure!(status.success(), "generated clients did not compile");
    Ok(())
}
#[test]
fn rejects_unsafe_ids_and_generated_collisions() {
    for id in ["", "../bad", "a/b/c", "bad\nname", "@", "a/.."] {
        assert!(tooling::plugin_id(id).is_err(), "accepted {id}")
    }
    let contract = json!({"pluginId":"service","events":{"some-event":{"type":"fire-and-forget","category":"onEvents","inputSchema":{"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"string"}}},"some.event":{"type":"fire-and-forget","category":"onEvents","inputSchema":{"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"string"}}}}});
    assert!(generator::generate(&contract.to_string(), "service").is_err());
}

#[tokio::test]
async fn registry_install_pins_source_and_offline_sync() -> Result<()> {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let server = tokio::spawn(async move {
        for (path, body) in [
            (
                "/plugins/org/worker?language=nodejs",
                json!({"plugin":{"version":"1.2.3"}}),
            ),
            (
                "/plugins/org/worker/1.2.3/schema?language=nodejs",
                json!({"pluginName":"worker","events":{}}),
            ),
        ]
        .into_iter()
        .cycle()
        .take(4)
        {
            let (mut stream, _) = listener.accept().await?;
            let mut bytes = vec![];
            while !bytes.ends_with(b"\r\n\r\n") {
                bytes.push(stream.read_u8().await?);
                anyhow::ensure!(bytes.len() < 16384, "oversized headers");
            }
            let headers = String::from_utf8(bytes)?;
            assert!(
                headers.starts_with(&format!("GET {path} HTTP/1.1")),
                "{headers}"
            );
            let body = body.to_string();
            stream
                .write_all(
                    format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                        body.len()
                    )
                    .as_bytes(),
                )
                .await?;
        }
        Ok::<_, anyhow::Error>(())
    });
    let dir = tempfile::tempdir()?;
    let client = tooling::RegistryClient::new(Some(&format!("http://{address}")), None, true)?;
    let snapshots = dir.path().join(".bsb/schemas");
    fs::create_dir_all(&snapshots)?;
    let collision = snapshots.join("org-worker-nodejs.json");
    fs::write(&collision, "preserve existing snapshot")?;
    assert!(
        client
            .install(dir.path(), "org/worker", Some("nodejs"), None)
            .await
            .is_err()
    );
    assert_eq!(
        fs::read_to_string(&collision)?,
        "preserve existing snapshot"
    );
    assert_eq!(fs::read_dir(&snapshots)?.count(), 1);
    fs::remove_file(collision)?;
    let paths = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        client.install(dir.path(), "org/worker", Some("nodejs"), None),
    )
    .await??;
    assert_eq!(paths.len(), 1);
    server.await??;
    let schema: bsb::Value = bsb::serde_json::from_slice(&fs::read(
        dir.path().join(".bsb/schemas/org~worker~nodejs.json"),
    )?)?;
    assert_eq!(schema["source"]["version"], "1.2.3");
    assert_eq!(schema["source"]["language"], "nodejs");
    assert_eq!(schema["pluginId"], "worker");
    assert_eq!(tooling::sync_clients(dir.path()).await?, paths);
    Ok(())
}

#[tokio::test]
async fn hosted_install_selects_links_and_stays_offline_after_install() -> Result<()> {
    let mut discovery: bsb::Value = bsb::serde_json::from_str(include_str!(
        "../../../tests/fixtures/hosted-discovery.json"
    ))?;
    let mut first = discovery["plugins"][0]["schema"].clone();
    first["description"] = json!("first");
    let mut refreshed = first.clone();
    refreshed["description"] = json!("refreshed");
    discovery["plugins"].as_array_mut().unwrap().push(json!({
        "id":"acme/service-reports",
        "language":"rust",
        "version":"1.2.3-beta.1",
        "schema":"/contracts/reports.json"
    }));
    let (origin, server) = hosted_server(vec![
        ("/.well-known/bsb", 200, discovery.clone()),
        ("/contracts/reports.json", 200, first),
        ("/.well-known/bsb", 200, discovery),
        ("/contracts/reports.json", 200, refreshed),
        (
            "/.well-known/bsb",
            200,
            bsb::serde_json::from_str(include_str!(
                "../../../tests/fixtures/hosted-discovery.json"
            ))?,
        ),
    ])
    .await?;
    let dir = tempfile::tempdir()?;
    let args = vec![
        "client".into(),
        "install".into(),
        origin.clone(),
        "--plugin".into(),
        "acme/service-reports".into(),
        "--source-language".into(),
        "rust".into(),
        "--version".into(),
        "1.2.3-beta.1".into(),
        "--allow-insecure".into(),
        "--token".into(),
        "must-not-leak".into(),
    ];
    assert!(tooling::command(dir.path(), &args).await?);
    assert!(tooling::command(dir.path(), &args).await?);
    bsb_cli::hosted::HostedClient::new(&origin, true)?
        .install(
            dir.path(),
            Some("acme/service-reports"),
            Some("nodejs"),
            Some("1.2.3-beta.1"),
        )
        .await?;
    server.await??;
    let snapshots = dir.path().join(".bsb/schemas");
    let snapshots: Vec<_> = fs::read_dir(&snapshots)?
        .map(|entry| Ok(entry?.path()))
        .collect::<Result<_>>()?;
    let snapshot = snapshots
        .iter()
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .ends_with("~rust.json")
        })
        .context("linked snapshot required")?;
    assert_eq!(snapshots.len(), 2);
    assert!(
        snapshot
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("hosted~")
    );
    let saved: bsb::Value = bsb::serde_json::from_slice(&fs::read(snapshot)?)?;
    assert_eq!(saved["description"], "refreshed");
    assert_eq!(saved["source"]["url"], origin);
    assert_eq!(saved["source"]["org"], "acme");
    assert_eq!(saved["source"]["language"], "rust");
    assert_eq!(saved["source"]["version"], "1.2.3-beta.1");
    assert_eq!(tooling::sync_clients(dir.path()).await?.len(), 2);
    Ok(())
}

#[tokio::test]
async fn hosted_install_rejects_ambiguous_invalid_and_unsafe_responses() -> Result<()> {
    let schema = json!({"pluginId":"reports","events":{}});
    let ambiguous = json!({"bsb":1,"plugins":[
        {"id":"acme/reports","language":"rust","version":"1.0.0","schema":schema.clone()},
        {"id":"acme/reports","language":"rust","version":"2.0.0","schema":schema}
    ]});
    let invalid = json!({"bsb":1,"plugins":[
        {"id":"bad/id/extra","language":"rust","version":"1.0.0","schema":{"pluginId":"reports","events":{}}}
    ]});
    let duplicate = json!({"bsb":1,"plugins":[
        {"id":"reports","language":"rust","version":"1.0.0","schema":{"pluginId":"reports","events":{}}},
        {"id":"_/reports","language":"rust","version":"1.0.0","schema":{"pluginId":"reports","events":{}}}
    ]});
    let mismatched_version = json!({"bsb":1,"plugins":[
        {"id":"acme/reports","language":"rust","version":"1.0.0","schema":{"pluginId":"reports","version":"2.0.0","events":{}}}
    ]});
    let off_origin = json!({"bsb":1,"plugins":[
        {"id":"acme/reports","language":"rust","version":"1.0.0","schema":"https://example.invalid/schema.json"}
    ]});
    for response in [
        ambiguous,
        invalid,
        duplicate,
        mismatched_version,
        off_origin,
    ] {
        let (origin, server) = hosted_server(vec![("/.well-known/bsb", 200, response)]).await?;
        let dir = tempfile::tempdir()?;
        assert!(
            bsb_cli::hosted::HostedClient::new(&origin, true)?
                .install(dir.path(), None, None, None)
                .await
                .is_err()
        );
        server.await??;
        assert!(!dir.path().join(".bsb/schemas").exists());
    }
    let (origin, server) = hosted_server(vec![("/.well-known/bsb", 302, json!({}))]).await?;
    assert!(
        bsb_cli::hosted::HostedClient::new(&origin, true)?
            .install(tempfile::tempdir()?.path(), None, None, None)
            .await
            .is_err()
    );
    server.await??;
    let normalized = json!({"bsb":1,"plugins":[
        {"id":"_/reports","language":"rust","version":"1.0.0","schema":{"pluginId":"reports","events":{}}}
    ]});
    let (origin, server) = hosted_server(vec![("/.well-known/bsb", 200, normalized)]).await?;
    let dir = tempfile::tempdir()?;
    bsb_cli::hosted::HostedClient::new(&origin, true)?
        .install(dir.path(), Some("reports"), Some("rust"), Some("1.0.0"))
        .await?;
    server.await??;
    Ok(())
}
