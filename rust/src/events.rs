use crate::{
    config::Config,
    contract::{CompiledSchema, Contract},
    observable::Observable,
};
use anyhow::{Context, Result, bail, ensure};
use async_trait::async_trait;
use futures_util::future::BoxFuture;
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    pin::Pin,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncRead, AsyncWriteExt},
    sync::Notify,
};
use tokio_util::sync::CancellationToken;

pub type Handler =
    Arc<dyn Fn(Observable, Value) -> BoxFuture<'static, Result<Value>> + Send + Sync>;
pub type Reader = Pin<Box<dyn AsyncRead + Send>>;
pub type StreamHandler =
    Arc<dyn Fn(Observable, Reader) -> BoxFuture<'static, Result<()>> + Send + Sync>;
pub fn failed_reader(message: impl Into<String>) -> Reader {
    let message = message.into();
    Box::pin(tokio_util::io::StreamReader::new(Box::pin(
        futures_util::stream::once(async move {
            Err::<bytes::Bytes, _>(std::io::Error::other(message))
        }),
    )))
}
#[async_trait]
pub trait Bus: Send + Sync {
    async fn listen(&self, kind: &str, target: &str, event: &str, handler: Handler) -> Result<()>;
    async fn emit(
        &self,
        obs: Observable,
        kind: &str,
        target: &str,
        event: &str,
        value: Value,
        timeout: Duration,
    ) -> Result<Value>;
    async fn receive(
        &self,
        obs: Observable,
        target: &str,
        event: &str,
        handler: StreamHandler,
        timeout: Duration,
    ) -> Result<String>;
    async fn send(
        &self,
        obs: Observable,
        target: &str,
        event: &str,
        id: &str,
        reader: Reader,
    ) -> Result<()>;
    async fn shutdown(&self) -> Result<()>;
    async fn failure(&self) -> String {
        std::future::pending().await
    }
}
type Key = (String, String, String);
struct Queued {
    obs: Observable,
    value: Value,
    expires: Instant,
}
struct WaitingStream {
    target: String,
    event: String,
    handler: StreamHandler,
    expires: Instant,
    timeout: Duration,
    claimed: CancellationToken,
}
#[derive(Default)]
struct LocalState {
    handlers: HashMap<Key, Vec<Handler>>,
    pending: HashMap<Key, VecDeque<Queued>>,
    streams: HashMap<String, WaitingStream>,
}
#[derive(Default)]
pub struct LocalBus {
    state: Arc<Mutex<LocalState>>,
    changed: Notify,
    cancel: CancellationToken,
    tasks: Mutex<Vec<tokio::task::JoinHandle<()>>>,
}
#[async_trait]
impl Bus for LocalBus {
    async fn listen(&self, kind: &str, target: &str, event: &str, handler: Handler) -> Result<()> {
        ensure!(!self.cancel.is_cancelled(), "event bus closed");
        let key = (kind.into(), target.into(), event.into());
        let queued = {
            let mut state = self.state.lock().unwrap();
            let handlers = state.handlers.entry(key.clone()).or_default();
            ensure!(
                kind == "broadcast" || handlers.is_empty(),
                "duplicate event listener"
            );
            handlers.push(handler.clone());
            state.pending.remove(&key).unwrap_or_default()
        };
        self.changed.notify_waiters();
        for message in queued {
            if message.expires > Instant::now() {
                handler(message.obs, message.value).await?;
            }
        }
        Ok(())
    }
    async fn emit(
        &self,
        obs: Observable,
        kind: &str,
        target: &str,
        event: &str,
        value: Value,
        timeout: Duration,
    ) -> Result<Value> {
        if kind == "returnable" {
            ensure!(timeout > Duration::ZERO, "positive timeout required");
        }
        let key = (kind.into(), target.into(), event.into());
        let work = async {
            loop {
                ensure!(!self.cancel.is_cancelled(), "event bus closed");
                let changed = self.changed.notified();
                tokio::pin!(changed);
                changed.as_mut().enable();
                let handlers = self
                    .state
                    .lock()
                    .unwrap()
                    .handlers
                    .get(&key)
                    .cloned()
                    .unwrap_or_default();
                if !handlers.is_empty() {
                    let mut result = Value::Null;
                    let mut failures = Vec::new();
                    for handler in handlers {
                        let mut span = obs.span(event);
                        let response = handler(span.observable.clone(), value.clone()).await;
                        if let Err(error) = &response {
                            span.error(error)
                        };
                        match response {
                            Ok(value) => result = value,
                            Err(error) if kind == "broadcast" => {
                                failures.push(format!("{error:#}"))
                            }
                            Err(error) => return Err(error),
                        }
                    }
                    if !failures.is_empty() {
                        bail!("broadcast listener failures: {}", failures.join("; "))
                    }
                    return Ok(result);
                }
                if kind == "broadcast" {
                    return Ok(Value::Null);
                }
                if kind == "event" {
                    let mut state = self.state.lock().unwrap();
                    // Recheck while holding the same lock used to attach listeners.
                    if state.handlers.contains_key(&key) {
                        continue;
                    }
                    state.pending.retain(|_, queue| {
                        queue.retain(|v| v.expires > Instant::now());
                        !queue.is_empty()
                    });
                    ensure!(
                        state.pending.values().map(VecDeque::len).sum::<usize>() < 1024,
                        "local event queue full"
                    );
                    let pending = state.pending.entry(key.clone()).or_default();
                    pending.retain(|v| v.expires > Instant::now());
                    ensure!(pending.len() < 1024, "local event queue full");
                    pending.push_back(Queued {
                        obs: obs.clone(),
                        value: value.clone(),
                        expires: Instant::now() + Duration::from_secs(60),
                    });
                    return Ok(Value::Null);
                }
                tokio::select! { _=changed=>{}, _=self.cancel.cancelled()=>bail!("event bus closed") }
            }
        };
        if kind == "returnable" {
            tokio::time::timeout(timeout, work)
                .await
                .context("event deadline exceeded")?
        } else {
            work.await
        }
    }
    async fn receive(
        &self,
        obs: Observable,
        target: &str,
        event: &str,
        handler: StreamHandler,
        timeout: Duration,
    ) -> Result<String> {
        ensure!(
            !self.cancel.is_cancelled() && timeout > Duration::ZERO,
            "invalid stream registration"
        );
        let mut state = self.state.lock().unwrap();
        ensure!(state.streams.len() < 1024, "stream registry full");
        let id = uuid::Uuid::new_v4().to_string();
        let claimed = CancellationToken::new();
        state.streams.insert(
            id.clone(),
            WaitingStream {
                target: target.into(),
                event: event.into(),
                handler,
                expires: Instant::now() + timeout,
                timeout,
                claimed: claimed.clone(),
            },
        );
        drop(state);
        let state = self.state.clone();
        let cancel = self.cancel.clone();
        let expired = id.clone();
        let task = tokio::spawn(async move {
            tokio::select! {_=tokio::time::sleep(timeout)=>{},_=cancel.cancelled()=>{},_=claimed.cancelled()=>return}
            let stream = state.lock().unwrap().streams.remove(&expired);
            if let Some(stream) = stream {
                let _ = tokio::time::timeout(
                    Duration::from_secs(5),
                    (stream.handler)(
                        obs,
                        failed_reader("stream registration expired or bus closed"),
                    ),
                )
                .await;
            }
        });
        let mut tasks = self.tasks.lock().unwrap();
        tasks.retain(|v| !v.is_finished());
        tasks.push(task);
        Ok(id)
    }
    async fn send(
        &self,
        obs: Observable,
        target: &str,
        event: &str,
        id: &str,
        mut reader: Reader,
    ) -> Result<()> {
        let stream = {
            let mut state = self.state.lock().unwrap();
            let value = state.streams.get(id).context("unknown stream")?;
            ensure!(
                value.target == target && value.event == event && value.expires > Instant::now(),
                "stream target or deadline mismatch"
            );
            state.streams.remove(id).unwrap()
        };
        stream.claimed.cancel();
        let (mut writer, receiver) = tokio::io::duplex(64 * 1024);
        let work = async {
            let copy = async {
                tokio::io::copy(&mut reader, &mut writer).await?;
                writer.shutdown().await?;
                Ok::<_, anyhow::Error>(())
            };
            tokio::try_join!(copy, (stream.handler)(obs, Box::pin(receiver)))?;
            Ok(())
        };
        tokio::select! { result=tokio::time::timeout(stream.timeout,work)=>result.context("stream deadline exceeded")?, _=self.cancel.cancelled()=>bail!("event bus closed") }
    }
    async fn shutdown(&self) -> Result<()> {
        self.cancel.cancel();
        let tasks = std::mem::take(&mut *self.tasks.lock().unwrap());
        for task in tasks {
            let _ = task.await;
        }
        *self.state.lock().unwrap() = LocalState::default();
        Ok(())
    }
}

struct Validation {
    input: CompiledSchema,
    output: Option<CompiledSchema>,
}
#[derive(Clone)]
pub struct Events {
    pub target: String,
    pub bus: Arc<dyn Bus>,
    pub contract: Arc<Contract>,
    pub config: Arc<Config>,
    suffix: String,
    validations: Arc<HashMap<String, Arc<Validation>>>,
}
impl Events {
    pub fn new(
        target: String,
        bus: Arc<dyn Bus>,
        contract: Arc<Contract>,
        config: Arc<Config>,
    ) -> Result<Self> {
        contract.validate()?;
        let mut validations = HashMap::new();
        for (name, event) in &contract.events {
            validations.insert(
                name.clone(),
                Arc::new(Validation {
                    input: CompiledSchema::new(&event.input_schema)?,
                    output: event
                        .output_schema
                        .as_ref()
                        .map(CompiledSchema::new)
                        .transpose()?,
                }),
            );
        }
        Ok(Self {
            target,
            bus,
            contract,
            config,
            suffix: String::new(),
            validations: Arc::new(validations),
        })
    }
    pub fn client(&self, contract: Contract, target: Option<&str>) -> Result<Self> {
        let name = self.config.resolve(target.unwrap_or(&contract.plugin_id))?;
        Self::new(
            name,
            self.bus.clone(),
            Arc::new(contract.client()?),
            self.config.clone(),
        )
    }
    pub fn specific(&self, id: &str) -> Result<Self> {
        ensure!(
            !id.is_empty() && id.len() <= 200 && !id.chars().any(char::is_control),
            "invalid instance ID"
        );
        let mut copy = self.clone();
        copy.suffix = format!("-{id}");
        Ok(copy)
    }
    fn definition(&self, name: &str, category: &str) -> Result<&crate::contract::Event> {
        let event = self
            .contract
            .events
            .get(name)
            .context("event missing from contract")?;
        ensure!(event.category == category, "event direction mismatch");
        Ok(event)
    }
    pub async fn emit(
        &self,
        obs: &Observable,
        name: &str,
        value: Value,
        timeout: Option<Duration>,
    ) -> Result<Value> {
        let event = self
            .contract
            .events
            .get(name)
            .context("event missing from contract")?;
        let kind = match event.category.as_str() {
            "emitEvents" => "event",
            "emitReturnableEvents" => "returnable",
            "emitBroadcast" => "broadcast",
            _ => bail!("event direction mismatch"),
        };
        let validation = &self.validations[name];
        let value = validation.input.parse(&value)?;
        let wire = if kind == "broadcast" {
            name.to_owned()
        } else {
            format!("{name}{}", self.suffix)
        };
        let result = self
            .bus
            .emit(
                obs.clone(),
                kind,
                &self.target,
                &wire,
                value,
                timeout.unwrap_or(Duration::from_secs_f64(event.default_timeout)),
            )
            .await?;
        if let Some(schema) = &validation.output {
            schema.parse(&result)
        } else {
            Ok(result)
        }
    }
    pub async fn listen(&self, name: &str, handler: Handler) -> Result<()> {
        let event = self
            .contract
            .events
            .get(name)
            .context("event missing from contract")?
            .clone();
        let kind = match event.category.as_str() {
            "onEvents" => "event",
            "onReturnableEvents" => "returnable",
            "onBroadcast" => "broadcast",
            _ => bail!("event direction mismatch"),
        };
        self.definition(name, &event.category)?;
        let wire = if kind == "broadcast" {
            name.to_owned()
        } else {
            format!("{name}{}", self.suffix)
        };
        let validation = self.validations[name].clone();
        let wrapped: Handler = Arc::new(move |obs, value| {
            let validation = validation.clone();
            let handler = handler.clone();
            Box::pin(async move {
                let value = validation.input.parse(&value)?;
                let result = handler(obs, value).await?;
                if let Some(schema) = &validation.output {
                    schema.parse(&result)
                } else {
                    Ok(result)
                }
            })
        });
        self.bus.listen(kind, &self.target, &wire, wrapped).await
    }
    pub async fn receive(
        &self,
        obs: &Observable,
        event: &str,
        handler: StreamHandler,
        timeout: Duration,
    ) -> Result<String> {
        self.bus
            .receive(
                obs.clone(),
                &self.target,
                &format!("{event}{}", self.suffix),
                handler,
                timeout,
            )
            .await
    }
    pub async fn send(
        &self,
        obs: &Observable,
        event: &str,
        id: &str,
        reader: Reader,
    ) -> Result<()> {
        self.bus
            .send(
                obs.clone(),
                &self.target,
                &format!("{event}{}", self.suffix),
                id,
                reader,
            )
            .await
    }
}
