use crate::{http, observable::Observer};
use anyhow::{Result, ensure};
use async_trait::async_trait;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex as AsyncMutex, mpsc};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Deserialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Options {
    pub mode: String,
    pub level: String,
    pub redact: Vec<String>,
    pub base: Value,
    pub pretty_print: bool,
    pub path: String,
    pub file_path: String,
    pub max_bytes: u64,
    pub max_files: usize,
    pub interval: String,
    pub compress: bool,
    pub endpoint: String,
    pub service_name: String,
    pub service_version: String,
    pub headers: BTreeMap<String, String>,
    pub resource_attributes: BTreeMap<String, String>,
    pub flush_interval_ms: u64,
    pub max_batch_size: usize,
    pub sampling_rate: f64,
    pub logs: bool,
    pub metrics: bool,
    pub traces: bool,
    pub token: String,
    pub dataset: String,
    pub org_id: String,
    pub allow_insecure_http: bool,
    pub host: String,
    pub port: u16,
    pub protocol: String,
    pub facility: Value,
    pub hostname: String,
    pub app_name: String,
    pub rfc: String,
    pub framing: String,
    pub ca_certificate_path: String,
    pub client_certificate_path: String,
    pub client_key_path: String,
    pub http_endpoint: String,
    pub additional_fields: Value,
}
impl Default for Options {
    fn default() -> Self {
        Self {
            mode: "production".into(),
            level: "info".into(),
            redact: vec![],
            base: json!({}),
            pretty_print: false,
            path: "logs/application.log".into(),
            file_path: String::new(),
            max_bytes: 10 * 1024 * 1024,
            max_files: 7,
            interval: "daily".into(),
            compress: true,
            endpoint: String::new(),
            service_name: "bsb-service".into(),
            service_version: String::new(),
            headers: BTreeMap::new(),
            resource_attributes: BTreeMap::new(),
            flush_interval_ms: 5000,
            max_batch_size: 512,
            sampling_rate: 1.0,
            logs: true,
            metrics: true,
            traces: true,
            token: String::new(),
            dataset: "bsb-logs".into(),
            org_id: String::new(),
            allow_insecure_http: false,
            host: "localhost".into(),
            port: 514,
            protocol: "udp".into(),
            facility: json!(16),
            hostname: std::env::var("HOSTNAME").unwrap_or_else(|_| "localhost".into()),
            app_name: "bsb-app".into(),
            rfc: "5424".into(),
            framing: "newline".into(),
            ca_certificate_path: String::new(),
            client_certificate_path: String::new(),
            client_key_path: String::new(),
            http_endpoint: String::new(),
            additional_fields: json!({}),
        }
    }
}
pub(super) fn level(value: &str) -> Option<u8> {
    match value {
        "trace" => Some(0),
        "debug" => Some(1),
        "info" => Some(2),
        "warn" => Some(3),
        "error" => Some(4),
        "fatal" => Some(5),
        _ => None,
    }
}
pub struct Native {
    kind: String,
    options: Options,
    sender: mpsc::Sender<Value>,
    stop: CancellationToken,
    closed: AtomicBool,
    dropped: AtomicU64,
    worker: AsyncMutex<Option<tokio::task::JoinHandle<()>>>,
    file: Option<Mutex<crate::telemetry_file::RotatingFile>>,
}
impl Native {
    pub async fn new(kind: &str, raw: Value) -> Result<Arc<Self>> {
        ensure!(
            [
                "observable-default",
                "observable-logging-file",
                "observable-pino",
                "observable-winston",
                "observable-opentelemetry",
                "observable-axiom",
                "observable-zipkin",
                "observable-graylog",
                "observable-syslog"
            ]
            .contains(&kind),
            "unknown native observable plugin"
        );
        let mut defaults = json!({});
        defaults["endpoint"] = json!(match kind {
            "observable-opentelemetry" => "http://localhost:4318",
            "observable-axiom" => "https://api.axiom.co",
            "observable-zipkin" => "http://localhost:9411/api/v2/spans",
            _ => "",
        });
        if kind == "observable-graylog" {
            defaults["port"] = json!(12201);
            defaults["facility"] = json!("bsb")
        }
        let mut options: Options = serde_json::from_value(crate::config::merge(&defaults, &raw))?;
        ensure!(
            ["production", "production-debug", "development"].contains(&options.mode.as_str()),
            "invalid observable mode"
        );
        if kind == "observable-default" && options.mode != "production" {
            if raw.get("level").is_none() {
                options.level = "debug".into();
            }
            if raw.get("prettyPrint").is_none() {
                options.pretty_print = options.mode == "development";
            }
        }
        ensure!(
            level(&options.level).is_some() && options.base.is_object(),
            "invalid logging level/base"
        );
        ensure!(
            options.max_bytes > 0
                && options.max_bytes <= 1024 * 1024 * 1024
                && (100..=60000).contains(&options.flush_interval_ms)
                && (1..=4096).contains(&options.max_batch_size)
                && options.sampling_rate.is_finite()
                && (0.0..=1.0).contains(&options.sampling_rate),
            "invalid logging/export bounds"
        );
        ensure!(
            ["none", "hourly", "daily"].contains(&options.interval.as_str()),
            "invalid rotation interval"
        );
        let local = matches!(
            kind,
            "observable-default"
                | "observable-logging-file"
                | "observable-pino"
                | "observable-winston"
        );
        let file = if local {
            let path = if kind == "observable-logging-file" {
                &options.path
            } else {
                &options.file_path
            };
            if path.is_empty() {
                None
            } else {
                Some(Mutex::new(crate::telemetry_file::RotatingFile::new(
                    path,
                    options.clone(),
                )?))
            }
        } else {
            None
        };
        let mut network = if kind == "observable-graylog" || kind == "observable-syslog" {
            Some(crate::telemetry_network::Network::new(kind, options.clone()).await?)
        } else {
            None
        };
        if !local && network.is_none() {
            valid_url(
                &options.endpoint,
                kind != "observable-axiom" || options.allow_insecure_http,
            )?;
            if kind == "observable-axiom" {
                ensure!(
                    !options.token.is_empty() && !options.dataset.is_empty(),
                    "Axiom token and dataset required"
                )
            }
        }
        let (sender, mut receiver) = mpsc::channel(4096);
        let result = Arc::new(Self {
            kind: kind.into(),
            options: options.clone(),
            sender,
            stop: CancellationToken::new(),
            closed: AtomicBool::new(false),
            dropped: AtomicU64::new(0),
            worker: AsyncMutex::new(None),
            file,
        });
        if !local {
            let stop = result.stop.clone();
            let kind = kind.to_owned();
            let task = tokio::spawn(async move {
                let mut timer =
                    tokio::time::interval(Duration::from_millis(options.flush_interval_ms));
                timer.tick().await;
                let mut batch = Vec::new();
                loop {
                    tokio::select! {_=stop.cancelled()=>{receiver.close();while let Some(entry)=receiver.recv().await{batch.push(entry);if batch.len()>=options.max_batch_size{flush(&kind,&options,&mut network,std::mem::take(&mut batch)).await;}}flush(&kind,&options,&mut network,batch).await;return},_=timer.tick()=>{},entry=receiver.recv()=>match entry{Some(entry)=>{batch.push(entry);if batch.len()<options.max_batch_size{continue}},None=>return}}
                    flush(&kind, &options, &mut network, std::mem::take(&mut batch)).await;
                }
            });
            *result.worker.lock().await = Some(task)
        }
        Ok(result)
    }
}

pub(super) fn valid_url(raw: &str, allow_http: bool) -> Result<reqwest::Url> {
    let url = reqwest::Url::parse(raw)?;
    ensure!(
        url.has_host()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "invalid telemetry endpoint"
    );
    ensure!(
        url.scheme() == "https" || (allow_http && url.scheme() == "http"),
        "HTTPS required"
    );
    Ok(url)
}
pub fn redact(mut value: Value, paths: &[String]) -> Value {
    fn visit(value: &mut Value, parts: &[&str]) {
        if parts.is_empty() {
            return;
        }
        match value {
            Value::Object(values) => {
                for (key, child) in values {
                    if parts[0] == "*" || parts[0] == key {
                        if parts.len() == 1 {
                            *child = json!("[REDACTED]")
                        } else {
                            visit(child, &parts[1..])
                        }
                    }
                }
            }
            Value::Array(values) => {
                for (index, child) in values.iter_mut().enumerate() {
                    if parts[0] == "*" || parts[0] == index.to_string() {
                        if parts.len() == 1 {
                            *child = json!("[REDACTED]")
                        } else {
                            visit(child, &parts[1..])
                        }
                    }
                }
            }
            _ => {}
        }
    }
    for path in paths {
        visit(&mut value, &path.split('.').collect::<Vec<_>>())
    }
    value
}
#[async_trait]
impl Observer for Native {
    fn record(&self, value: Value) {
        if self.closed.load(Ordering::SeqCst) {
            return;
        }
        let signal = value["signal"].as_str().unwrap_or_default();
        let local = matches!(
            self.kind.as_str(),
            "observable-default"
                | "observable-logging-file"
                | "observable-pino"
                | "observable-winston"
        );
        if signal == "logs"
            && (!self.options.logs
                || level(value["level"].as_str().unwrap_or("info")).unwrap_or(2)
                    < level(&self.options.level).unwrap()
                || self.kind == "observable-zipkin")
        {
            return;
        }
        if signal == "metrics"
            && (!self.options.metrics
                || local
                || self.kind == "observable-zipkin"
                || self.kind == "observable-graylog"
                || self.kind == "observable-syslog")
        {
            return;
        }
        if signal == "traces" {
            if !self.options.traces
                || local
                || self.kind == "observable-graylog"
                || self.kind == "observable-syslog"
            {
                return;
            }
            let id = value["traceId"].as_str().unwrap_or_default();
            let sample = id.get(..8).and_then(|v| u32::from_str_radix(v, 16).ok());
            if sample
                .is_none_or(|sample| sample as f64 / 4294967296.0 >= self.options.sampling_rate)
            {
                return;
            }
        }
        let mut value = redact(
            crate::config::merge(&self.options.base, &value),
            &self.options.redact,
        );
        if let (Some(message), Some(meta)) = (value["message"].as_str(), value["meta"].as_object())
        {
            let mut message = message.to_owned();
            for (key, item) in meta {
                message = message.replace(
                    &format!("{{{key}}}"),
                    item.as_str()
                        .map(str::to_owned)
                        .unwrap_or_else(|| item.to_string())
                        .as_str(),
                )
            }
            value["message"] = json!(message)
        }
        if self.kind == "observable-pino" {
            value["level"] =
                json!((level(value["level"].as_str().unwrap_or("info")).unwrap_or(2) + 1) * 10);
            value["msg"] = value["message"].take();
            value.as_object_mut().unwrap().remove("message");
        }
        let bytes = match serde_json::to_vec(&value) {
            Ok(bytes) if bytes.len() <= 64 * 1024 => bytes,
            _ => {
                eprintln!("BSB telemetry entry exceeds 64 KiB");
                return;
            }
        };
        if local {
            if self.kind != "observable-logging-file" {
                if self.options.pretty_print {
                    println!(
                        "{} [{}] {}: {}",
                        value["timestamp"].as_str().unwrap_or_default(),
                        value["level"],
                        value["plugin"].as_str().unwrap_or_default(),
                        value
                            .get("message")
                            .or_else(|| value.get("msg"))
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                    )
                } else {
                    println!("{value}")
                }
            }
            if let Some(file) = &self.file {
                if file.lock().unwrap().write(&bytes).is_err() {
                    eprintln!("BSB file logging failed")
                }
            }
        } else if self.sender.try_send(value).is_err() {
            let dropped = self.dropped.fetch_add(1, Ordering::Relaxed) + 1;
            if dropped % 1000 == 1 {
                eprintln!("BSB telemetry queue full; dropped {dropped} entries")
            }
        }
    }
    async fn shutdown(&self) -> Result<()> {
        if self.closed.swap(true, Ordering::SeqCst) {
            return Ok(());
        }
        self.stop.cancel();
        if let Some(mut worker) = self.worker.lock().await.take() {
            if tokio::time::timeout(Duration::from_secs(10), &mut worker)
                .await
                .is_err()
            {
                worker.abort();
                let _ = worker.await;
            }
        }
        if let Some(file) = &self.file {
            file.lock().unwrap().close()?;
        }
        Ok(())
    }
}
async fn flush(
    kind: &str,
    options: &Options,
    network: &mut Option<crate::telemetry_network::Network>,
    batch: Vec<Value>,
) {
    if batch.is_empty() {
        return;
    }
    let result = if let Some(network) = network {
        network.export(batch).await
    } else {
        export(kind, options, batch).await
    };
    if result.is_err() {
        eprintln!("BSB {kind}: telemetry export failed")
    }
}
pub(super) async fn post(
    endpoint: &str,
    body: Value,
    headers: &BTreeMap<String, String>,
) -> Result<()> {
    let mut map = HeaderMap::new();
    for (key, value) in headers {
        map.insert(
            HeaderName::from_bytes(key.as_bytes())?,
            HeaderValue::from_str(value)?,
        );
    }
    let url = valid_url(endpoint, true)?;
    let client = http::client(Duration::from_secs(5))?;
    for attempt in 0..3 {
        match http::request(
            &client,
            reqwest::Method::POST,
            url.clone(),
            map.clone(),
            Some(&body),
            64 * 1024 * 1024,
        )
        .await
        {
            Ok(value) => {
                if let Some(partial) = value["partialSuccess"].as_object() {
                    for (key, value) in partial {
                        ensure!(
                            if key == "errorMessage" {
                                value == ""
                            } else {
                                value == 0 || value == "0"
                            },
                            "collector partially rejected telemetry"
                        )
                    }
                }
                ensure!(
                    value.get("failed").is_none_or(|v| v.as_u64() == Some(0)),
                    "collector rejected telemetry"
                );
                return Ok(());
            }
            Err(error) => {
                if attempt == 2 || !http::retryable(&error) {
                    return Err(error);
                }
            }
        }
        tokio::time::sleep(Duration::from_millis((attempt + 1) * 250)).await;
    }
    unreachable!()
}
fn any_value(value: &Value) -> Value {
    match value {
        Value::Bool(v) => json!({"boolValue":v}),
        Value::Number(v) => {
            if v.is_i64() || v.is_u64() {
                json!({"intValue":v.to_string()})
            } else {
                json!({"doubleValue":v})
            }
        }
        Value::Array(v) => {
            json!({"arrayValue":{"values":v.iter().map(any_value).collect::<Vec<_>>()}})
        }
        Value::Object(_) => json!({"kvlistValue":{"values":attributes(value)}}),
        _ => {
            json!({"stringValue":value.as_str().map(str::to_owned).unwrap_or_else(||value.to_string())})
        }
    }
}
fn attributes(value: &Value) -> Vec<Value> {
    value
        .as_object()
        .map(|v| {
            v.iter()
                .map(|(key, value)| json!({"key":key,"value":any_value(value)}))
                .collect()
        })
        .unwrap_or_default()
}
fn otlp(signal: &str, options: &Options, entries: Vec<Value>) -> Value {
    let mut resource = json!(options.resource_attributes);
    resource["service.name"] = json!(options.service_name);
    if !options.service_version.is_empty() {
        resource["service.version"] = json!(options.service_version)
    }
    let mut grouped: BTreeMap<String, Vec<Value>> = BTreeMap::new();
    let entries = if signal == "metrics" {
        let mut latest = BTreeMap::new();
        for entry in entries {
            latest.insert(
                format!("{}\0{}\0{}", entry["plugin"], entry["name"], entry["kind"]),
                entry,
            );
        }
        latest.into_values().collect()
    } else {
        entries
    };
    for entry in entries {
        let item = match signal {
            "logs" => {
                let timestamp = entry["timestamp"]
                    .as_str()
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .and_then(|v| v.timestamp_nanos_opt())
                    .unwrap_or_default();
                let severity = entry["level"].as_str().unwrap_or("info");
                json!({"timeUnixNano":timestamp.to_string(),"severityNumber":1+level(severity).unwrap_or(2)*4,"severityText":severity.to_uppercase(),"body":any_value(&entry["message"]),"attributes":attributes(&entry["meta"]),"traceId":entry["traceId"],"spanId":entry["spanId"]})
            }
            "traces" => {
                json!({"traceId":entry["traceId"],"spanId":entry["spanId"],"parentSpanId":entry["parentSpanId"],"name":entry["name"],"kind":1,"startTimeUnixNano":entry["startedNs"],"endTimeUnixNano":entry["endedNs"],"attributes":attributes(&entry["attributes"]),"status":if entry["error"].as_str().is_some_and(|v|!v.is_empty()){json!({"code":2,"message":entry["error"]})}else{json!({"code":0})}})
            }
            _ => {
                let mut point = json!({"timeUnixNano":entry["timestampNs"],"startTimeUnixNano":entry["startedNs"]});
                let mut metric = json!({"name":entry["name"],"description":entry["description"],"unit":entry["unit"]});
                match entry["kind"].as_str() {
                    Some("counter") => {
                        point["asInt"] = json!(entry["value"].to_string());
                        metric["sum"] = json!({"aggregationTemporality":2,"isMonotonic":true,"dataPoints":[point]})
                    }
                    Some("histogram") => {
                        point["count"] = json!(entry["count"].to_string());
                        point["sum"] = entry["sum"].clone();
                        point["bucketCounts"] = json!([entry["count"].to_string()]);
                        point["explicitBounds"] = json!([]);
                        metric["histogram"] =
                            json!({"aggregationTemporality":2,"dataPoints":[point]})
                    }
                    _ => {
                        point["asDouble"] = entry["value"].clone();
                        metric["gauge"] = json!({"dataPoints":[point]})
                    }
                }
                metric
            }
        };
        grouped
            .entry(entry["plugin"].as_str().unwrap_or("bsb").into())
            .or_default()
            .push(item);
    }
    let (suffix, field) = match signal {
        "logs" => ("Logs", "logRecords"),
        "traces" => ("Spans", "spans"),
        _ => ("Metrics", "metrics"),
    };
    let scopes: Vec<_> = grouped
        .into_iter()
        .map(|(name, items)| json!({"scope":{"name":name},field:items}))
        .collect();
    json!({format!("resource{suffix}"):[{"resource":{"attributes":attributes(&resource)},format!("scope{suffix}"):scopes}]})
}
async fn export(kind: &str, options: &Options, batch: Vec<Value>) -> Result<()> {
    let endpoint = options.endpoint.trim_end_matches('/');
    let mut headers = options.headers.clone();
    if kind == "observable-zipkin" {
        let spans:Vec<_>=batch.into_iter().filter(|v|v["signal"]=="traces").map(|entry|{
            let start=entry["startedNs"].as_str().and_then(|v|v.parse::<i64>().ok()).unwrap_or_default();
            let end=entry["endedNs"].as_str().and_then(|v|v.parse::<i64>().ok()).unwrap_or(start);
            let mut tags:BTreeMap<String,String>=entry["attributes"].as_object().into_iter().flatten().map(|(key,value)|(key.clone(),value.as_str().map(str::to_owned).unwrap_or_else(||value.to_string()))).collect();
            if let Some(error)=entry["error"].as_str(){tags.insert("error".into(),error.into());}
            json!({"traceId":entry["traceId"],"id":entry["spanId"],"parentId":entry["parentSpanId"],"name":entry["name"],"timestamp":start/1000,"duration":((end-start)/1000).max(1),"tags":tags,"localEndpoint":{"serviceName":options.service_name}})
        }).collect();
        return post(endpoint, json!(spans), &headers).await;
    }
    if kind == "observable-axiom" {
        headers.insert("Authorization".into(), format!("Bearer {}", options.token));
        headers.insert("X-Axiom-Dataset".into(), options.dataset.clone());
        if !options.org_id.is_empty() {
            headers.insert("X-Axiom-Org-Id".into(), options.org_id.clone());
        }
        let events: Vec<_> = batch
            .iter()
            .filter(|v| v["signal"] != "traces")
            .map(|v| {
                let mut entry = v.clone();
                entry["_time"] = entry
                    .get("timestamp")
                    .cloned()
                    .unwrap_or_else(|| json!(chrono::Utc::now().to_rfc3339()));
                entry["service"] = json!(options.service_name);
                entry
            })
            .collect();
        if !events.is_empty() {
            let mut url = valid_url(endpoint, options.allow_insecure_http)?;
            url.path_segments_mut()
                .unwrap()
                .extend(["v1", "datasets", &options.dataset, "ingest"]);
            post(url.as_str(), json!(events), &headers).await?
        }
    }
    for signal in ["logs", "metrics", "traces"] {
        if kind == "observable-axiom" && signal != "traces" {
            continue;
        }
        let entries: Vec<_> = batch
            .iter()
            .filter(|v| v["signal"] == signal)
            .cloned()
            .collect();
        if !entries.is_empty() {
            post(
                &format!("{endpoint}/v1/{signal}"),
                otlp(signal, options, entries),
                &headers,
            )
            .await?
        }
    }
    Ok(())
}
