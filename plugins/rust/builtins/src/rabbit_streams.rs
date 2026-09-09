use crate::rabbit::{Guard, Rabbit, Receiver, Sender};
use anyhow::{Context, Result, bail, ensure};
use bsb::{
    events::{Reader, StreamHandler, failed_reader},
    observable::{Observable, Trace},
};
use bytes::Bytes;
use lapin::message::Delivery;
use serde_json::{Value, json};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::AsyncReadExt,
    sync::{mpsc, oneshot},
};
use tokio_util::io::StreamReader;

pub fn decode_chunk(value: &Value) -> Result<Vec<u8>> {
    let value = if value.is_object() {
        ensure!(value["type"] == "Buffer", "invalid binary buffer");
        &value["data"]
    } else {
        value
    };
    if let Some(text) = value.as_str() {
        ensure!(text.len() <= 1024 * 1024, "stream chunk exceeds 1 MiB");
        return Ok(text.as_bytes().to_vec());
    }
    let values = value.as_array().context("stream bytes required")?;
    ensure!(values.len() <= 1024 * 1024, "stream chunk exceeds 1 MiB");
    values
        .iter()
        .map(|value| {
            let number = value.as_u64().context("invalid stream byte")?;
            Ok(u8::try_from(number)?)
        })
        .collect()
}
impl Rabbit {
    pub(super) async fn control(&self, peer: &str, correlation: &str, body: Value) -> Result<()> {
        self.publish(
            &self.queue("91se", &[peer])?,
            body,
            60000,
            correlation,
            0,
            false,
        )
        .await
    }
    pub(super) fn stream_control(&self, delivery: Delivery, body: Value) -> Result<()> {
        let correlation = delivery
            .properties
            .correlation_id()
            .as_ref()
            .context("stream correlation required")?
            .as_str();
        let peer = delivery
            .properties
            .app_id()
            .as_ref()
            .context("stream sender required")?
            .as_str();
        let mut pending = self.inner.pending.lock().unwrap();
        if let Some(id) = correlation.strip_prefix("s-") {
            if let Some(sender) = pending.senders.get(id) {
                ensure!(sender.peer == peer, "unexpected stream control sender");
                sender
                    .controls
                    .try_send(body)
                    .map_err(|_| anyhow::anyhow!("stream control queue full"))?;
            }
            return Ok(());
        }
        if let Some(id) = correlation.strip_prefix("r-") {
            if let Some(receiver) = pending.receivers.get_mut(id) {
                if body["type"] == "start" {
                    ensure!(
                        !peer.is_empty()
                            && body["myId"] == peer
                            && (receiver.peer.is_empty() || receiver.peer == peer),
                        "invalid stream sender"
                    );
                    receiver.peer = peer.into();
                    if let Some(start) = receiver.start.take() {
                        let _ = start.send(body);
                    }
                    return Ok(());
                }
                if body["type"] == "timeout" && receiver.peer == peer {
                    receiver
                        .data
                        .try_send(body)
                        .map_err(|_| anyhow::anyhow!("stream data queue full"))?;
                    return Ok(());
                }
                bail!("invalid stream control")
            }
            return Ok(());
        }
        bail!("invalid stream correlation")
    }
    pub(super) async fn stream_data(&self, delivery: Delivery, body: Value) -> Result<()> {
        let id = delivery
            .properties
            .correlation_id()
            .as_ref()
            .context("stream correlation required")?
            .as_str();
        let peer = delivery
            .properties
            .app_id()
            .as_ref()
            .context("stream sender required")?
            .as_str();
        let target = {
            let pending = self.inner.pending.lock().unwrap();
            match pending.receivers.get(id) {
                Some(receiver) => {
                    ensure!(
                        !receiver.peer.is_empty() && receiver.peer == peer,
                        "unexpected stream data sender"
                    );
                    (receiver.data.clone(), receiver.timeout)
                }
                None => return Ok(()),
            }
        };
        match body["type"].as_str() {
            Some("data") => {
                decode_chunk(&body["data"])?;
            }
            Some("event") => ensure!(
                body["event"] == "end" || body["event"] == "error",
                "invalid stream event"
            ),
            _ => bail!("invalid stream data"),
        };
        tokio::time::timeout(target.1, target.0.send(body))
            .await
            .context("stream receiver stalled")?
            .context("stream receiver closed")?;
        self.control(
            peer,
            &format!("s-{id}"),
            json!({"type":"receipt","timeout":target.1.as_millis()}),
        )
        .await
    }
    pub(super) async fn receive_stream(
        &self,
        obs: Observable,
        target: &str,
        _event: &str,
        handler: StreamHandler,
        timeout: Duration,
    ) -> Result<String> {
        ensure!(
            timeout.as_secs() > 0 && timeout.as_secs() <= 86400 && timeout.subsec_nanos() == 0,
            "stream timeout must be whole seconds in 1..86400"
        );
        ensure!(!self.inner.cancel.is_cancelled(), "Rabbit closed");
        let id = uuid::Uuid::new_v4().to_string();
        let (start_tx, start_rx) = oneshot::channel();
        let (data_tx, data_rx) = mpsc::channel(8);
        {
            let mut pending = self.inner.pending.lock().unwrap();
            ensure!(
                pending.receivers.len() < 1024,
                "stream receiver limit reached"
            );
            pending.receivers.insert(
                id.clone(),
                Receiver {
                    peer: String::new(),
                    timeout,
                    start: Some(start_tx),
                    data: data_tx,
                },
            );
        }
        let bus = self.clone();
        let stream_id = id.clone();
        let target = target.to_owned();
        self.spawn(async move{
   let _guard=Guard{bus:bus.clone(),id:stream_id.clone(),kind:1};let ended=Arc::new(AtomicBool::new(false));let mut peer=String::new();let mut obs=obs;let mut called=false;
   let work=async{
    let start=tokio::time::timeout(Duration::from_secs(30),start_rx).await.context("stream sender did not start")?.context("stream registration closed")?;
    peer=start["myId"].as_str().context("stream sender required")?.into();let trace:Trace=serde_json::from_value(start["trace"].clone())?;ensure!(trace.validate(),"invalid stream trace");obs=bus.inner.obs.with_trace(trace,&target);let mut span=obs.span("stream.receive");
    bus.control(&peer,&format!("s-{stream_id}"),json!({"type":"receipt","timeout":timeout.as_millis(),"trace":span.observable.trace})).await?;
    let reader_bus=bus.clone();let reader_peer=peer.clone();let reader_id=stream_id.clone();let eof=ended.clone();
    let packets=futures_util::stream::try_unfold(data_rx,move|mut incoming|{let bus=reader_bus.clone();let peer=reader_peer.clone();let id=reader_id.clone();let eof=eof.clone();async move{
     let work=async{bus.control(&peer,&format!("s-{id}"),json!({"type":"read"})).await?;let body=tokio::time::timeout(timeout,incoming.recv()).await.context("stream read deadline exceeded")?.context("stream closed")?;
      if body["type"]=="data"{Ok(Some((Bytes::from(decode_chunk(&body["data"])?),incoming)))}else if body["type"]=="event"&&body["event"]=="end"{eof.store(true,Ordering::SeqCst);Ok(None)}else{bail!("remote stream failed")}};
     tokio::select!{result=work=>result.map_err(|error:anyhow::Error|std::io::Error::other(error.to_string())),_=bus.inner.cancel.cancelled()=>Err(std::io::Error::other("Rabbit closed"))}
    }});
    let reader=Box::pin(StreamReader::new(Box::pin(packets)));
    called=true;let result=handler(span.observable.clone(),reader).await;if let Err(error)=&result{span.error(error)};result?;ensure!(ended.load(Ordering::SeqCst),"receiver must consume stream through EOF");Ok::<_,anyhow::Error>(())
   };
   let result=tokio::select!{result=work=>result,_=bus.inner.cancel.cancelled()=>Err(anyhow::anyhow!("Rabbit closed"))};
   if !called {if let Err(error)=&result {let _=tokio::time::timeout(Duration::from_secs(5),handler(obs.clone(),failed_reader(error.to_string()))).await;}}
   if !peer.is_empty()&&!bus.inner.cancel.is_cancelled(){let body=if result.is_ok(){json!({"type":"event","event":"end","trace":obs.trace})}else{json!({"type":"timeout"})};let _=bus.control(&peer,&format!("s-{stream_id}"),body).await;}
   if result.is_err(){obs.log("error","Stream receive failed",json!({}));}
  });
        Ok(format!("{}||{id}||{}", self.inner.id, timeout.as_secs()))
    }
    pub(super) async fn send_stream(
        &self,
        obs: Observable,
        _target: &str,
        _event: &str,
        id: &str,
        mut source: Reader,
    ) -> Result<()> {
        let parts: Vec<_> = id.split("||").collect();
        ensure!(
            parts.len() == 3 && !parts[0].is_empty() && !parts[1].is_empty(),
            "invalid stream ID"
        );
        let (peer, id) = (parts[0], parts[1]);
        let seconds: u64 = parts[2].parse()?;
        ensure!((1..=86400).contains(&seconds), "invalid stream timeout");
        let timeout = Duration::from_secs(seconds);
        let queue = self.queue("91sd", &[peer])?;
        let (tx, mut controls) = mpsc::channel(128);
        {
            let mut pending = self.inner.pending.lock().unwrap();
            ensure!(
                pending.senders.len() < 1024 && !pending.senders.contains_key(id),
                "stream already active or sender limit reached"
            );
            pending.senders.insert(
                id.into(),
                Sender {
                    peer: peer.into(),
                    controls: tx,
                },
            );
        }
        let _guard = Guard {
            bus: self.clone(),
            id: id.into(),
            kind: 2,
        };
        let work = async {
            self.control(
                peer,
                &format!("r-{id}"),
                json!({"type":"start","myId":self.inner.id,"trace":obs.trace}),
            )
            .await?;
            let mut ended = false;
            let mut wait = Duration::from_secs(30);
            loop {
                let control = tokio::time::timeout(wait, controls.recv())
                    .await
                    .context("stream control timeout")?
                    .context("stream controls closed")?;
                wait = timeout;
                if control["type"] == "receipt" {
                    continue;
                }
                if ended && control["type"] == "event" && control["event"] == "end" {
                    return Ok(());
                }
                ensure!(control["type"] == "read", "receiver failed or ended early");
                if ended {
                    continue;
                }
                let mut buffer = vec![0u8; 65536];
                let count = tokio::time::timeout(timeout, source.read(&mut buffer))
                    .await
                    .context("stream source stalled")??;
                buffer.truncate(count);
                let body = if count == 0 {
                    ended = true;
                    json!({"type":"event","event":"end","data":null,"trace":obs.trace})
                } else {
                    json!({"type":"data","data":{"type":"Buffer","data":buffer},"trace":obs.trace})
                };
                self.publish(&queue, body, 60000, id, 0, false).await?;
            }
        };
        let result = tokio::select! {result=work=>result,_=self.inner.cancel.cancelled()=>Err(anyhow::anyhow!("Rabbit closed"))};
        if result.is_err() && !self.inner.cancel.is_cancelled() {
            let _ = self
                .control(peer, &format!("r-{id}"), json!({"type":"timeout"}))
                .await;
        }
        result
    }
}
