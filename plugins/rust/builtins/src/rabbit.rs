use anyhow::{Context, Result, bail, ensure};
use async_trait::async_trait;
use bsb::{
    events::{Bus, Handler, Reader, StreamHandler},
    observable::{Observable, Trace},
};
use futures_util::{StreamExt, future::BoxFuture};
use lapin::{
    BasicProperties, Channel, Confirmation, Connection, ConnectionProperties, Consumer,
    ExchangeKind,
    message::Delivery,
    options::*,
    types::{AMQPValue, FieldTable},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::{Mutex as AsyncMutex, mpsc, oneshot};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    platform_key: Option<String>,
    fatal_on_disconnect: bool,
    prefetch: u16,
    endpoints: Vec<String>,
    credentials: Credentials,
    unique_id: Option<String>,
}
#[derive(Clone, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct Credentials {
    username: String,
    password: String,
}
impl Default for Credentials {
    fn default() -> Self {
        Self {
            username: "guest".into(),
            password: "guest".into(),
        }
    }
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            platform_key: None,
            fatal_on_disconnect: true,
            prefetch: 10,
            endpoints: vec!["amqp://localhost".into()],
            credentials: Credentials::default(),
            unique_id: Some(hostname()),
        }
    }
}
fn hostname() -> String {
    std::env::var("HOSTNAME").unwrap_or_else(|_| "rust".into())
}
fn settings(raw: Value) -> Result<Settings> {
    let mut config: Settings = serde_json::from_value(raw)?;
    config.unique_id.get_or_insert_with(hostname);
    Ok(config)
}
type WireHandler = Arc<dyn Fn(Delivery, Value) -> BoxFuture<'static, Result<()>> + Send + Sync>;
pub(super) struct Receiver {
    pub peer: String,
    pub timeout: Duration,
    pub start: Option<oneshot::Sender<Value>>,
    pub data: mpsc::Sender<Value>,
}
pub(super) struct Sender {
    pub peer: String,
    pub controls: mpsc::Sender<Value>,
}
#[derive(Default)]
pub(super) struct Pending {
    pub rpc: HashMap<String, oneshot::Sender<Result<Value>>>,
    pub receivers: HashMap<String, Receiver>,
    pub senders: HashMap<String, Sender>,
}
pub(super) struct Inner {
    config: Settings,
    pub(super) id: String,
    pub(super) obs: Observable,
    pub(super) cancel: CancellationToken,
    failure: CancellationToken,
    producer: AsyncMutex<Option<Arc<Connection>>>,
    consumer: AsyncMutex<Option<Arc<Connection>>>,
    publisher: AsyncMutex<Option<Channel>>,
    pub(super) pending: Mutex<Pending>,
    tasks: Mutex<Vec<tokio::task::JoinHandle<()>>>,
}
#[derive(Clone)]
pub struct Rabbit {
    pub(super) inner: Arc<Inner>,
}
pub(super) struct Guard {
    pub bus: Rabbit,
    pub id: String,
    pub kind: u8,
}
impl Drop for Guard {
    fn drop(&mut self) {
        let mut pending = self.bus.inner.pending.lock().unwrap();
        match self.kind {
            0 => {
                pending.rpc.remove(&self.id);
            }
            1 => {
                pending.receivers.remove(&self.id);
            }
            _ => {
                pending.senders.remove(&self.id);
            }
        }
    }
}
impl Rabbit {
    pub async fn new(raw: Value, obs: Observable) -> Result<Self> {
        let mut config = settings(raw)?;
        let unique_id = config.unique_id.as_ref().unwrap();
        ensure!(
            !config.endpoints.is_empty() && config.prefetch > 0,
            "invalid Rabbit endpoints or prefetch"
        );
        ensure!(!unique_id.contains("||"), "invalid Rabbit unique ID");
        let mut vhost = None;
        for endpoint in &mut config.endpoints {
            let mut url = reqwest::Url::parse(endpoint)?;
            ensure!(
                url.has_host()
                    && ["amqp", "amqps"].contains(&url.scheme())
                    && url.fragment().is_none(),
                "invalid Rabbit endpoint"
            );
            if let Some(vhost) = &vhost {
                ensure!(
                    vhost == url.path(),
                    "Rabbit endpoints must share a virtual host"
                )
            } else {
                vhost = Some(url.path().to_owned())
            };
            url.set_username(&config.credentials.username)
                .map_err(|_| anyhow::anyhow!("invalid Rabbit username"))?;
            url.set_password(Some(&config.credentials.password))
                .map_err(|_| anyhow::anyhow!("invalid Rabbit password"))?;
            *endpoint = url.to_string();
        }
        let id = format!("{}-{}", unique_id, uuid::Uuid::new_v4());
        let bus = Self {
            inner: Arc::new(Inner {
                config,
                id,
                obs,
                cancel: CancellationToken::new(),
                failure: CancellationToken::new(),
                producer: AsyncMutex::new(None),
                consumer: AsyncMutex::new(None),
                publisher: AsyncMutex::new(None),
                pending: Mutex::new(Pending::default()),
                tasks: Mutex::new(vec![]),
            }),
        };
        let setup = async {
            bus.connection(true).await?;
            bus.connection(false).await?;
            for kind in ["91kr", "91se", "91sd"] {
                let cloned = bus.clone();
                let handler: WireHandler = Arc::new(move |delivery, body| {
                    let bus = cloned.clone();
                    Box::pin(async move {
                        match kind {
                            "91kr" => bus.reply(delivery, body),
                            "91se" => bus.stream_control(delivery, body),
                            _ => bus.stream_data(delivery, body).await,
                        }
                    })
                });
                bus.consume(
                    bus.queue(kind, &[&bus.inner.id])?,
                    60000,
                    true,
                    None,
                    true,
                    handler,
                )
                .await?;
            }
            Ok::<_, anyhow::Error>(())
        }
        .await;
        if let Err(error) = setup {
            let _ = bus.shutdown().await;
            return Err(error);
        }
        Ok(bus)
    }
    pub(super) fn spawn(&self, future: impl std::future::Future<Output = ()> + Send + 'static) {
        let mut tasks = self.inner.tasks.lock().unwrap();
        tasks.retain(|task| !task.is_finished());
        tasks.push(tokio::spawn(future));
    }
    fn platform(&self, name: &str) -> String {
        match &self.inner.config.platform_key {
            Some(key) => format!("{name}-{key}"),
            None => name.into(),
        }
    }
    pub(super) fn queue(&self, kind: &str, parts: &[&str]) -> Result<String> {
        let name = format!("{}-{}", self.platform(kind), parts.join("-"));
        ensure!(
            name.len() <= 255 && !name.contains('\0'),
            "invalid Rabbit queue name"
        );
        Ok(name)
    }
    async fn connection(&self, producer: bool) -> Result<Arc<Connection>> {
        let mut slot = if producer {
            self.inner.producer.lock().await
        } else {
            self.inner.consumer.lock().await
        };
        ensure!(!self.inner.cancel.is_cancelled(), "Rabbit closed");
        if let Some(connection) = slot.as_ref().filter(|c| c.status().connected()) {
            return Ok(connection.clone());
        }
        for endpoint in &self.inner.config.endpoints {
            if let Ok(Ok(connection)) = tokio::time::timeout(
                Duration::from_secs(10),
                Connection::connect(endpoint, ConnectionProperties::default()),
            )
            .await
            {
                let connection = Arc::new(connection);
                *slot = Some(connection.clone());
                let bus = self.clone();
                let monitored = connection.clone();
                self.spawn(async move{loop{tokio::select!{_=bus.inner.cancel.cancelled()=>return,_=tokio::time::sleep(Duration::from_secs(1))=>{if !monitored.status().connected(){if bus.inner.config.fatal_on_disconnect{bus.inner.failure.cancel();bus.inner.cancel.cancel();}return}}}}});
                return Ok(connection);
            }
        }
        bail!("Rabbit connection failed")
    }
    async fn topology(&self, channel: &Channel) -> Result<()> {
        let deadletter = self.platform("better.service9.deadletter");
        channel
            .exchange_declare(
                deadletter.clone().into(),
                ExchangeKind::Topic,
                ExchangeDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                FieldTable::default(),
            )
            .await?;
        let mut args = FieldTable::default();
        args.insert("x-message-ttl".into(), AMQPValue::LongInt(604800000));
        channel
            .queue_declare(
                deadletter.clone().into(),
                QueueDeclareOptions {
                    durable: true,
                    ..Default::default()
                },
                args,
            )
            .await?;
        channel
            .queue_bind(
                deadletter.clone().into(),
                deadletter.into(),
                "#".into(),
                QueueBindOptions::default(),
                FieldTable::default(),
            )
            .await?;
        channel
            .exchange_declare(
                self.platform("better.service9.broadcast.direct").into(),
                ExchangeKind::Direct,
                ExchangeDeclareOptions::default(),
                FieldTable::default(),
            )
            .await?;
        Ok(())
    }
    async fn declare(
        &self,
        channel: &Channel,
        name: &str,
        ttl: i32,
        exclusive: bool,
    ) -> Result<()> {
        let mut args = FieldTable::default();
        for key in ["x-message-ttl", "x-expires"] {
            args.insert(key.into(), AMQPValue::LongInt(ttl));
        }
        args.insert(
            "x-dead-letter-exchange".into(),
            AMQPValue::LongString(self.platform("better.service9.deadletter").into()),
        );
        channel
            .queue_declare(
                name.into(),
                QueueDeclareOptions {
                    durable: !exclusive,
                    exclusive,
                    auto_delete: exclusive,
                    ..Default::default()
                },
                args,
            )
            .await?;
        Ok(())
    }
    async fn setup(
        &self,
        name: &str,
        ttl: i32,
        exclusive: bool,
        routing: Option<&str>,
        ordered: bool,
    ) -> Result<(Channel, Consumer)> {
        let channel = self.connection(false).await?.create_channel().await?;
        let result = async {
            self.topology(&channel).await?;
            self.declare(&channel, name, ttl, exclusive).await?;
            if let Some(route) = routing {
                channel
                    .queue_bind(
                        name.into(),
                        self.platform("better.service9.broadcast.direct").into(),
                        route.into(),
                        QueueBindOptions::default(),
                        FieldTable::default(),
                    )
                    .await?;
            }
            channel
                .basic_qos(
                    if ordered {
                        1
                    } else {
                        self.inner.config.prefetch
                    },
                    BasicQosOptions::default(),
                )
                .await?;
            Ok::<_, anyhow::Error>(
                channel
                    .basic_consume(
                        name.into(),
                        "".into(),
                        BasicConsumeOptions::default(),
                        FieldTable::default(),
                    )
                    .await?,
            )
        }
        .await;
        match result {
            Ok(consumer) => Ok((channel, consumer)),
            Err(error) => {
                let _ = channel.close(200, "setup failed".into()).await;
                Err(error)
            }
        }
    }
    async fn consume(
        &self,
        name: String,
        ttl: i32,
        exclusive: bool,
        routing: Option<String>,
        ordered: bool,
        handler: WireHandler,
    ) -> Result<()> {
        let initial = self
            .setup(&name, ttl, exclusive, routing.as_deref(), ordered)
            .await?;
        let bus = self.clone();
        self.spawn(async move{let(mut channel,mut consumer)=initial;
   // ponytail: poison counts are process-local; broker delivery limits preserve them across restarts.
   let attempts=Arc::new(Mutex::new(HashMap::<String,u8>::new()));
   loop{
    let process=consumer.for_each_concurrent(if ordered{1}else{bus.inner.config.prefetch as usize},|delivery|{let handler=handler.clone();let attempts=attempts.clone();async move{if let Ok(delivery)=delivery{ let acker=delivery.acker.clone();
     let key=delivery.properties.message_id().as_ref().map(ToString::to_string).unwrap_or_else(||{use sha2::Digest;format!("{:x}",sha2::Sha256::digest(&delivery.data))});
     let result=async{ensure!(delivery.data.len()<=16*1024*1024,"Rabbit message exceeds 16 MiB");let body:Value=serde_json::from_slice(&delivery.data)?;ensure!(body.is_object(),"Rabbit body must be an object");handler(delivery,body).await}.await;
     if result.is_ok(){attempts.lock().unwrap().remove(&key);let _=acker.ack(BasicAckOptions::default()).await;}else{let count={let mut attempts=attempts.lock().unwrap();let count=attempts.get(&key).copied().unwrap_or(0)+1;if attempts.len()>=10000{attempts.clear();}if count<10{attempts.insert(key,count);}else{attempts.remove(&key);}count};eprintln!("BSB Rabbit delivery failed, attempt {count}");let _=acker.nack(BasicNackOptions{multiple:false,requeue:count<10}).await;}
    }}});
    tokio::select!{_=bus.inner.cancel.cancelled()=>{let _=channel.close(200,"shutdown".into()).await;return},_=process=>{}}
    let _=channel.close(200,"consumer ended".into()).await;
    if bus.inner.config.fatal_on_disconnect{bus.inner.failure.cancel();bus.inner.cancel.cancel();return}
    loop{tokio::select!{_=bus.inner.cancel.cancelled()=>return,_=tokio::time::sleep(Duration::from_secs(1))=>{}};if let Ok(next)=bus.setup(&name,ttl,exclusive,routing.as_deref(),ordered).await{(channel,consumer)=next;break}}
   }
  });
        Ok(())
    }
    pub(super) async fn publish(
        &self,
        queue: &str,
        body: Value,
        ttl: u64,
        correlation: &str,
        declare_ttl: i32,
        broadcast: bool,
    ) -> Result<()> {
        let data = serde_json::to_vec(&body)?;
        ensure!(
            data.len() <= 16 * 1024 * 1024,
            "Rabbit message exceeds 16 MiB"
        );
        let work = async {
            let mut publisher = self.inner.publisher.lock().await;
            ensure!(!self.inner.cancel.is_cancelled(), "Rabbit closed");
            if publisher
                .as_ref()
                .is_none_or(|channel| !channel.status().connected())
            {
                let channel = self.connection(true).await?.create_channel().await?;
                self.topology(&channel).await?;
                channel
                    .confirm_select(ConfirmSelectOptions::default())
                    .await?;
                *publisher = Some(channel)
            }
            let channel = publisher.as_ref().unwrap();
            if declare_ttl > 0 {
                self.declare(channel, queue, declare_ttl, false).await?;
            }
            let exchange = if broadcast {
                self.platform("better.service9.broadcast.direct")
            } else {
                String::new()
            };
            let properties = BasicProperties::default()
                .with_content_type("application/json".into())
                .with_delivery_mode(2)
                .with_message_id(uuid::Uuid::new_v4().to_string().into())
                .with_app_id(self.inner.id.clone().into())
                .with_correlation_id(correlation.into())
                .with_expiration(ttl.to_string().into());
            let confirmation = channel
                .basic_publish(
                    exchange.into(),
                    queue.into(),
                    BasicPublishOptions {
                        mandatory: !broadcast,
                        ..Default::default()
                    },
                    &data,
                    properties,
                )
                .await?
                .await?;
            ensure!(
                matches!(confirmation, Confirmation::Ack(None)),
                "Rabbit publication rejected or unroutable"
            );
            Ok(())
        };
        tokio::select! {result=tokio::time::timeout(Duration::from_secs(5),work)=>result.context("Rabbit publish timeout")?,_=self.inner.cancel.cancelled()=>bail!("Rabbit closed")}
    }
    fn incoming(&self, body: &Value, target: &str) -> Result<(Observable, Value)> {
        let args = body["args"].as_array().context("Rabbit args required")?;
        ensure!(args.len() <= 1, "one typed payload required");
        let trace: Trace = serde_json::from_value(body["trace"].clone())?;
        ensure!(trace.validate(), "invalid trace context");
        Ok((
            self.inner.obs.with_trace(trace, target),
            args.first().cloned().unwrap_or(Value::Null),
        ))
    }
    fn reply(&self, delivery: Delivery, body: Value) -> Result<()> {
        let correlation = delivery
            .properties
            .correlation_id()
            .as_ref()
            .context("RPC correlation required")?
            .as_str();
        let (id, rejected) = if let Some(id) = correlation.strip_suffix("-resolve") {
            (id, false)
        } else if let Some(id) = correlation.strip_suffix("-reject") {
            (id, true)
        } else {
            bail!("invalid RPC correlation")
        };
        if let Some(sender) = self.inner.pending.lock().unwrap().rpc.remove(id) {
            let _ = sender.send(if rejected {
                Err(anyhow::anyhow!("remote handler: {}", body["error"]))
            } else {
                Ok(body["result"].clone())
            });
        }
        Ok(())
    }
}
#[async_trait]
impl Bus for Rabbit {
    async fn listen(&self, kind: &str, target: &str, event: &str, handler: Handler) -> Result<()> {
        let broadcast = kind == "broadcast";
        let rpc = kind == "returnable";
        ensure!(broadcast || rpc || kind == "event", "invalid event kind");
        let route = self.queue(
            if broadcast {
                "91eb"
            } else if rpc {
                "91ar"
            } else {
                "91eq"
            },
            &[target, event],
        )?;
        let name = if broadcast {
            broadcast_queue(&route, &uuid::Uuid::new_v4().to_string())?
        } else {
            route.clone()
        };
        let bus = self.clone();
        let target = target.to_owned();
        let event = event.to_owned();
        let wrapped: WireHandler = Arc::new(move |delivery, body| {
            let bus = bus.clone();
            let handler = handler.clone();
            let target = target.clone();
            let event = event.clone();
            Box::pin(async move {
                if rpc {
                    ensure!(
                        delivery
                            .properties
                            .app_id()
                            .as_ref()
                            .is_some_and(|v| !v.as_str().is_empty())
                            && delivery
                                .properties
                                .correlation_id()
                                .as_ref()
                                .is_some_and(|v| !v.as_str().is_empty()),
                        "RPC sender and correlation required"
                    );
                }
                let (obs, value) = bus.incoming(&body, &target)?;
                let mut span = obs.span(event);
                let result = handler(span.observable.clone(), value).await;
                if let Err(error) = &result {
                    span.error(error)
                }
                if !rpc {
                    return result.map(|_| ());
                }
                let sender = delivery
                    .properties
                    .app_id()
                    .as_ref()
                    .context("RPC sender required")?
                    .as_str();
                let correlation = delivery
                    .properties
                    .correlation_id()
                    .as_ref()
                    .context("RPC correlation required")?
                    .as_str();
                ensure!(
                    !sender.is_empty() && !correlation.is_empty(),
                    "RPC sender/correlation required"
                );
                let (outcome, body) = match result {
                    Ok(value) => (
                        "resolve",
                        json!({"trace":span.observable.trace,"result":value}),
                    ),
                    Err(error) => (
                        "reject",
                        json!({"trace":span.observable.trace,"error":error.to_string()}),
                    ),
                };
                bus.publish(
                    &bus.queue("91kr", &[sender])?,
                    body,
                    5000,
                    &format!("{correlation}-{outcome}"),
                    0,
                    false,
                )
                .await
            })
        });
        self.consume(
            name,
            if rpc { 60000 } else { 3600000 },
            broadcast,
            if broadcast { Some(route) } else { None },
            false,
            wrapped,
        )
        .await
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
        let body = json!({"trace":obs.trace,"args":[value]});
        let broadcast = kind == "broadcast";
        let rpc = kind == "returnable";
        ensure!(
            timeout > Duration::ZERO && timeout <= Duration::from_secs(86400),
            "invalid RPC timeout"
        );
        let queue = self.queue(
            if broadcast {
                "91eb"
            } else if rpc {
                "91ar"
            } else {
                "91eq"
            },
            &[target, event],
        )?;
        if !rpc {
            self.publish(
                &queue,
                body,
                3600000,
                "",
                if broadcast { 0 } else { 3600000 },
                broadcast,
            )
            .await?;
            return Ok(Value::Null);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let (sender, receiver) = oneshot::channel();
        {
            let mut pending = self.inner.pending.lock().unwrap();
            ensure!(pending.rpc.len() < 10000, "RPC pending limit reached");
            pending.rpc.insert(id.clone(), sender);
        }
        let _guard = Guard {
            bus: self.clone(),
            id: id.clone(),
            kind: 0,
        };
        let work = async {
            self.publish(
                &queue,
                body,
                timeout.as_millis() as u64 + 5000,
                &id,
                60000,
                false,
            )
            .await?;
            receiver.await.context("RPC response channel closed")?
        };
        tokio::select! {result=tokio::time::timeout(timeout,work)=>result.context("RPC deadline exceeded")?,_=self.inner.cancel.cancelled()=>bail!("Rabbit closed")}
    }
    async fn receive(
        &self,
        obs: Observable,
        target: &str,
        event: &str,
        handler: StreamHandler,
        timeout: Duration,
    ) -> Result<String> {
        self.receive_stream(obs, target, event, handler, timeout)
            .await
    }
    async fn send(
        &self,
        obs: Observable,
        target: &str,
        event: &str,
        id: &str,
        reader: Reader,
    ) -> Result<()> {
        self.send_stream(obs, target, event, id, reader).await
    }
    async fn failure(&self) -> String {
        self.inner.failure.cancelled().await;
        "Rabbit connection/consumer closed".into()
    }
    async fn shutdown(&self) -> Result<()> {
        self.inner.cancel.cancel();
        for slot in [&self.inner.consumer, &self.inner.producer] {
            if let Some(connection) = slot.lock().await.take() {
                let _ = tokio::time::timeout(
                    Duration::from_secs(5),
                    connection.close(200, "BSB shutdown".into()),
                )
                .await;
            }
        }
        let tasks = std::mem::take(&mut *self.inner.tasks.lock().unwrap());
        for mut task in tasks {
            if tokio::time::timeout(Duration::from_secs(5), &mut task)
                .await
                .is_err()
            {
                task.abort();
            }
        }
        *self.inner.pending.lock().unwrap() = Pending::default();
        Ok(())
    }
}

fn broadcast_queue(route: &str, consumer: &str) -> Result<String> {
    let name = format!("{route}-{consumer}");
    ensure!(
        name.len() <= 255 && !name.contains('\0'),
        "invalid Rabbit queue name"
    );
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::{Rabbit, broadcast_queue, hostname, settings};
    use bsb::observable::{Backend, Observable};
    use serde_json::json;
    use std::sync::Arc;

    #[test]
    fn broadcast_queue_validates_completed_utf8_name() {
        let consumer = "00000000-0000-0000-0000-000000000000";
        assert_eq!(
            broadcast_queue(&"\u{00e9}".repeat(109), consumer)
                .unwrap()
                .len(),
            255
        );
        assert!(broadcast_queue(&format!("{}a", "\u{00e9}".repeat(109)), consumer).is_err());
    }

    #[tokio::test]
    async fn stream_token_delimiter_is_rejected_before_connecting() {
        let obs = Observable::new("test", Arc::new(Backend::default()));
        let error = Rabbit::new(json!({"uniqueId":"worker||peer"}), obs)
            .await
            .err()
            .expect("invalid unique ID accepted");
        assert!(error.to_string().contains("unique ID"));
    }

    #[test]
    fn unique_id_defaults_for_missing_and_null() {
        assert_eq!(settings(json!({})).unwrap().unique_id, Some(hostname()));
        assert_eq!(
            settings(json!({"uniqueId":null})).unwrap().unique_id,
            Some(hostname())
        );
        assert_eq!(
            settings(json!({"uniqueId":"worker"})).unwrap().unique_id,
            Some("worker".into())
        );
    }
}
