use bsb::{
    Result,
    config::Config,
    contract::Contract,
    host::{Host, Ordering, Registry, Service},
    json,
    observable::{Backend, Observable, Observer},
};
use bsb_rust_builtins::telemetry::{Native, redact};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};

struct TestService;
impl Service for TestService {}

#[tokio::test]
async fn relative_paths_use_host_working_directory() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let relative = format!("logs/{}.log", uuid::Uuid::new_v4());
    let process_path = std::env::current_dir()?.join(&relative);
    let mut registry = Registry::new();
    bsb_rust_builtins::register(&mut registry)?;
    registry.register(
        Contract::empty("worker", "service"),
        Ordering::default(),
        |_| Ok(Box::new(TestService)),
    )?;
    let mut host = Host::new(registry)?;
    host.cwd = dir.path().to_owned();
    host.cancel.cancel();
    host.run_config(Config::load(
        &json!({"services":{"worker":{}},"observable":{"log":{"plugin":"observable-logging-file","config":{"path":relative,"compress":false}}}}),
        "default",
    )?)
    .await?;
    let misplaced = process_path.exists();
    if misplaced {
        std::fs::remove_file(&process_path)?;
    }
    assert!(dir.path().join(&relative).exists());
    assert!(!misplaced);
    Ok(())
}

#[tokio::test]
async fn otlp_flush_and_integer_metrics() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let received = Arc::new(Mutex::new(Vec::new()));
    let captured = received.clone();
    let server = tokio::spawn(async move {
        for _ in 0..3 {
            let (mut stream, _) = listener.accept().await?;
            let mut bytes = Vec::new();
            let split = loop {
                let byte = stream.read_u8().await?;
                bytes.push(byte);
                anyhow::ensure!(bytes.len() < 16384, "oversized headers");
                if bytes.ends_with(b"\r\n\r\n") {
                    break bytes.len();
                }
            };
            let headers = String::from_utf8_lossy(&bytes[..split]);
            let path = headers
                .lines()
                .next()
                .unwrap()
                .split_whitespace()
                .nth(1)
                .unwrap()
                .to_owned();
            let length: usize = headers
                .lines()
                .find_map(|line| {
                    line.to_ascii_lowercase()
                        .strip_prefix("content-length:")
                        .map(|v| v.trim().parse::<usize>())
                })
                .unwrap()?;
            let mut body = vec![0; length];
            stream.read_exact(&mut body).await?;
            captured
                .lock()
                .unwrap()
                .push((path, bsb::serde_json::from_slice::<bsb::Value>(&body)?));
            stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await?;
        }
        Ok::<_, anyhow::Error>(())
    });
    let plugin = Native::new(
        "observable-opentelemetry",
        json!({"endpoint":format!("http://{address}")}),
    )
    .await?;
    let backend = Arc::new(Backend::default());
    backend.add(plugin.clone());
    let obs = Observable::new("test", backend.clone());
    obs.info("hello", json!({}));
    drop(obs.span("work"));
    let counter = obs.counter("requests", "requests", "count")?;
    counter.increment(9007199254740993)?;
    obs.counter("requests", "requests", "count")?.increment(1)?;
    let gauge = obs.gauge("precision", "precision", "ratio")?;
    gauge.set(0.000001)?;
    plugin.shutdown().await?;
    tokio::time::timeout(Duration::from_secs(10), server).await???;
    let received = received.lock().unwrap();
    assert_eq!(received.len(), 3);
    let metrics = &received
        .iter()
        .find(|(path, _)| path == "/v1/metrics")
        .unwrap()
        .1["resourceMetrics"][0]["scopeMetrics"][0]["metrics"];
    let counter = metrics
        .as_array()
        .unwrap()
        .iter()
        .find(|item| item["name"] == "requests")
        .unwrap();
    assert_eq!(counter["sum"]["dataPoints"][0]["asInt"], "9007199254740994");
    assert!(obs.counter("bad", "", "count")?.increment(-1).is_err());
    Ok(())
}
#[tokio::test]
async fn file_redaction_and_retention_isolation() -> Result<()> {
    let dir = tempfile::tempdir()?;
    let path = dir.path().join("app[1].log");
    let other = dir.path().join("app1.log.bsb-00000000000000000001");
    std::fs::write(&other, b"keep")?;
    let plugin=Native::new("observable-logging-file",json!({"path":path,"maxBytes":400,"maxFiles":2,"compress":false,"redact":["meta.password","meta.users.*.secret"]})).await?;
    let backend = Arc::new(Backend::default());
    backend.add(plugin.clone());
    let obs = Observable::new("test", backend);
    for _ in 0..8 {
        obs.info(
            "password {password}",
            json!({"password":"hidden","users":[{"secret":"hidden"}]}),
        )
    }
    plugin.shutdown().await?;
    let files: Vec<_> = std::fs::read_dir(dir.path())?.collect::<std::io::Result<Vec<_>>>()?;
    assert_eq!(files.len(), 4);
    for file in files {
        let contents = std::fs::read_to_string(file.path())?;
        assert!(!contents.contains("hidden"));
    }
    assert_eq!(std::fs::read_to_string(other)?, "keep");
    assert_eq!(
        redact(json!({"a":[{"secret":1}]}), &["a.*.secret".into()]),
        json!({"a":[{"secret":"[REDACTED]"}]})
    );
    Ok(())
}

#[tokio::test]
async fn gelf_chunks_and_syslog_octet_framing() -> Result<()> {
    let udp = tokio::net::UdpSocket::bind("127.0.0.1:0").await?;
    let plugin=Native::new("observable-graylog",json!({"host":"127.0.0.1","port":udp.local_addr()?.port(),"facility":"custom","compress":false,"redact":["meta.secret"],"additionalFields":{"text":"kept","number":7,"bool":true,"object":{"region":"us"},"array":["x",2],"null":null}})).await?;
    let backend = Arc::new(Backend::default());
    backend.add(plugin.clone());
    Observable::new("test", backend).info(&"x".repeat(3000), json!({"secret":"hidden"}));
    plugin.shutdown().await?;
    let mut assembled = vec![];
    let mut expected_id = None;
    let mut index = 0;
    loop {
        let mut packet = [0u8; 1200];
        let size = tokio::time::timeout(Duration::from_secs(2), udp.recv(&mut packet)).await??;
        assert_eq!(&packet[..2], &[0x1e, 0x0f]);
        if let Some(id) = &expected_id {
            assert_eq!(id, &packet[2..10])
        } else {
            expected_id = Some(packet[2..10].to_vec())
        }
        assert_eq!(packet[10], index);
        assembled.extend_from_slice(&packet[12..size]);
        index += 1;
        if index == packet[11] {
            break;
        }
    }
    let message: bsb::Value = bsb::serde_json::from_slice(&assembled)?;
    assert_eq!(message["short_message"].as_str().unwrap().len(), 3000);
    assert_eq!(message["_facility"], "custom");
    for (key, expected) in [
        ("_text", json!("kept")),
        ("_number", json!(7)),
        ("_bool", json!("true")),
        ("_object", json!(r#"{"region":"us"}"#)),
        ("_array", json!(r#"["x",2]"#)),
        ("_null", json!("null")),
    ] {
        assert_eq!(message[key], expected, "{key}");
    }
    assert!(!message["_meta"].as_str().unwrap().contains("hidden"));
    for key in ["id", "_id"] {
        assert!(
            Native::new(
                "observable-graylog",
                json!({"additionalFields":{(key):"reserved"}})
            )
            .await
            .is_err()
        );
    }
    let http = TcpListener::bind("127.0.0.1:0").await?;
    let address = http.local_addr()?;
    let request = tokio::spawn(async move {
        let (mut stream, _) = http.accept().await?;
        let mut bytes = Vec::new();
        loop {
            bytes.push(stream.read_u8().await?);
            anyhow::ensure!(bytes.len() < 16384, "oversized headers");
            if bytes.ends_with(b"\r\n\r\n") {
                break;
            }
        }
        stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}").await?;
        Ok::<_, anyhow::Error>(String::from_utf8(bytes)?)
    });
    let plugin=Native::new("observable-graylog",json!({"host":"127.0.0.1","port":address.port(),"protocol":"http","headers":{"Authorization":"Bearer secret"}})).await?;
    let backend = Arc::new(Backend::default());
    backend.add(plugin.clone());
    Observable::new("test", backend).info("http", json!({}));
    plugin.shutdown().await?;
    let request = tokio::time::timeout(Duration::from_secs(2), request).await???;
    assert!(
        request
            .to_ascii_lowercase()
            .contains("authorization: bearer secret\r\n")
    );
    let tcp = TcpListener::bind("127.0.0.1:0").await?;
    let plugin=Native::new("observable-syslog",json!({"host":"127.0.0.1","port":tcp.local_addr()?.port(),"protocol":"tcp","framing":"octet-counting"})).await?;
    let backend = Arc::new(Backend::default());
    backend.add(plugin.clone());
    Observable::new("test", backend).info("Unicode λ", json!({}));
    plugin.shutdown().await?;
    let (mut stream, _) = tokio::time::timeout(Duration::from_secs(2), tcp.accept()).await??;
    let mut prefix = vec![];
    loop {
        let byte = stream.read_u8().await?;
        if byte == b' ' {
            break;
        }
        prefix.push(byte);
        assert!(prefix.len() < 10)
    }
    let length = String::from_utf8(prefix)?.parse::<usize>()?;
    let mut message = vec![0; length];
    tokio::time::timeout(Duration::from_secs(2), stream.read_exact(&mut message)).await??;
    let message = String::from_utf8(message)?;
    assert!(message.starts_with("<134>1 "));
    assert!(message.contains("Unicode λ"));
    Ok(())
}
