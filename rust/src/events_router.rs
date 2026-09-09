use crate::{
    events::{Bus, Handler, Reader, StreamHandler},
    observable::Observable,
};
use anyhow::{Result, bail, ensure};
use async_trait::async_trait;
use serde_json::Value;
use std::{sync::Arc, time::Duration};

pub(crate) struct Router(pub Vec<(Arc<dyn Bus>, Value)>);
pub(crate) fn validate(filter: &Value) -> Result<()> {
    fn strings(value: &Value) -> bool {
        value
            .as_array()
            .is_some_and(|v| v.iter().all(Value::is_string))
    }
    match filter {
        Value::Null => {}
        Value::Array(_) => ensure!(strings(filter), "event filter lists must contain strings"),
        Value::Object(entries) => {
            for entry in entries.values() {
                ensure!(
                    entry.is_boolean()
                        || strings(entry)
                        || (entry.is_object()
                            && entry["enabled"].is_boolean()
                            && strings(&entry["plugins"])),
                    "invalid event filter operation"
                );
            }
        }
        _ => bail!("event filter must be a list or object"),
    }
    Ok(())
}
fn matches(filter: &Value, operation: &str, plugin: &str) -> bool {
    fn contains(value: &Value, key: &str) -> bool {
        value.as_array().is_some_and(|v| v.iter().any(|v| v == key))
    }
    match filter {
        Value::Null => true,
        Value::Array(_) => contains(filter, operation),
        Value::Object(entries) => match entries.get(operation) {
            Some(Value::Bool(value)) => *value,
            Some(value @ Value::Array(_)) => contains(value, plugin),
            Some(value @ Value::Object(_)) => {
                value["enabled"] == true && contains(&value["plugins"], plugin)
            }
            _ => false,
        },
        _ => false,
    }
}
impl Router {
    fn route(&self, operation: &str, plugin: &str) -> Result<&Arc<dyn Bus>> {
        self.0
            .iter()
            .find(|(_, filter)| matches(filter, operation, plugin))
            .map(|(bus, _)| bus)
            .ok_or_else(|| anyhow::anyhow!("no events backend matches {operation} for {plugin}"))
    }
}
#[async_trait]
impl Bus for Router {
    async fn listen(&self, kind: &str, target: &str, event: &str, handler: Handler) -> Result<()> {
        let operation = match kind {
            "event" => "onEvent",
            "returnable" => "onReturnableEvent",
            "broadcast" => "onBroadcast",
            _ => bail!("unknown event kind"),
        };
        self.route(operation, target)?
            .listen(kind, target, event, handler)
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
        let operation = match kind {
            "event" => "emitEvent",
            "returnable" => "emitEventAndReturn",
            "broadcast" => "emitBroadcast",
            _ => bail!("unknown event kind"),
        };
        self.route(operation, target)?
            .emit(obs, kind, target, event, value, timeout)
            .await
    }
    async fn receive(
        &self,
        obs: Observable,
        target: &str,
        event: &str,
        handler: StreamHandler,
        timeout: Duration,
    ) -> Result<String> {
        self.route("receiveStream", target)?
            .receive(obs, target, event, handler, timeout)
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
        self.route("sendStream", target)?
            .send(obs, target, event, id, reader)
            .await
    }
    // Host owns shutdown and monitors every underlying transport.
    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{events::LocalBus, json, observable::Backend};
    #[tokio::test]
    async fn filtered_backends_keep_unfiltered_fallback() -> Result<()> {
        let selected: Arc<dyn Bus> = Arc::new(LocalBus::default());
        let fallback: Arc<dyn Bus> = Arc::new(LocalBus::default());
        let filter = json!({"onReturnableEvent":["worker"],"emitEventAndReturn":{"enabled":true,"plugins":["worker"]}});
        validate(&filter)?;
        let router = Router(vec![
            (selected.clone(), filter),
            (fallback.clone(), Value::Null),
        ]);
        let echo: Handler = Arc::new(|_, value| Box::pin(async { Ok(value) }));
        router
            .listen("returnable", "worker", "echo", echo.clone())
            .await?;
        router.listen("returnable", "other", "echo", echo).await?;
        let obs = Observable::new("test", Arc::new(Backend::default()));
        for (bus, target) in [(selected, "worker"), (fallback, "other")] {
            assert_eq!(
                bus.emit(
                    obs.clone(),
                    "returnable",
                    target,
                    "echo",
                    json!(target),
                    Duration::from_secs(1)
                )
                .await?,
                json!(target)
            );
            bus.shutdown().await?;
        }
        assert!(validate(&json!({"emitEvent":42})).is_err());
        assert!(!matches(&json!([]), "onEvent", "worker"));
        Ok(())
    }
}
