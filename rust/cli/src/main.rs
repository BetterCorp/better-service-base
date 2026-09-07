#[tokio::main]
async fn main() {
    let mut registry = bsb::host::Registry::new();
    let result = async {
        bsb_cli::register_builtins(&mut registry)?;
        bsb_cli::main_with_registry(registry).await
    }
    .await;
    if let Err(error) = result {
        eprintln!("BSB: {error:#}");
        std::process::exit(1);
    }
}
