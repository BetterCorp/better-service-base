//! Native BSB host. Consuming crates register plugins; BSB owns the executable.
pub use anyhow::{Error, Result};
pub use anyvali;
pub use async_trait::async_trait;
pub use serde;
pub use serde_json;
pub use serde_json::{Value, json};
pub use tokio_util::sync::CancellationToken;
pub mod config;
pub mod contract;
pub mod events;
mod events_router;
pub mod fs;
pub mod generator;
pub fn runtime() -> std::io::Result<tokio::runtime::Runtime> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
}
pub mod host;
pub mod http;
pub mod metrics;
pub mod observable;
