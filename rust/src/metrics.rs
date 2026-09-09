use crate::observable::Observable;
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

pub(crate) enum ValueState {
    Counter(i64),
    Gauge(f64),
    Histogram { count: u64, sum: f64 },
}
struct MetricState {
    value: ValueState,
    pending: Option<Value>,
    publishing: bool,
}
pub(crate) struct Definition {
    kind: &'static str,
    description: String,
    unit: String,
    started: String,
    state: Arc<Mutex<MetricState>>,
}
#[derive(Clone)]
pub struct Metric {
    obs: Observable,
    name: String,
    description: String,
    unit: String,
    started: String,
    state: Arc<Mutex<MetricState>>,
}
impl Observable {
    pub fn counter(&self, name: &str, description: &str, unit: &str) -> Result<Metric> {
        Metric::new(self, name, description, unit, ValueState::Counter(0))
    }
    pub fn gauge(&self, name: &str, description: &str, unit: &str) -> Result<Metric> {
        Metric::new(self, name, description, unit, ValueState::Gauge(0.0))
    }
    pub fn histogram(&self, name: &str, description: &str, unit: &str) -> Result<Metric> {
        Metric::new(
            self,
            name,
            description,
            unit,
            ValueState::Histogram { count: 0, sum: 0.0 },
        )
    }
}
impl Metric {
    fn new(
        obs: &Observable,
        name: &str,
        description: &str,
        unit: &str,
        state: ValueState,
    ) -> Result<Self> {
        let kind = match state {
            ValueState::Counter(_) => "counter",
            ValueState::Gauge(_) => "gauge",
            ValueState::Histogram { .. } => "histogram",
        };
        let mut metrics = obs.backend.metrics.lock().unwrap();
        let definition = metrics
            .entry((obs.plugin.clone(), name.into()))
            .or_insert_with(|| Definition {
                kind,
                description: description.into(),
                unit: unit.into(),
                started: chrono::Utc::now()
                    .timestamp_nanos_opt()
                    .unwrap_or_default()
                    .to_string(),
                state: Arc::new(Mutex::new(MetricState {
                    value: state,
                    pending: None,
                    publishing: false,
                })),
            });
        ensure!(
            definition.kind == kind
                && definition.description == description
                && definition.unit == unit,
            "conflicting metric definition for {}/{name}",
            obs.plugin
        );
        Ok(Self {
            obs: obs.clone(),
            name: name.into(),
            description: description.into(),
            unit: unit.into(),
            started: definition.started.clone(),
            state: definition.state.clone(),
        })
    }
    fn update(&self, change: impl FnOnce(&mut ValueState) -> Result<()>) -> Result<()> {
        let mut state = self.state.lock().unwrap();
        change(&mut state.value)?;
        let mut value = match state.value {
            ValueState::Counter(value) => json!({"kind":"counter","value":value}),
            ValueState::Gauge(value) => json!({"kind":"gauge","value":value}),
            ValueState::Histogram { count, sum } => {
                json!({"kind":"histogram","count":count,"sum":sum})
            }
        };
        for (key, item) in [
            ("signal", json!("metrics")),
            ("plugin", json!(self.obs.plugin)),
            ("name", json!(self.name)),
            ("description", json!(self.description)),
            ("unit", json!(self.unit)),
            ("startedNs", json!(self.started)),
            (
                "timestampNs",
                json!(
                    chrono::Utc::now()
                        .timestamp_nanos_opt()
                        .unwrap_or_default()
                        .to_string()
                ),
            ),
        ] {
            value[key] = item;
        }
        // Samples are cumulative, so only the newest pending value is needed while a
        // publisher is inside an observer callback.
        state.pending = Some(value);
        if state.publishing {
            return Ok(());
        }
        state.publishing = true;
        loop {
            let value = state.pending.take().unwrap();
            drop(state);
            self.obs.backend.record(value);
            state = self.state.lock().unwrap();
            if state.pending.is_none() {
                state.publishing = false;
                break;
            }
        }
        Ok(())
    }
    pub fn increment(&self, delta: i64) -> Result<()> {
        self.update(|state| {
            let ValueState::Counter(value) = state else {
                anyhow::bail!("increment requires a counter")
            };
            ensure!(delta >= 0, "counter increment must be nonnegative");
            *value = value
                .checked_add(delta)
                .ok_or_else(|| anyhow::anyhow!("counter overflow"))?;
            Ok(())
        })
    }
    pub fn set(&self, value: f64) -> Result<()> {
        self.update(|state| {
            ensure!(value.is_finite(), "metric value must be finite");
            let ValueState::Gauge(current) = state else {
                anyhow::bail!("set requires a gauge")
            };
            *current = value;
            Ok(())
        })
    }
    pub fn add(&self, delta: f64) -> Result<()> {
        self.update(|state| {
            let ValueState::Gauge(current) = state else {
                anyhow::bail!("add requires a gauge")
            };
            let value = *current + delta;
            ensure!(value.is_finite(), "metric value must be finite");
            *current = value;
            Ok(())
        })
    }
    pub fn record(&self, value: f64) -> Result<()> {
        self.update(|state| {
            let ValueState::Histogram { count, sum } = state else {
                anyhow::bail!("record requires a histogram")
            };
            ensure!(
                value.is_finite() && (*sum + value).is_finite(),
                "histogram value must be finite"
            );
            let next = count
                .checked_add(1)
                .ok_or_else(|| anyhow::anyhow!("histogram overflow"))?;
            *count = next;
            *sum += value;
            Ok(())
        })
    }
    pub fn snapshot(&self) -> Value {
        match self.state.lock().unwrap().value {
            ValueState::Counter(value) => json!(value),
            ValueState::Gauge(value) => json!(value),
            ValueState::Histogram { count, sum } => json!({"count":count,"sum":sum}),
        }
    }
}
