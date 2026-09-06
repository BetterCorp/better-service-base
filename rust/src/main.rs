#[tokio::main]
async fn main() {
    if let Err(error) = bsb::host::main_with_registry(bsb::host::Registry::new()).await {
        eprintln!("BSB: {error:#}");
        std::process::exit(1);
    }
}
