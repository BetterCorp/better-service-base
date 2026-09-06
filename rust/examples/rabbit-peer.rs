use bsb::{
    Result, Value,
    events::Bus,
    json,
    observable::{Backend, Observable},
    rabbit::Rabbit,
};
use sha2::{Digest, Sha256};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::io::AsyncReadExt;

#[tokio::main]
async fn main() -> Result<()> {
    let endpoint = reqwest::Url::parse(&std::env::var("BSB_RABBITMQ_URL")?)?;
    let obs = Observable::new("rust", Arc::new(Backend::default()));
    let rabbit = Rabbit::new(json!({"platformKey":std::env::var("BSB_INTEROP_PLATFORM")?,"endpoints":[endpoint.as_str()],"credentials":{"username":endpoint.username(),"password":endpoint.password().unwrap_or("")}}), obs.clone()).await?;
    let digest = Arc::new(Mutex::new(Value::Null));
    for event in ["echo", "call", "crash", "receive", "digest", "send"] {
        let bus = rabbit.clone();
        let digest = digest.clone();
        rabbit
            .listen(
                "returnable",
                "rust",
                event,
                Arc::new(move |obs, value| {
                    let bus = bus.clone();
                    let digest = digest.clone();
                    Box::pin(async move {
                        match event {
                            "echo" => Ok(json!({"value":value,"trace":obs.trace.trace_id})),
                            "call" => {
                                bus.emit(
                                    obs,
                                    "returnable",
                                    value["target"].as_str().unwrap(),
                                    "echo",
                                    value["value"].clone(),
                                    Duration::from_secs(10),
                                )
                                .await
                            }
                            "crash" => {
                                if std::env::var("BSB_INTEROP_CRASH_FIRST").as_deref() == Ok("true")
                                {
                                    println!("CRASH_READY");
                                    std::future::pending::<()>().await;
                                }
                                Ok(value)
                            }
                            "digest" => Ok(digest.lock().unwrap().clone()),
                            "receive" => {
                                *digest.lock().unwrap() = Value::Null;
                                Ok(json!(
                                    bus.receive(
                                        obs,
                                        "rust",
                                        "file",
                                        Arc::new(move |_, mut reader| {
                                            let digest = digest.clone();
                                            Box::pin(async move {
                                                let mut hash = Sha256::new();
                                                let mut bytes = [0u8; 65536];
                                                loop {
                                                    let size = reader.read(&mut bytes).await?;
                                                    if size == 0 {
                                                        break;
                                                    }
                                                    hash.update(&bytes[..size]);
                                                }
                                                *digest.lock().unwrap() =
                                                    json!(format!("{:x}", hash.finalize()));
                                                Ok(())
                                            })
                                        }),
                                        Duration::from_secs(5)
                                    )
                                    .await?
                                ))
                            }
                            "send" => {
                                let bytes: Vec<u8> =
                                    (0..1024 * 1024).map(|i| (i % 256) as u8).collect();
                                bus.send(
                                    obs,
                                    value["target"].as_str().unwrap(),
                                    "file",
                                    value["id"].as_str().unwrap(),
                                    Box::pin(std::io::Cursor::new(bytes)),
                                )
                                .await?;
                                Ok(json!(true))
                            }
                            _ => unreachable!(),
                        }
                    })
                }),
            )
            .await?;
    }
    println!("READY");
    tokio::task::spawn_blocking(|| std::io::stdin().read_line(&mut String::new())).await??;
    rabbit.shutdown().await
}
