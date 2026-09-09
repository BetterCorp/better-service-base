pub mod hosted;
pub mod tooling;

pub use bsb_rust_builtins::register as register_builtins;

pub async fn main_with_registry(registry: bsb::host::Registry) -> bsb::Result<()> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if tooling::command(&std::env::current_dir()?, &args).await? {
        return Ok(());
    }
    bsb::host::main_with_registry(registry).await
}
