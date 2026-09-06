use crate::config::MAX_JSON;
use anyhow::{Result, ensure};
use futures_util::StreamExt;
use reqwest::{Client, Method, Url, header::HeaderMap};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug)]
pub struct Status(pub u16);
impl std::fmt::Display for Status {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "HTTP {}", self.0)
    }
}
impl std::error::Error for Status {}
pub fn origin(raw: &str, allow_http: bool) -> Result<Url> {
    let mut url = Url::parse(raw)?;
    ensure!(
        url.has_host()
            && url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "invalid endpoint origin"
    );
    ensure!(
        url.scheme() == "https" || (allow_http && url.scheme() == "http"),
        "HTTPS required"
    );
    ensure!(
        url.path().is_empty() || url.path() == "/",
        "endpoint must have no API path"
    );
    url.set_path("/");
    Ok(url)
}
pub fn client(timeout: Duration) -> Result<Client> {
    Ok(Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()?)
}
pub async fn request(
    client: &Client,
    method: Method,
    url: Url,
    headers: HeaderMap,
    body: Option<&Value>,
    limit: usize,
) -> Result<Value> {
    let mut request = client.request(method, url).headers(headers);
    if let Some(body) = body {
        let bytes = serde_json::to_vec(body)?;
        ensure!(bytes.len() <= limit, "request exceeds size limit");
        request = request
            .header("content-type", "application/json")
            .body(bytes);
    }
    let response = request.send().await.map_err(reqwest::Error::without_url)?;
    if !response.status().is_success() {
        return Err(Status(response.status().as_u16()).into());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(reqwest::Error::without_url)?;
        ensure!(
            bytes.len() + chunk.len() <= MAX_JSON,
            "response exceeds size limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        return Ok(Value::Null);
    }
    Ok(serde_json::from_slice(&bytes)?)
}
pub fn retryable(error: &anyhow::Error) -> bool {
    if error
        .chain()
        .any(|cause| cause.downcast_ref::<rustls::Error>().is_some())
    {
        return false;
    }
    if let Some(status) = error.downcast_ref::<Status>() {
        return [429, 502, 503, 504].contains(&status.0);
    }
    error
        .downcast_ref::<reqwest::Error>()
        .is_some_and(|e| e.is_timeout() || e.is_connect() || e.is_body())
}
