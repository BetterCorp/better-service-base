use crate::bsbclients::service_demo_todo::ServiceDemoTodoClient;
use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::{Method, StatusCode, header},
    response::{IntoResponse, Response},
};
use bsb::{
    Result, Value, async_trait,
    host::{Service, ServiceContext},
    json,
    observable::Observable,
};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone, bsb::serde::Deserialize)]
#[serde(crate = "bsb::serde", rename_all = "camelCase")]
struct Storage {
    path: String,
    auto_save_interval: u64,
    pretty_print: bool,
}
#[derive(Clone, bsb::serde::Deserialize)]
#[serde(crate = "bsb::serde")]
struct Http {
    host: String,
    port: u16,
    cors: bool,
}
#[derive(Clone, bsb::serde::Deserialize)]
#[serde(crate = "bsb::serde", rename_all = "camelCase")]
struct Features {
    stats_interval: u64,
    max_todos: usize,
}
#[derive(Clone, bsb::serde::Deserialize)]
#[serde(crate = "bsb::serde")]
struct Options {
    storage: Storage,
    http: Http,
    features: Features,
}
#[derive(Default)]
struct Todos {
    items: BTreeMap<String, Value>,
    generation: u64,
    saved: u64,
}
struct Data {
    options: Options,
    path: PathBuf,
    state: Mutex<Todos>,
    saving: AsyncMutex<()>,
}
pub struct Todo {
    options: Options,
    data: Option<Arc<Data>>,
    tasks: Vec<tokio::task::JoinHandle<()>>,
    cancel: Option<bsb::CancellationToken>,
}
impl Todo {
    pub fn new(config: Value) -> Result<Self> {
        Ok(Self {
            options: bsb::serde_json::from_value(config)?,
            data: None,
            tasks: vec![],
            cancel: None,
        })
    }
}
#[derive(Debug)]
struct NotFound;
impl std::fmt::Display for NotFound {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("todo not found")
    }
}
impl std::error::Error for NotFound {}
impl Data {
    // ponytail: this file has one process owner; use a database for shared writers.
    fn mutate(&self, operation: &str, value: Value) -> Result<(Value, Option<&'static str>)> {
        let mut state = self.state.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let id = value["id"].as_str().unwrap_or_default();
        match operation {
            "create" => {
                if state.items.len() >= self.options.features.max_todos {
                    return Err(bsb::Error::msg("maximum todo count reached"));
                }
                let mut item = value;
                item["id"] = json!(uuid::Uuid::new_v4().to_string());
                item["completed"] = json!(false);
                item["createdAt"] = json!(now);
                item["updatedAt"] = json!(now);
                state
                    .items
                    .insert(item["id"].as_str().unwrap().into(), item.clone());
                state.generation += 1;
                Ok((item, Some("todo.created")))
            }
            "list" => Ok((
                json!({"todos":state.items.values().cloned().collect::<Vec<_>>(),"total":state.items.len()}),
                None,
            )),
            "get" => Ok((state.items.get(id).ok_or(NotFound)?.clone(), None)),
            "update" => {
                let item = state.items.get_mut(id).ok_or(NotFound)?;
                for key in ["title", "description", "completed"] {
                    if let Some(value) = value.get(key) {
                        item[key] = value.clone();
                    }
                }
                item["updatedAt"] = json!(now);
                let result = item.clone();
                state.generation += 1;
                Ok((result, Some("todo.updated")))
            }
            "delete" => {
                state.items.remove(id).ok_or(NotFound)?;
                state.generation += 1;
                Ok((json!({"success":true}), Some("todo.deleted")))
            }
            _ => Err(bsb::Error::msg("unknown todo operation")),
        }
    }
    async fn save(&self) -> Result<()> {
        let _saving = self.saving.lock().await;
        let (generation, items) = {
            let state = self.state.lock().unwrap();
            if state.saved == state.generation {
                return Ok(());
            }
            (
                state.generation,
                state.items.values().cloned().collect::<Vec<_>>(),
            )
        };
        let bytes = if self.options.storage.pretty_print {
            bsb::serde_json::to_vec_pretty(&items)?
        } else {
            bsb::serde_json::to_vec(&items)?
        };
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(bsb::Error::msg("todo storage exceeds 8 MiB"));
        }
        bsb::fs::atomic_write(&self.path, &bytes).await?;
        self.state.lock().unwrap().saved = generation;
        Ok(())
    }
}
#[async_trait]
impl Service for Todo {
    async fn init(&mut self, host: &ServiceContext) -> Result<()> {
        let path = host.cwd.join(&self.options.storage.path);
        let mut state = Todos::default();
        match bsb::config::read_bounded(&path, 8 * 1024 * 1024).await {
            Ok(bytes) => {
                let items: Vec<Value> = bsb::serde_json::from_slice(&bytes)?;
                if items.len() > self.options.features.max_todos {
                    return Err(bsb::Error::msg("invalid todo storage"));
                }
                let schema = host.events.contract.events["todo.create"]
                    .output_schema
                    .as_ref()
                    .ok_or_else(|| bsb::Error::msg("todo output contract required"))?;
                for item in items {
                    let item = bsb::contract::parse_schema(schema, &item)?;
                    let id = item["id"].as_str().unwrap().to_owned();
                    if state.items.insert(id, item).is_some() {
                        return Err(bsb::Error::msg("duplicate stored todo ID"));
                    }
                }
            }
            Err(error)
                if error
                    .downcast_ref::<std::io::Error>()
                    .is_some_and(|e| e.kind() == std::io::ErrorKind::NotFound) => {}
            Err(error) => return Err(error),
        }
        let data = Arc::new(Data {
            options: self.options.clone(),
            path,
            state: Mutex::new(state),
            saving: AsyncMutex::new(()),
        });
        self.data = Some(data.clone());
        for operation in ["create", "get", "list", "update", "delete"] {
            let data = data.clone();
            let events = host.events.clone();
            host.events
                .listen(
                    &format!("todo.{operation}"),
                    Arc::new(move |obs, value| {
                        let data = data.clone();
                        let events = events.clone();
                        Box::pin(async move {
                            let deleted = json!({"id":value["id"]});
                            let (result, event) = data.mutate(operation, value)?;
                            if let Some(event) = event {
                                events
                                    .emit(
                                        &obs,
                                        event,
                                        if operation == "delete" {
                                            deleted
                                        } else {
                                            result.clone()
                                        },
                                        None,
                                    )
                                    .await?;
                            }
                            Ok(result)
                        })
                    }),
                )
                .await?;
        }
        Ok(())
    }
    async fn run(&mut self, host: &ServiceContext) -> Result<()> {
        let data = self
            .data
            .clone()
            .ok_or_else(|| bsb::Error::msg("todo not initialized"))?;
        let cancel = host.cancel.child_token();
        self.cancel = Some(cancel.clone());
        let web = Arc::new(Web {
            client: ServiceDemoTodoClient::new(&host.events, Some(&host.events.target))?,
            obs: host.observable.clone(),
            cors: self.options.http.cors,
        });
        let router = Router::new().fallback(route).with_state(web);
        let listener = tokio::net::TcpListener::bind((
            self.options.http.host.as_str(),
            self.options.http.port,
        ))
        .await?;
        let stop = cancel.clone();
        let obs = host.observable.clone();
        self.tasks.push(tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, router)
                .with_graceful_shutdown(stop.cancelled_owned())
                .await
            {
                obs.log(
                    "error",
                    "Todo HTTP server failed",
                    json!({"error":error.to_string()}),
                );
            }
        }));
        let interval = self.options.storage.auto_save_interval;
        let stop = cancel.clone();
        let obs = host.observable.clone();
        let saved = data.clone();
        self.tasks.push(tokio::spawn(async move{let mut ticker=tokio::time::interval(Duration::from_millis(interval));loop{tokio::select!{_=stop.cancelled()=>return,_=ticker.tick()=>{if saved.save().await.is_err(){obs.log("error","Todo save failed",json!({}));}}}}}));
        let seconds = self.options.features.stats_interval;
        if seconds > 0 {
            let events = host.events.clone();
            let obs = host.observable.clone();
            self.tasks.push(tokio::spawn(async move{let mut ticker=tokio::time::interval(Duration::from_secs(seconds));loop{tokio::select!{_=cancel.cancelled()=>return,_=ticker.tick()=>{let(total,completed)={let state=data.state.lock().unwrap();(state.items.len(),state.items.values().filter(|v|v["completed"]==true).count())};if events.emit(&obs,"todo.stats",json!({"total":total,"completed":completed,"pending":total-completed,"timestamp":chrono::Utc::now().to_rfc3339()}),None).await.is_err(){obs.log("error","Todo stats broadcast failed",json!({}));}}}}}));
        }
        Ok(())
    }
    async fn shutdown(&mut self) -> Result<()> {
        if let Some(cancel) = &self.cancel {
            cancel.cancel()
        }
        for mut task in self.tasks.drain(..) {
            if tokio::time::timeout(Duration::from_secs(5), &mut task)
                .await
                .is_err()
            {
                task.abort();
                let _ = task.await;
            }
        }
        if let Some(data) = &self.data {
            data.save().await?;
        }
        Ok(())
    }
}
struct Web {
    client: ServiceDemoTodoClient,
    obs: Observable,
    cors: bool,
}
async fn route(State(web): State<Arc<Web>>, request: Request) -> Response {
    let mut span = web.obs.span("http.request");
    let result = tokio::time::timeout(
        Duration::from_secs(30),
        handle(&web, &span.observable, request),
    )
    .await;
    let mut response = match result {
        Ok(Ok(response)) => response,
        Ok(Err(error)) => {
            span.error(&error);
            let status = if error.downcast_ref::<NotFound>().is_some() {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::BAD_REQUEST
            };
            (status, "request failed").into_response()
        }
        Err(_) => (StatusCode::GATEWAY_TIMEOUT, "request deadline exceeded").into_response(),
    };
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        header::HeaderValue::from_static("nosniff"),
    );
    if web.cors {
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            header::HeaderValue::from_static("*"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            header::HeaderValue::from_static("GET,POST,PATCH,DELETE,OPTIONS"),
        );
        response.headers_mut().insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            header::HeaderValue::from_static("Content-Type"),
        );
    }
    response
}
async fn handle(web: &Web, obs: &Observable, request: Request) -> Result<Response> {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    if method == Method::OPTIONS && web.cors {
        return Ok(StatusCode::NO_CONTENT.into_response());
    }
    if method == Method::GET {
        let asset = match path.as_str() {
            "/" | "/index.html" => Some((
                "text/html; charset=utf-8",
                include_str!("static/index.html"),
            )),
            "/app.js" => Some(("text/javascript", include_str!("static/app.js"))),
            "/style.css" => Some(("text/css", include_str!("static/style.css"))),
            _ => None,
        };
        if let Some((mime, data)) = asset {
            return Ok(([(header::CONTENT_TYPE, mime)], data).into_response());
        }
    }
    let mut body = if method == Method::POST || method == Method::PATCH {
        let data = match to_bytes(request.into_body(), 65536).await {
            Ok(data) => data,
            Err(_) => return Ok(StatusCode::PAYLOAD_TOO_LARGE.into_response()),
        };
        let value: Value = bsb::serde_json::from_slice(&data)?;
        if !value.is_object() {
            return Err(bsb::Error::msg("body must be an object"));
        }
        value
    } else {
        json!({})
    };
    let mut status = StatusCode::OK;
    let operation = if path == "/api/todos" {
        match method {
            Method::GET => "list",
            Method::POST => {
                status = StatusCode::CREATED;
                "create"
            }
            _ => return Ok(StatusCode::NOT_FOUND.into_response()),
        }
    } else if let Some(id) = path.strip_prefix("/api/todos/") {
        body["id"] = json!(uuid::Uuid::parse_str(id)?.to_string());
        match method {
            Method::GET => "get",
            Method::PATCH => "update",
            Method::DELETE => "delete",
            _ => return Ok(StatusCode::NOT_FOUND.into_response()),
        }
    } else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    let result = web
        .client
        .events()
        .emit(obs, &format!("todo.{operation}"), body, None)
        .await?;
    let mut response = Response::new(Body::from(bsb::serde_json::to_vec(&result)?));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/json"),
    );
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bsb::{
        config::Config,
        contract::{Contract, parse_schema},
        events::{Events, LocalBus},
        observable::Backend,
    };
    #[tokio::test]
    async fn validated_http_crud_persists() -> Result<()> {
        let dir = tempfile::tempdir()?;
        let contract: Contract = bsb::serde_json::from_str(crate::CONTRACTS[6].1)?;
        let options = parse_schema(
            contract.config_schema.as_ref().unwrap(),
            &json!({"storage":{},"http":{},"features":{"maxTodos":1,"statsInterval":0}}),
        )?;
        let config = Arc::new(Config::load(
            &json!({"services":{"todos":{"plugin":"service-demo-todo"}}}),
            "default",
        )?);
        let host = ServiceContext {
            events: Events::new(
                "todos".into(),
                Arc::new(LocalBus::default()),
                Arc::new(contract.clone()),
                config,
            )?,
            observable: Observable::new("todos", Arc::new(Backend::default())),
            cwd: dir.path().into(),
            cancel: bsb::CancellationToken::new(),
        };
        let mut todo = Todo::new(options.clone())?;
        todo.init(&host).await?;
        let web = Arc::new(Web {
            client: ServiceDemoTodoClient::new(&host.events, None)?,
            obs: host.observable.clone(),
            cors: false,
        });
        let request = |method: &str, path: &str, body: &str| {
            Request::builder()
                .method(method)
                .uri(path)
                .body(Body::from(body.to_owned()))
                .unwrap()
        };
        let response = route(
            State(web.clone()),
            request("POST", "/api/todos", r#"{"title":"persist me"}"#),
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let created: Value =
            bsb::serde_json::from_slice(&to_bytes(response.into_body(), 65536).await?)?;
        let id = created["id"].as_str().unwrap();
        assert_eq!(
            route(
                State(web.clone()),
                request("POST", "/api/todos", r#"{"title":"over capacity"}"#)
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            route(
                State(web.clone()),
                request(
                    "PATCH",
                    &format!("/api/todos/{id}"),
                    r#"{"completed":true}"#
                )
            )
            .await
            .status(),
            StatusCode::OK
        );
        assert_eq!(
            route(
                State(web.clone()),
                request("POST", "/api/todos", &"x".repeat(65537))
            )
            .await
            .status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        todo.shutdown().await?;
        let mut restored = Todo::new(options)?;
        let mut context = host.clone();
        context.events = Events::new(
            "todos".into(),
            Arc::new(LocalBus::default()),
            Arc::new(contract),
            host.events.config.clone(),
        )?;
        restored.init(&context).await?;
        let item = restored
            .data
            .as_ref()
            .unwrap()
            .mutate("get", json!({"id":id}))?
            .0;
        assert_eq!(item["completed"], true);
        assert_eq!(
            route(
                State(web.clone()),
                request("DELETE", &format!("/api/todos/{id}"), "")
            )
            .await
            .status(),
            StatusCode::OK
        );
        assert_eq!(
            route(State(web), request("GET", &format!("/api/todos/{id}"), ""))
                .await
                .status(),
            StatusCode::NOT_FOUND
        );
        Ok(())
    }
}
