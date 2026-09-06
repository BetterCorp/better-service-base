use bsb::{
    Result, Value, async_trait,
    contract::Contract,
    host::{Ordering, Registry, Service, ServiceContext},
    json,
};
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering as AtomicOrdering},
    },
    time::Instant,
};
pub mod bsbclients;
mod todo;
use bsbclients::{
    service_benchmarkify::*, service_default0::*, service_default1::*, service_default3::*,
};

const CONTRACTS: [(&str, &str); 7] = [
    (
        "service-default0",
        include_str!("../.bsb/schemas/service-default0.json"),
    ),
    (
        "service-default1",
        include_str!("../.bsb/schemas/service-default1.json"),
    ),
    (
        "service-default2",
        include_str!("../.bsb/schemas/service-default2.json"),
    ),
    (
        "service-default3",
        include_str!("../.bsb/schemas/service-default3.json"),
    ),
    (
        "service-default4",
        include_str!("../.bsb/schemas/service-default4.json"),
    ),
    (
        "service-benchmarkify",
        include_str!("../.bsb/schemas/service-benchmarkify.json"),
    ),
    (
        "service-demo-todo",
        include_str!("../.bsb/schemas/service-demo-todo.json"),
    ),
];
fn doc(properties: Value) -> Value {
    json!({"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"object","properties":properties,"unknownKeys":"reject"},"definitions":{},"extensions":{}})
}
pub fn register(registry: &mut Registry) -> Result<()> {
    for (name, data) in CONTRACTS {
        let mut contract: Contract = bsb::serde_json::from_str(data)?;
        contract.category = "service".into();
        contract.version = "1.0.0".into();
        contract.documentation = vec!["README.md".into()];
        if name != "service-demo-todo" {
            contract.config_schema = Some(doc(match name {
                "service-default0" => {
                    json!({"testa":{"kind":"number","min":0,"default":0},"testb":{"kind":"number","min":0,"default":0}})
                }
                "service-benchmarkify" => {
                    json!({"iterations":{"kind":"int32","min":1,"max":100000,"default":1000}})
                }
                _ => json!({}),
            }));
        }
        let mut ordering = Ordering::default();
        if name == "service-default3" {
            ordering.init_after = vec!["service-default2".into()]
        }
        registry.register(contract, ordering, move |config| {
            if name == "service-demo-todo" {
                Ok(Box::new(todo::Todo::new(config)?))
            } else {
                Ok(Box::new(Example {
                    name,
                    config,
                    running: Arc::new(AtomicBool::new(false)),
                }))
            }
        })?;
    }
    Ok(())
}
struct Example {
    name: &'static str,
    config: Value,
    running: Arc<AtomicBool>,
}
async fn multiply(_: bsb::observable::Observable, value: Value) -> Result<Value> {
    Ok(json!(
        value["a"]
            .as_f64()
            .ok_or_else(|| bsb::Error::msg("a required"))?
            * value["b"]
                .as_f64()
                .ok_or_else(|| bsb::Error::msg("b required"))?
    ))
}
#[async_trait]
impl Service for Example {
    async fn init(&mut self, host: &ServiceContext) -> Result<()> {
        match self.name {
            "service-default1" => {
                let zero = ServiceDefault0Client::new(&host.events, None)?;
                zero.on_calculate(|_, value| async move { Ok(value.a * value.b) })
                    .await?;
                zero.on_test(|obs, value| async move {
                    obs.info(&(value.a + &value.b), json!({}));
                    Ok(())
                })
                .await?;
                host.events
                    .listen(
                        "calculate",
                        Arc::new(|obs, value| Box::pin(multiply(obs, value))),
                    )
                    .await?;
                host.events
                    .listen(
                        "text.transform",
                        Arc::new(|_, value| {
                            Box::pin(async move {
                                let text = value["text"]
                                    .as_str()
                                    .ok_or_else(|| bsb::Error::msg("text required"))?;
                                Ok(json!(match value["transformation"].as_str() {
                                    Some("uppercase") => text.to_uppercase(),
                                    Some("lowercase") => text.to_lowercase(),
                                    Some("reverse") => text.chars().rev().collect(),
                                    Some("capitalize") => {
                                        let lower = text.to_lowercase();
                                        let mut chars = lower.chars();
                                        chars
                                            .next()
                                            .map(|first| {
                                                first.to_uppercase().to_string() + chars.as_str()
                                            })
                                            .unwrap_or_default()
                                    }
                                    _ => return Err(bsb::Error::msg("unknown transformation")),
                                }))
                            })
                        }),
                    )
                    .await?;
                let events = host.events.clone();
                host.events.listen("data.received",Arc::new(move|obs,value|{let events=events.clone();Box::pin(async move{events.emit(&obs,"data.processed",json!({"itemId":value["itemId"],"result":{"processed":true,"timestamp":chrono::Utc::now().to_rfc3339()},"processingTime":0}),None).await?;Ok(Value::Null)})})).await?;
                host.events
                    .listen(
                        "config.updated",
                        Arc::new(|obs, _| {
                            Box::pin(async move {
                                obs.info("Configuration updated", json!({}));
                                Ok(Value::Null)
                            })
                        }),
                    )
                    .await?;
            }
            "service-default2" => {
                host.events
                    .listen(
                        "calculate",
                        Arc::new(|obs, value| Box::pin(multiply(obs, value))),
                    )
                    .await?;
                ServiceDefault3Client::new(&host.events, None)?
                    .on_calculate(|_, value| async move { Ok(value.a * value.b) })
                    .await?;
            }
            "service-default3" => {
                host.events
                    .listen(
                        "onReverseReturnable",
                        Arc::new(|_, value| {
                            Box::pin(async move {
                                Ok(json!(
                                    value["text"]
                                        .as_str()
                                        .ok_or_else(|| bsb::Error::msg("text required"))?
                                        .chars()
                                        .rev()
                                        .collect::<String>()
                                ))
                            })
                        }),
                    )
                    .await?;
            }
            "service-benchmarkify" => {
                host.events
                    .listen(
                        "add",
                        Arc::new(|_, value| {
                            Box::pin(async move {
                                Ok(json!(
                                    value["a"].as_f64().unwrap() + value["b"].as_f64().unwrap()
                                ))
                            })
                        }),
                    )
                    .await?;
                host.events
                    .listen("void", Arc::new(|_, _| Box::pin(async { Ok(Value::Null) })))
                    .await?;
                let host = host.clone();
                let receiver = host.events.clone();
                let count = self.config["iterations"].as_u64().unwrap();
                let running = self.running.clone();
                receiver
                    .listen(
                        "benchmark.trigger",
                        Arc::new(move |obs, _| {
                            let mut host = host.clone();
                            host.observable = obs;
                            let running = running.clone();
                            Box::pin(async move {
                                benchmark(&host, count, running).await?;
                                Ok(Value::Null)
                            })
                        }),
                    )
                    .await?;
            }
            _ => {}
        }
        Ok(())
    }
    async fn run(&mut self, host: &ServiceContext) -> Result<()> {
        let obs = &host.observable;
        match self.name {
            "service-default0" => {
                host.events
                    .emit(obs, "test", json!({"a":"test","b":"test"}), None)
                    .await?;
                let result = host
                    .events
                    .emit(
                        obs,
                        "calculate",
                        json!({"a":self.config["testa"],"b":self.config["testb"]}),
                        None,
                    )
                    .await?;
                obs.info("Calculation result: {result}", json!({"result":result}));
            }
            "service-default2" => {
                let result = ServiceDefault1Client::new(&host.events, None)?
                    .calculate(
                        obs,
                        ServiceDefault1ClientCalculateInput { a: 5.0, b: 5.0 },
                        None,
                    )
                    .await?;
                obs.info("Calculation result: {result}", json!({"result":result}));
            }
            "service-default3" => {
                let result = host
                    .events
                    .emit(obs, "calculate", json!({"a":18,"b":19}), None)
                    .await?;
                obs.info("Calculation result: {result}", json!({"result":result}));
            }
            "service-benchmarkify" => {
                benchmark(
                    host,
                    self.config["iterations"].as_u64().unwrap(),
                    self.running.clone(),
                )
                .await?
            }
            _ => obs.info(&format!("Running {}", self.name), json!({})),
        }
        Ok(())
    }
}
struct Running(Arc<AtomicBool>);
impl Drop for Running {
    fn drop(&mut self) {
        self.0.store(false, AtomicOrdering::SeqCst)
    }
}
async fn benchmark(host: &ServiceContext, iterations: u64, running: Arc<AtomicBool>) -> Result<()> {
    if running.swap(true, AtomicOrdering::SeqCst) {
        return Err(bsb::Error::msg("benchmark already running"));
    }
    let _running = Running(running);
    let client = ServiceBenchmarkifyClient::new(&host.events, Some(&host.events.target))?;
    let mut results = Vec::new();
    for operation in ["add", "void"] {
        let start = Instant::now();
        for _ in 0..iterations {
            if operation == "add" {
                client
                    .add(
                        &host.observable,
                        ServiceBenchmarkifyClientAddInput { a: 5.0, b: 3.0 },
                        None,
                    )
                    .await?;
            } else {
                client
                    .void(
                        &host.observable,
                        ServiceBenchmarkifyClientVoidInput {},
                        None,
                    )
                    .await?;
            }
        }
        let elapsed = start.elapsed().as_secs_f64();
        results.push(json!({"operation":operation,"duration":elapsed*1000.0,"opsPerSecond":iterations as f64/elapsed.max(0.000001)}));
    }
    host.events.emit(&host.observable,"benchmark.results",json!({"testName":"native-rpc","results":results,"timestamp":chrono::Utc::now().to_rfc3339()}),None).await?;
    Ok(())
}
