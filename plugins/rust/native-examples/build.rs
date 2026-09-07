use std::{env, fs, path::PathBuf};

const CONTRACTS: [&str; 7] = [
    "service-benchmarkify",
    "service-default0",
    "service-default1",
    "service-default2",
    "service-default3",
    "service-default4",
    "service-demo-todo",
];

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let contracts = manifest.join("../../contracts/examples");
    let output = PathBuf::from(env::var("OUT_DIR").unwrap());
    let clients = output.join("bsbclients");
    fs::create_dir_all(&clients).unwrap();

    let mut modules = String::from("pub mod bsbclients {\n");
    let mut embedded = String::from("pub const CONTRACTS: [(&str, &str); 7] = [\n");
    for name in CONTRACTS {
        let path = contracts.join(format!("{name}.json"));
        println!("cargo::rerun-if-changed={}", path.display());
        let contract = fs::read_to_string(path).unwrap();
        let module = bsb::generator::snake(name);
        fs::write(
            clients.join(format!("{module}.rs")),
            bsb::generator::generate(&contract, name).unwrap(),
        )
        .unwrap();
        modules.push_str(&format!(
            "pub mod {module} {{ include!(concat!(env!(\"OUT_DIR\"), \"/bsbclients/{module}.rs\")); }}\n"
        ));
        embedded.push_str(&format!("({name:?}, {contract:?}),\n"));
    }
    modules.push_str("}\n");
    embedded.push_str("];\n");
    fs::write(output.join("bsbclients.rs"), modules).unwrap();
    fs::write(output.join("contracts.rs"), embedded).unwrap();
}
