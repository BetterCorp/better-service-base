use crate::telemetry::{Options, level, post, valid_url};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{pin::Pin, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncWrite, AsyncWriteExt},
    net::{TcpStream, UdpSocket},
};

pub(super) struct Network {
    kind: String,
    options: Options,
    tls: Option<Arc<rustls::ClientConfig>>,
    writer: Option<Pin<Box<dyn AsyncWrite + Send>>>,
    udp: Option<UdpSocket>,
}
impl Network {
    pub async fn new(kind: &str, options: Options) -> Result<Self> {
        ensure!(
            !options.host.is_empty() && options.port > 0,
            "invalid logging address"
        );
        ensure!(
            ["udp", "tcp", "tls"].contains(&options.protocol.as_str())
                || (kind == "observable-graylog" && options.protocol == "http"),
            "invalid logging protocol"
        );
        ensure!(
            options.additional_fields.is_object(),
            "additionalFields must be an object"
        );
        for (key, value) in options.additional_fields.as_object().unwrap() {
            let normalized = gelf_key(key);
            ensure!(
                !key.is_empty()
                    && normalized != "_id"
                    && key
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
                    && (value.is_string() || value.is_number()),
                "invalid GELF additional field"
            )
        }
        if kind == "observable-syslog" {
            ensure!(
                options.facility.as_u64().is_some_and(|v| v <= 23),
                "invalid syslog facility"
            );
            ensure!(
                ["3164", "5424"].contains(&options.rfc.as_str())
                    && ["newline", "octet-counting"].contains(&options.framing.as_str()),
                "invalid syslog format"
            )
        }
        let tls = if options.protocol == "tls" {
            let mut roots = rustls::RootCertStore::empty();
            for cert in rustls_native_certs::load_native_certs().certs {
                roots.add(cert)?;
            }
            if !options.ca_certificate_path.is_empty() {
                let data = tokio::fs::read(&options.ca_certificate_path).await?;
                let certificates =
                    rustls_pemfile::certs(&mut &data[..]).collect::<std::io::Result<Vec<_>>>()?;
                ensure!(!certificates.is_empty(), "invalid CA certificate");
                for cert in certificates {
                    roots.add(cert)?;
                }
            }
            ensure!(!roots.is_empty(), "no trusted TLS roots available");
            let builder = rustls::ClientConfig::builder().with_root_certificates(roots);
            ensure!(
                options.client_certificate_path.is_empty() == options.client_key_path.is_empty(),
                "client certificate and key required together"
            );
            let config = if options.client_certificate_path.is_empty() {
                builder.with_no_client_auth()
            } else {
                let data = tokio::fs::read(&options.client_certificate_path).await?;
                let certs =
                    rustls_pemfile::certs(&mut &data[..]).collect::<std::io::Result<Vec<_>>>()?;
                let key = tokio::fs::read(&options.client_key_path).await?;
                let key =
                    rustls_pemfile::private_key(&mut &key[..])?.context("private key required")?;
                builder.with_client_auth_cert(certs, key)?
            };
            Some(Arc::new(config))
        } else {
            None
        };
        if options.protocol == "http" && !options.http_endpoint.is_empty() {
            valid_url(&options.http_endpoint, true)?;
        }
        Ok(Self {
            kind: kind.into(),
            options,
            tls,
            writer: None,
            udp: None,
        })
    }
    async fn send(&mut self, data: &[u8]) -> Result<()> {
        if self.options.protocol == "udp" {
            ensure!(data.len() <= 65507, "UDP datagram too large");
            if self.udp.is_none() {
                let addresses =
                    tokio::net::lookup_host((self.options.host.as_str(), self.options.port))
                        .await?;
                let target = addresses
                    .into_iter()
                    .next()
                    .context("logging host not found")?;
                let socket = UdpSocket::bind(if target.is_ipv6() {
                    "[::]:0"
                } else {
                    "0.0.0.0:0"
                })
                .await?;
                socket.connect(target).await?;
                self.udp = Some(socket);
            }
            self.udp.as_ref().unwrap().send(data).await?;
            return Ok(());
        }
        if self.writer.is_none() {
            let stream =
                TcpStream::connect((self.options.host.as_str(), self.options.port)).await?;
            self.writer = Some(if let Some(config) = &self.tls {
                let name = rustls::pki_types::ServerName::try_from(self.options.host.clone())?;
                Box::pin(
                    tokio_rustls::TlsConnector::from(config.clone())
                        .connect(name, stream)
                        .await?,
                )
            } else {
                Box::pin(stream)
            });
        }
        let result = self.writer.as_mut().unwrap().write_all(data).await;
        if result.is_err() {
            self.writer = None;
        }
        Ok(result?)
    }
    async fn send_bounded(&mut self, data: &[u8]) -> Result<()> {
        let result = tokio::time::timeout(Duration::from_secs(5), self.send(data))
            .await
            .context("logging transport timeout")
            .and_then(|v| v);
        if result.is_err() {
            self.writer = None;
            self.udp = None;
        }
        result
    }
    pub async fn export(&mut self, entries: Vec<Value>) -> Result<()> {
        for entry in entries {
            if self.kind == "observable-graylog" {
                let mut value = json!({"version":"1.1","host":self.options.hostname,"short_message":entry.get("message").cloned().unwrap_or(Value::Null),"timestamp":entry["timestamp"].as_str().and_then(|v|chrono::DateTime::parse_from_rfc3339(v).ok()).map(|v|v.timestamp_millis()as f64/1000.0).unwrap_or_default(),"level":syslog_level(entry["level"].as_str().unwrap_or("info")),"_facility":self.options.facility,"_plugin":entry["plugin"],"_trace_id":entry["traceId"],"_span_id":entry["spanId"],"_meta":entry["meta"].to_string()});
                for (key, field) in self.options.additional_fields.as_object().unwrap() {
                    let key = gelf_key(key);
                    if value.get(&key).is_none() {
                        value[&key] = field.clone();
                    }
                }
                if self.options.protocol == "http" {
                    let endpoint = if self.options.http_endpoint.is_empty() {
                        format!("http://{}:{}/gelf", self.options.host, self.options.port)
                    } else {
                        self.options.http_endpoint.clone()
                    };
                    post(&endpoint, value, &self.options.headers).await?;
                    continue;
                }
                let mut data = serde_json::to_vec(&value)?;
                if self.options.protocol == "udp" {
                    for chunk in gelf_chunks(&data, self.options.compress)? {
                        self.send_bounded(&chunk).await?;
                    }
                } else {
                    data.push(0);
                    self.send_bounded(&data).await?;
                }
            } else {
                let priority = self.options.facility.as_u64().unwrap() * 8
                    + syslog_level(entry["level"].as_str().unwrap_or("info")) as u64;
                let text = syslog_text(priority, &entry, &self.options)?;
                let data = if self.options.protocol == "udp" {
                    text.into_bytes()
                } else if self.options.framing == "octet-counting" {
                    format!("{} {text}", text.len()).into_bytes()
                } else {
                    format!("{text}\n").into_bytes()
                };
                self.send_bounded(&data).await?;
            }
        }
        Ok(())
    }
}
fn gelf_key(key: &str) -> String {
    if key.starts_with('_') {
        key.into()
    } else {
        format!("_{key}")
    }
}
fn syslog_text(priority: u64, entry: &Value, options: &Options) -> Result<String> {
    let timestamp = entry["timestamp"]
        .as_str()
        .context("telemetry timestamp required")?;
    if options.rfc == "3164" {
        let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp)
            .context("invalid telemetry timestamp")?;
        Ok(format!(
            "<{priority}>{} {} {}: {}",
            timestamp.format("%b %e %H:%M:%S"),
            header(&options.hostname, 255),
            header(&options.app_name, 48),
            entry
        ))
    } else {
        chrono::DateTime::parse_from_rfc3339(timestamp).context("invalid telemetry timestamp")?;
        Ok(format!(
            "<{priority}>1 {} {} {} - - - {}",
            timestamp,
            header(&options.hostname, 255),
            header(&options.app_name, 48),
            entry
        ))
    }
}
fn header(value: &str, max: usize) -> String {
    let result: String = value
        .chars()
        .filter(|c| c.is_ascii_graphic())
        .take(max)
        .collect();
    if result.is_empty() {
        "-".into()
    } else {
        result
    }
}
fn syslog_level(value: &str) -> u8 {
    match level(value).unwrap_or(2) {
        0 | 1 => 7,
        2 => 6,
        3 => 4,
        4 => 3,
        _ => 2,
    }
}
pub(super) fn gelf_chunks(data: &[u8], compress: bool) -> Result<Vec<Vec<u8>>> {
    let data = if compress {
        use std::io::Write;
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        encoder.write_all(data)?;
        encoder.finish()?
    } else {
        data.to_vec()
    };
    if data.len() <= 1200 {
        return Ok(vec![data]);
    }
    let count = data.len().div_ceil(1188);
    ensure!(count <= 128, "GELF message exceeds chunk limit");
    let id = uuid::Uuid::new_v4();
    Ok(data
        .chunks(1188)
        .enumerate()
        .map(|(index, data)| {
            let mut chunk = vec![0x1e, 0x0f];
            chunk.extend_from_slice(&id.as_bytes()[..8]);
            chunk.extend_from_slice(&[index as u8, count as u8]);
            chunk.extend_from_slice(data);
            chunk
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn syslog_preserves_event_timestamp() {
        let entry = json!({"timestamp":"2026-01-02T03:04:05+02:00"});
        let options = Options {
            rfc: "5424".into(),
            ..Options::default()
        };
        assert!(
            syslog_text(134, &entry, &options)
                .unwrap()
                .starts_with("<134>1 2026-01-02T03:04:05+02:00 ")
        );
        let options = Options {
            rfc: "3164".into(),
            ..Options::default()
        };
        assert!(
            syslog_text(134, &entry, &options)
                .unwrap()
                .starts_with("<134>Jan  2 03:04:05 ")
        );
    }
}
