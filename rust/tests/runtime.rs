use bsb::{
    Result, Value, async_trait,
    config::Config,
    contract::{Contract, Event, Optional},
    events::{Bus, Events, LocalBus},
    host::{Host, Ordering, Registry, Service, ServiceContext},
    json,
    observable::{Backend, Observable},
};
use std::{
    collections::BTreeMap,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering as AtomicOrdering},
    },
    time::Duration,
};

fn doc(root: Value) -> Value {
    json!({"anyvaliVersion":"1.0","schemaVersion":"1.1","root":root,"definitions":{},"extensions":{}})
}
fn contract() -> Contract {
    let mut contract = Contract::empty("worker", "service");
    contract.config_schema = Some(doc(
        json!({"kind":"object","properties":{"count":{"kind":"int32","min":1}},"required":["count"],"unknownKeys":"reject"}),
    ));
    contract.events = BTreeMap::from([(
        "echo".into(),
        Event {
            category: "onReturnableEvents".into(),
            kind: "returnable".into(),
            input_schema: doc(json!({"kind":"int64"})),
            output_schema: Some(doc(json!({"kind":"int64"}))),
            default_timeout: 1.0,
            description: String::new(),
        },
    )]);
    contract
}
#[test]
fn profile_language_and_aliases() {
    let config=Config::load(&json!({"default":{"services":{"local":{"plugin":"worker","config":{"a":1}},"remote":{"plugin":"service-registry","language":"nodejs","enabled":false}}},"staging":{"language":"rust","services":{"local":{"config":{"b":2}}}}}),"staging").unwrap();
    assert_eq!(
        config.groups["services"]["local"].config,
        json!({"a":1,"b":2})
    );
    assert_eq!(config.resolve("service-registry").unwrap(), "remote");
    for bad in [
        Value::Null,
        json!({"default":{"language":"go"}}),
        json!({"default":{"services":{"bad":{"enabled":"false"}}}}),
    ] {
        assert!(Config::load(&bad, "default").is_err())
    }
}
#[test]
fn optional_null_and_large_integers() {
    #[derive(Debug, Default, PartialEq, serde::Serialize, serde::Deserialize)]
    struct Object {
        #[serde(default, skip_serializing_if = "Optional::is_missing")]
        value: Optional<Option<i64>>,
    }
    let absent: Object = serde_json::from_str("{}").unwrap();
    let null: Object = serde_json::from_str(r#"{"value":null}"#).unwrap();
    assert_ne!(absent, null);
    assert_eq!(serde_json::to_string(&absent).unwrap(), "{}");
    let value = Object {
        value: Optional::Present(Some(9007199254740993)),
    };
    assert_eq!(
        serde_json::from_str::<Object>(&serde_json::to_string(&value).unwrap()).unwrap(),
        value
    );
}
#[tokio::test]
async fn validated_rpc_and_bounded_binary_stream() -> Result<()> {
    let config = Arc::new(Config::load(&json!({"services":{}}), "default")?);
    let backend = Arc::new(Backend::default());
    let obs = Observable::new("test", backend);
    let bus = Arc::new(LocalBus::default());
    let service = Events::new("worker".into(), bus.clone(), Arc::new(contract()), config)?;
    let client = service.client(contract(), None)?;
    let expected = obs.trace.trace_id.clone();
    service
        .listen(
            "echo",
            Arc::new(move |obs, value| {
                let expected = expected.clone();
                Box::pin(async move {
                    assert_eq!(obs.trace.trace_id, expected);
                    Ok(value)
                })
            }),
        )
        .await?;
    assert_eq!(
        client
            .emit(&obs, "echo", json!(9007199254740993i64), None)
            .await?,
        json!(9007199254740993i64)
    );
    assert!(
        client
            .emit(&obs, "echo", json!("invalid"), None)
            .await
            .is_err()
    );
    let bytes: Vec<u8> = (0..1024 * 1024).map(|i| (i % 251) as u8).collect();
    let expected = bytes.clone();
    let id = service
        .receive(
            &obs,
            "file",
            Arc::new(move |_, mut reader| {
                let expected = expected.clone();
                Box::pin(async move {
                    use tokio::io::AsyncReadExt;
                    let mut bytes = vec![];
                    reader.read_to_end(&mut bytes).await?;
                    assert_eq!(bytes, expected);
                    Ok(())
                })
            }),
            Duration::from_secs(2),
        )
        .await?;
    client
        .send(&obs, "file", &id, Box::pin(std::io::Cursor::new(bytes)))
        .await?;
    bus.shutdown().await
}
struct Failing {
    disposed: Arc<AtomicUsize>,
}

#[tokio::test]
async fn unused_stream_notifies_receiver_on_deadline() -> Result<()> {
    let bus = LocalBus::default();
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    bus.receive(
        Observable::new("test", Arc::new(Backend::default())),
        "test",
        "file",
        Arc::new(move |_, mut reader| {
            let tx = tx.clone();
            Box::pin(async move {
                use tokio::io::AsyncReadExt;
                let mut bytes = vec![];
                tx.send(reader.read_to_end(&mut bytes).await.is_err())
                    .await?;
                Ok(())
            })
        }),
        Duration::from_millis(10),
    )
    .await?;
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(1), rx.recv()).await?,
        Some(true)
    );
    bus.shutdown().await
}

struct Waiting {
    started: tokio::sync::mpsc::Sender<()>,
    closed: Arc<AtomicUsize>,
}
#[async_trait]
impl Service for Waiting {
    async fn init(&mut self, _: &ServiceContext) -> Result<()> {
        self.started.send(()).await?;
        std::future::pending().await
    }
    async fn shutdown(&mut self) -> Result<()> {
        self.closed.fetch_add(1, AtomicOrdering::SeqCst);
        Ok(())
    }
}
#[tokio::test]
async fn cancellation_interrupts_startup_and_cleans_services() -> Result<()> {
    let (tx, mut rx) = tokio::sync::mpsc::channel(1);
    let closed = Arc::new(AtomicUsize::new(0));
    let count = closed.clone();
    let mut registry = Registry::new();
    registry.register(
        Contract::empty("waiting", "service"),
        Ordering::default(),
        move |_| {
            Ok(Box::new(Waiting {
                started: tx.clone(),
                closed: count.clone(),
            }))
        },
    )?;
    let host = Host::new(registry)?;
    let cancel = host.cancel.clone();
    let running = tokio::spawn(async move {
        host.run_config(Config::load(
            &json!({"events":{"events-default":{"filter":[]}},"services":{"waiting":{}}}),
            "default",
        )?)
        .await
    });
    tokio::time::timeout(Duration::from_secs(1), rx.recv()).await?;
    cancel.cancel();
    tokio::time::timeout(Duration::from_secs(1), running).await???;
    assert_eq!(closed.load(AtomicOrdering::SeqCst), 1);
    Ok(())
}
#[async_trait]
impl Service for Failing {
    async fn init(&mut self, _: &ServiceContext) -> Result<()> {
        anyhow::bail!("expected failure")
    }
    async fn shutdown(&mut self) -> Result<()> {
        self.disposed.fetch_add(1, AtomicOrdering::SeqCst);
        Ok(())
    }
}
#[tokio::test]
async fn validates_before_factory_and_cleans_failed_startup() -> Result<()> {
    let calls = Arc::new(AtomicUsize::new(0));
    let disposed = Arc::new(AtomicUsize::new(0));
    let mut registry = Registry::new();
    let created = calls.clone();
    let cleaned = disposed.clone();
    registry.register(contract(), Ordering::default(), move |_| {
        created.fetch_add(1, AtomicOrdering::SeqCst);
        Ok(Box::new(Failing {
            disposed: cleaned.clone(),
        }))
    })?;
    registry.export()?;
    assert_eq!(calls.load(AtomicOrdering::SeqCst), 0);
    let mut host = Host::new(registry)?;
    assert!(
        host.run_config(Config::load(
            &json!({"services":{"worker":{"config":{"count":0}}}}),
            "default"
        )?)
        .await
        .is_err()
    );
    assert_eq!(calls.load(AtomicOrdering::SeqCst), 0);
    // A failed host is stopped; explicitly start a fresh lifecycle for the second case.
    host.cancel = bsb::CancellationToken::new();
    assert!(
        host.run_config(Config::load(
            &json!({"services":{"worker":{"config":{"count":1}}}}),
            "default"
        )?)
        .await
        .is_err()
    );
    assert_eq!(disposed.load(AtomicOrdering::SeqCst), 1);
    Ok(())
}
