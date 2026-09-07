use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::{Arc, RwLock};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trace {
    #[serde(rename = "t")]
    pub trace_id: String,
    #[serde(rename = "s")]
    pub span_id: String,
}
impl Default for Trace {
    fn default() -> Self {
        Self {
            trace_id: Uuid::new_v4().simple().to_string(),
            span_id: Uuid::new_v4().simple().to_string()[..16].into(),
        }
    }
}
impl Trace {
    pub fn validate(&self) -> bool {
        self.trace_id.len() == 32
            && self.span_id.len() == 16
            && self.trace_id.bytes().any(|c| c != b'0')
            && self.span_id.bytes().any(|c| c != b'0')
            && self
                .trace_id
                .bytes()
                .chain(self.span_id.bytes())
                .all(|c| c.is_ascii_hexdigit())
    }
}
#[async_trait::async_trait]
pub trait Observer: Send + Sync {
    fn record(&self, value: Value);
    async fn shutdown(&self) -> anyhow::Result<()> {
        Ok(())
    }
}
#[derive(Default)]
pub struct Backend {
    plugins: RwLock<Vec<Arc<dyn Observer>>>,
    pub(crate) metrics:
        std::sync::Mutex<std::collections::BTreeMap<(String, String), crate::metrics::Definition>>,
}
impl Backend {
    pub fn add(&self, plugin: Arc<dyn Observer>) {
        self.plugins.write().unwrap().push(plugin);
    }
    pub async fn shutdown(&self) -> anyhow::Result<()> {
        let plugins = std::mem::take(&mut *self.plugins.write().unwrap());
        let mut errors = Vec::new();
        for plugin in plugins.into_iter().rev() {
            if let Err(error) = plugin.shutdown().await {
                errors.push(error.to_string())
            }
        }
        anyhow::ensure!(
            errors.is_empty(),
            "observable shutdown failed: {}",
            errors.join(", ")
        );
        Ok(())
    }
    pub fn record(&self, value: Value) {
        let plugins = self.plugins.read().unwrap().clone();
        if plugins.is_empty() {
            if value["signal"] == "logs" {
                eprintln!("{value}");
            }
        } else {
            for plugin in plugins {
                plugin.record(value.clone());
            }
        }
    }
}
#[derive(Clone)]
pub struct Observable {
    pub trace: Trace,
    pub plugin: String,
    pub backend: Arc<Backend>,
}
impl Observable {
    pub fn new(plugin: impl Into<String>, backend: Arc<Backend>) -> Self {
        Self {
            trace: Trace::default(),
            plugin: plugin.into(),
            backend,
        }
    }
    pub fn with_trace(&self, trace: Trace, plugin: impl Into<String>) -> Self {
        Self {
            trace,
            plugin: plugin.into(),
            backend: self.backend.clone(),
        }
    }
    pub fn log(&self, level: &str, message: &str, metadata: Value) {
        self.backend.record(json!({"signal":"logs","timestamp":chrono::Utc::now().to_rfc3339(),"level":level,"message":message,"meta":metadata,"plugin":self.plugin,"traceId":self.trace.trace_id,"spanId":self.trace.span_id}));
    }
    pub fn info(&self, message: &str, metadata: Value) {
        self.log("info", message, metadata);
    }
    pub fn span(&self, name: impl Into<String>) -> Span {
        let mut obs = self.clone();
        obs.trace.span_id = Trace::default().span_id;
        Span {
            observable: obs,
            parent: self.trace.span_id.clone(),
            name: name.into(),
            started: chrono::Utc::now(),
            error: None,
        }
    }
}
pub struct Span {
    pub observable: Observable,
    parent: String,
    name: String,
    started: chrono::DateTime<chrono::Utc>,
    error: Option<String>,
}
impl Span {
    pub fn error(&mut self, error: impl std::fmt::Display) {
        self.error = Some(error.to_string());
    }
}
impl Drop for Span {
    fn drop(&mut self) {
        self.observable.backend.record(json!({"signal":"traces","name":self.name,"plugin":self.observable.plugin,"traceId":self.observable.trace.trace_id,"spanId":self.observable.trace.span_id,"parentSpanId":self.parent,"startedNs":self.started.timestamp_nanos_opt().unwrap_or_default().to_string(),"endedNs":chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default().to_string(),"error":self.error,"attributes":{}}));
    }
}
