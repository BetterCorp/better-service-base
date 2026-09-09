use anyhow::Result;
use bsb::{
    Value, config,
    events::{Bus, LocalBus},
    host::{Configuration, Registry},
    observable::Observer,
};
use std::{path::Path, sync::Arc};

mod builtins;
pub mod rabbit;
mod rabbit_streams;
pub mod telemetry;
mod telemetry_file;
mod telemetry_network;
pub mod vault;

struct NativeConfig {
    kind: &'static str,
    raw: Value,
}

#[bsb::async_trait]
impl Configuration for NativeConfig {
    async fn load(&mut self, cwd: &Path, profile: &str) -> Result<bsb::config::Config> {
        if self.kind == "config-vault" || self.kind == "config-vault-google" {
            vault::Vault::new(cwd, &self.raw, self.kind == "config-vault-google")?
                .load()
                .await
        } else {
            config::local(cwd, self.kind, profile).await
        }
    }
}

pub fn register(registry: &mut Registry) -> Result<()> {
    for kind in [
        "config-default",
        "config-env",
        "config-vault",
        "config-vault-google",
    ] {
        registry.register_config(builtins::contract(kind, "config"), move |raw| {
            Ok(Box::new(NativeConfig { kind, raw }))
        })?;
    }
    registry.register_events(builtins::contract("events-default", "events"), |_, _| {
        Box::pin(async { Ok(Arc::new(LocalBus::default()) as Arc<dyn Bus>) })
    })?;
    registry.register_events(
        builtins::contract("events-rabbitmq", "events"),
        |raw, obs| {
            Box::pin(
                async move { Ok(Arc::new(rabbit::Rabbit::new(raw, obs).await?) as Arc<dyn Bus>) },
            )
        },
    )?;
    for kind in [
        "observable-default",
        "observable-logging-file",
        "observable-pino",
        "observable-winston",
        "observable-opentelemetry",
        "observable-axiom",
        "observable-zipkin",
        "observable-graylog",
        "observable-syslog",
    ] {
        registry.register_observable(builtins::contract(kind, "observable"), move |raw, cwd| {
            Box::pin(async move {
                Ok(telemetry::Native::new_at(kind, raw, &cwd).await? as Arc<dyn Observer>)
            })
        })?;
    }
    Ok(())
}
