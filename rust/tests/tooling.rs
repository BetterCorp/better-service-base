use bsb::{Result, contract::Contract, generator, json, tooling};
use std::{fs, path::Path, process::Command};

#[test]
fn shared_contracts_generate_compiling_rust_clients() -> Result<()> {
    let directory = tempfile::tempdir()?;
    let source = directory.path().join("src");
    fs::create_dir_all(&source)?;
    let mut modules = String::new();
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let contracts = root.join("../python/examples/native_plugins/.bsb/schemas");
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
    fs::write(source.join("lib.rs"), modules)?;
    let manifest = json!({"package":{"name":"generated-check","version":"0.0.0","edition":"2024"},"dependencies":{"bsb":{"package":"better-service-base","path":root.to_string_lossy()}}});
    fs::write(
        directory.path().join("Cargo.toml"),
        toml::to_string(&manifest)?,
    )?;
    let status = Command::new("cargo")
        .arg("check")
        .arg("--manifest-path")
        .arg(directory.path().join("Cargo.toml"))
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
