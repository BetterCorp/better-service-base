use crate::{
    config::{self, Config},
    contract::{Contract, parse_schema},
    events::{Bus, Events, LocalBus},
    observable::{Backend, Observable, Observer},
};
use anyhow::{Context, Result, bail, ensure};
use async_trait::async_trait;
use futures_util::future::BoxFuture;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::{Path, PathBuf},
    sync::Arc,
};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct ServiceContext {
    pub events: Events,
    pub observable: Observable,
    pub cwd: PathBuf,
    pub cancel: CancellationToken,
}
#[derive(Clone, Default)]
pub struct Ordering {
    pub init_before: Vec<String>,
    pub init_after: Vec<String>,
    pub run_before: Vec<String>,
    pub run_after: Vec<String>,
}
#[async_trait]
pub trait Service: Send {
    async fn init(&mut self, _host: &ServiceContext) -> Result<()> {
        Ok(())
    }
    async fn run(&mut self, _host: &ServiceContext) -> Result<()> {
        Ok(())
    }
    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }
}
#[async_trait]
pub trait Configuration: Send {
    async fn load(&mut self, cwd: &Path, profile: &str) -> Result<Config>;
    async fn shutdown(&mut self) -> Result<()> {
        Ok(())
    }
}
struct NativeConfig {
    kind: &'static str,
    raw: Value,
}
#[async_trait]
impl Configuration for NativeConfig {
    async fn load(&mut self, cwd: &Path, profile: &str) -> Result<Config> {
        if self.kind == "config-vault" || self.kind == "config-vault-google" {
            crate::vault::Vault::new(cwd, &self.raw, self.kind == "config-vault-google")?
                .load()
                .await
        } else {
            config::local(cwd, self.kind, profile).await
        }
    }
}
type ConfigFactory = Arc<dyn Fn(Value) -> Result<Box<dyn Configuration>> + Send + Sync>;
type BusFactory =
    Arc<dyn Fn(Value, Observable) -> BoxFuture<'static, Result<Arc<dyn Bus>>> + Send + Sync>;
type ObserverFactory =
    Arc<dyn Fn(Value) -> BoxFuture<'static, Result<Arc<dyn Observer>>> + Send + Sync>;
fn options(contract: &Contract, value: &Value) -> Result<Value> {
    let parsed = if let Some(schema) = &contract.config_schema {
        parse_schema(schema, value)?
    } else {
        value.clone()
    };
    ensure!(parsed.is_object(), "plugin configuration must be an object");
    Ok(parsed)
}
type Factory = Arc<dyn Fn(Value) -> Result<Box<dyn Service>> + Send + Sync>;
struct Registration {
    contract: Arc<Contract>,
    factory: Factory,
    ordering: Ordering,
}
#[derive(Default)]
pub struct Registry {
    services: BTreeMap<String, Registration>,
    configs: BTreeMap<String, (Contract, ConfigFactory)>,
    buses: BTreeMap<String, (Contract, BusFactory)>,
    observers: BTreeMap<String, (Contract, ObserverFactory)>,
}
impl Registry {
    fn contains(&self, id: &str) -> bool {
        self.services.contains_key(id)
            || self.configs.contains_key(id)
            || self.buses.contains_key(id)
            || self.observers.contains_key(id)
    }
    pub fn new() -> Self {
        let mut registry = Self::default();
        for kind in [
            "config-default",
            "config-env",
            "config-vault",
            "config-vault-google",
        ] {
            registry
                .register_config(crate::builtins::contract(kind, "config"), move |raw| {
                    Ok(Box::new(NativeConfig { kind, raw }))
                })
                .expect("builtin config contract");
        }
        registry
            .register_events(
                crate::builtins::contract("events-default", "events"),
                |_, _| Box::pin(async { Ok(Arc::new(LocalBus::default()) as Arc<dyn Bus>) }),
            )
            .expect("builtin events contract");
        registry
            .register_events(
                crate::builtins::contract("events-rabbitmq", "events"),
                |raw, obs| {
                    Box::pin(async move {
                        Ok(Arc::new(crate::rabbit::Rabbit::new(raw, obs).await?) as Arc<dyn Bus>)
                    })
                },
            )
            .expect("builtin Rabbit contract");
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
            registry
                .register_observable(crate::builtins::contract(kind, "observable"), move |raw| {
                    Box::pin(async move {
                        Ok(crate::telemetry::Native::new(kind, raw).await? as Arc<dyn Observer>)
                    })
                })
                .expect("builtin observable contract");
        }
        registry
    }
    pub fn register<F>(&mut self, contract: Contract, ordering: Ordering, factory: F) -> Result<()>
    where
        F: Fn(Value) -> Result<Box<dyn Service>> + Send + Sync + 'static,
    {
        contract.validate()?;
        ensure!(
            contract.category == "service",
            "service registration requires service category"
        );
        ensure!(
            !self.contains(&contract.plugin_id),
            "duplicate service registration"
        );
        self.services.insert(
            contract.plugin_id.clone(),
            Registration {
                contract: Arc::new(contract),
                factory: Arc::new(factory),
                ordering,
            },
        );
        Ok(())
    }
    pub fn register_config<F>(&mut self, contract: Contract, factory: F) -> Result<()>
    where
        F: Fn(Value) -> Result<Box<dyn Configuration>> + Send + Sync + 'static,
    {
        contract.validate()?;
        ensure!(
            contract.category == "config" && !self.contains(&contract.plugin_id),
            "invalid or duplicate config registration"
        );
        self.configs
            .insert(contract.plugin_id.clone(), (contract, Arc::new(factory)));
        Ok(())
    }
    pub fn register_events<F>(&mut self, contract: Contract, factory: F) -> Result<()>
    where
        F: Fn(Value, Observable) -> BoxFuture<'static, Result<Arc<dyn Bus>>>
            + Send
            + Sync
            + 'static,
    {
        contract.validate()?;
        ensure!(
            contract.category == "events" && !self.contains(&contract.plugin_id),
            "invalid or duplicate events registration"
        );
        self.buses
            .insert(contract.plugin_id.clone(), (contract, Arc::new(factory)));
        Ok(())
    }
    pub fn register_observable<F>(&mut self, contract: Contract, factory: F) -> Result<()>
    where
        F: Fn(Value) -> BoxFuture<'static, Result<Arc<dyn Observer>>> + Send + Sync + 'static,
    {
        contract.validate()?;
        ensure!(
            contract.category == "observable" && !self.contains(&contract.plugin_id),
            "invalid or duplicate observable registration"
        );
        self.observers
            .insert(contract.plugin_id.clone(), (contract, Arc::new(factory)));
        Ok(())
    }
    pub fn export(&self) -> Result<Vec<Value>> {
        let mut result: Vec<_> = self
            .services
            .values()
            .map(|entry| entry.contract.export())
            .collect::<Result<_>>()?;
        for (contract, _) in self.configs.values() {
            result.push(contract.export()?)
        }
        for (contract, _) in self.buses.values() {
            result.push(contract.export()?)
        }
        for (contract, _) in self.observers.values() {
            result.push(contract.export()?)
        }
        result.sort_by_key(|value| value["pluginId"].as_str().unwrap_or_default().to_owned());
        Ok(result)
    }
}
struct Instance {
    service: Box<dyn Service>,
    context: ServiceContext,
    ordering: Ordering,
}
fn ordered(
    instances: &BTreeMap<String, Instance>,
    config: &Config,
    run: bool,
) -> Result<Vec<String>> {
    let mut dependencies: BTreeMap<String, BTreeSet<String>> = instances
        .keys()
        .map(|name| (name.clone(), BTreeSet::new()))
        .collect();
    for (name, instance) in instances {
        let (before, after) = if run {
            (&instance.ordering.run_before, &instance.ordering.run_after)
        } else {
            (
                &instance.ordering.init_before,
                &instance.ordering.init_after,
            )
        };
        for target in before {
            for target in lifecycle_targets(config, target)? {
                ensure!(
                    instances.contains_key(&target),
                    "unknown lifecycle dependency {target}"
                );
                dependencies.get_mut(&target).unwrap().insert(name.clone());
            }
        }
        for target in after {
            for target in lifecycle_targets(config, target)? {
                ensure!(
                    instances.contains_key(&target),
                    "unknown lifecycle dependency {target}"
                );
                dependencies.get_mut(name).unwrap().insert(target);
            }
        }
    }
    let mut result = Vec::new();
    while !dependencies.is_empty() {
        let name = dependencies
            .iter()
            .find(|(_, items)| items.is_empty())
            .map(|(name, _)| name.clone())
            .context("plugin lifecycle dependency cycle")?;
        dependencies.remove(&name);
        for items in dependencies.values_mut() {
            items.remove(&name);
        }
        result.push(name);
    }
    Ok(result)
}
pub struct Host {
    pub registry: Registry,
    pub cwd: PathBuf,
    pub cancel: CancellationToken,
}
fn lifecycle_targets(config: &Config, target: &str) -> Result<Vec<String>> {
    if let Some(definition) = config.groups["services"].get(target) {
        return Ok(if definition.enabled {
            vec![target.into()]
        } else {
            vec![]
        });
    }
    let targets: Vec<_> = config.groups["services"]
        .iter()
        .filter(|(_, v)| v.enabled && v.plugin == target)
        .map(|(name, _)| name.clone())
        .collect();
    ensure!(
        config.groups["services"].values().any(|v| v.plugin == target),
        "unknown lifecycle dependency {target}"
    );
    Ok(targets)
}
impl Host {
    pub fn new(registry: Registry) -> Result<Self> {
        Ok(Self {
            registry,
            cwd: std::env::current_dir()?,
            cancel: CancellationToken::new(),
        })
    }
    pub async fn run_config(&self, config: Config) -> Result<()> {
        let config = Arc::new(config);
        let backend = Arc::new(Backend::default());
        let obs = Observable::new("bsb", backend.clone());
        let mut buses: Vec<Arc<dyn Bus>> = Vec::new();
        let mut instances: BTreeMap<String, Instance> = BTreeMap::new();
        let mut initialized = Vec::new();
        let outcome=async {
            obs.info("BSB observability startup",json!({}));
            for definition in config.groups["observable"].values().filter(|v|v.enabled) {
                let (contract,factory)=self.registry.observers.get(&definition.plugin).context("enabled observable plugin is not linked")?;
                backend.add(factory(options(contract,&definition.config)?).await?);
            }
            obs.info("BSB events startup",json!({}));
            let mut routes=Vec::new();
            for definition in config.groups["events"].values().filter(|v|v.enabled) {
                crate::events_router::validate(&definition.filter)?;
                let (contract,factory)=self.registry.buses.get(&definition.plugin).context("enabled events plugin is not linked")?;
                let bus=factory(options(contract,&definition.config)?,obs.clone()).await?;
                routes.push((bus.clone(),definition.filter.clone()));buses.push(bus);
            }
            if !routes.iter().any(|(_,filter)|filter.is_null()){
                let bus:Arc<dyn Bus>=Arc::new(LocalBus::default());routes.push((bus.clone(),Value::Null));buses.push(bus);
            }
            let router:Arc<dyn Bus>=Arc::new(crate::events_router::Router(routes));
            obs.info("BSB services startup",json!({}));
            for (alias,definition) in config.groups["services"].iter().filter(|(_,v)|v.enabled) {
                let entry=self.registry.services.get(&definition.plugin).with_context(||format!("enabled service {} is not linked",definition.plugin))?;
                let options=if let Some(schema)=&entry.contract.config_schema{parse_schema(schema,&definition.config)?}else{definition.config.clone()};
                ensure!(options.is_object(),"plugin config schema must produce an object");
                let service=(entry.factory)(options)?;
                let context=ServiceContext{events:Events::new(alias.clone(),router.clone(),entry.contract.clone(),config.clone())?,observable:Observable::new(alias.clone(),backend.clone()),cwd:self.cwd.clone(),cancel:self.cancel.child_token()};
                instances.insert(alias.clone(),Instance{service,context,ordering:entry.ordering.clone()});
            }
            let order=ordered(&instances,&config,false)?;
            for name in order{initialized.push(name.clone());let instance=instances.get_mut(&name).unwrap();tokio::select!{result=instance.service.init(&instance.context)=>result?,_=self.cancel.cancelled()=>return Ok(())}}
            for name in ordered(&instances,&config,true)?{let instance=instances.get_mut(&name).unwrap();tokio::select!{result=instance.service.run(&instance.context)=>result?,_=self.cancel.cancelled()=>return Ok(())}}
            obs.info("BSB running",json!({}));
            let failures=buses.iter().map(|bus|bus.failure());
            tokio::select!{_=self.cancel.cancelled()=>Ok(()), error=futures_util::future::select_all(failures.map(Box::pin))=>bail!("events transport failed: {}",error.0)}
        }.await;
        self.cancel.cancel();
        // Include constructed plugins whose initialization never ran or failed.
        for name in instances.keys() {
            if !initialized.contains(name) {
                initialized.push(name.clone());
            }
        }
        let mut cleanup = Vec::new();
        for name in initialized.into_iter().rev() {
            if let Some(mut instance) = instances.remove(&name) {
                if let Err(error) = tokio::time::timeout(
                    std::time::Duration::from_secs(10),
                    instance.service.shutdown(),
                )
                .await
                .context("plugin shutdown timed out")
                .and_then(|v| v)
                {
                    cleanup.push(error.to_string());
                }
            }
        }
        for bus in buses.into_iter().rev() {
            if let Err(error) = bus.shutdown().await {
                cleanup.push(error.to_string());
            }
        }
        if let Err(error) = backend.shutdown().await {
            cleanup.push(error.to_string());
        }
        if let Err(error) = outcome {
            return Err(error.context(format!(
                "BSB startup/run failed; cleanup errors: {}",
                cleanup.join(", ")
            )));
        }
        ensure!(
            cleanup.is_empty(),
            "shutdown errors: {}",
            cleanup.join(", ")
        );
        Ok(())
    }
    pub async fn run(&self) -> Result<()> {
        let provider =
            std::env::var("BSB_CONFIG_PLUGIN").unwrap_or_else(|_| "config-default".into());
        let profile = std::env::var("BSB_PROFILE").unwrap_or_else(|_| "default".into());
        let (contract, factory) = self
            .registry
            .configs
            .get(&provider)
            .context("configuration provider not linked")?;
        let mut provider = factory(options(contract, &json!({}))?)?;
        let result = async {
            let config = provider.load(&self.cwd, &profile).await?;
            self.run_config(config).await
        }
        .await;
        let cleanup = provider.shutdown().await;
        match (result, cleanup) {
            (Err(error), _) => Err(error),
            (Ok(()), cleanup) => cleanup,
        }
    }
}
pub async fn main_with_registry(registry: Registry) -> Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if crate::tooling::command(&std::env::current_dir()?, &args).await? {
        return Ok(());
    }
    if args.first().map(String::as_str) == Some("export") || args == ["plugin", "export"] {
        println!("{}", serde_json::to_string(&registry.export()?)?);
        return Ok(());
    }
    ensure!(args.is_empty() || args == ["run"], "unknown BSB command");
    let host = Host::new(registry)?;
    let cancel = host.cancel.clone();
    let signals = tokio::spawn(async move {
        #[cfg(unix)]
        {
            let mut terminate =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
            tokio::select! {result=tokio::signal::ctrl_c()=>{result?;},_=terminate.recv()=>{}}
        }
        #[cfg(not(unix))]
        tokio::signal::ctrl_c().await?;
        cancel.cancel();
        Ok::<_, anyhow::Error>(())
    });
    let result = host.run().await;
    signals.abort();
    result
}
