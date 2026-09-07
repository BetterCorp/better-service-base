use bsb::{Value, contract::Contract, json};

pub(crate) fn contract(name: &str, category: &str) -> Contract {
    let mut fields = serde_json::Map::new();
    let mut add = |names: &str, schema: Value| {
        for name in names.split_whitespace() {
            fields.insert(name.into(), json!({"kind":"optional","inner":schema}));
        }
    };
    match category {
        "config" if name.starts_with("config-vault") => {
            add(
                "vaultUrl apiKeyId apiSecret cacheDir googleAudience",
                json!({"kind":"string"}),
            );
            add("timeoutMs", json!({"kind":"int32","min":1000,"max":60000}));
            add(
                "staleAllowedHours",
                json!({"kind":"int32","min":0,"max":8760}),
            );
            add("allowInsecureHttp", json!({"kind":"bool"}));
        }
        "events" if name == "events-rabbitmq" => {
            add(
                "platformKey",
                json!({"kind":"nullable","inner":{"kind":"string"}}),
            );
            add("uniqueId", json!({"kind":"string"}));
            add("fatalOnDisconnect", json!({"kind":"bool"}));
            add("prefetch", json!({"kind":"int32","min":1,"max":65535}));
            add(
                "endpoints",
                json!({"kind":"array","items":{"kind":"string"}}),
            );
            add(
                "credentials",
                json!({"kind":"object","unknownKeys":"reject","properties":{"username":{"kind":"optional","inner":{"kind":"string"}},"password":{"kind":"optional","inner":{"kind":"string"}}}}),
            );
        }
        "observable" => {
            add(
                "mode",
                json!({"kind":"enum","values":["production","production-debug","development"]}),
            );
            add(
                "level",
                json!({"kind":"enum","values":["trace","debug","info","warn","error","fatal"]}),
            );
            add("redact", json!({"kind":"array","items":{"kind":"string"}}));
            add(
                "base additionalFields",
                json!({"kind":"record","values":{"kind":"any"}}),
            );
            add(
                "path filePath endpoint serviceName serviceVersion token dataset orgId host protocol hostname appName rfc framing caCertificatePath clientCertificatePath clientKeyPath httpEndpoint",
                json!({"kind":"string"}),
            );
            add(
                "prettyPrint compress logs metrics traces allowInsecureHttp",
                json!({"kind":"bool"}),
            );
            add("maxBytes", json!({"kind":"int64","min":1,"max":1073741824}));
            add("maxFiles", json!({"kind":"int32","min":0}));
            add(
                "flushIntervalMs",
                json!({"kind":"int32","min":100,"max":60000}),
            );
            add("maxBatchSize", json!({"kind":"int32","min":1,"max":4096}));
            add("samplingRate", json!({"kind":"float64","min":0,"max":1}));
            add("port", json!({"kind":"int32","min":1,"max":65535}));
            add(
                "interval",
                json!({"kind":"enum","values":["none","hourly","daily"]}),
            );
            add(
                "headers resourceAttributes",
                json!({"kind":"record","values":{"kind":"string"}}),
            );
            add(
                "facility",
                json!({"kind":"union","variants":[{"kind":"string"},{"kind":"int32","min":0,"max":23}]}),
            );
        }
        _ => {}
    }
    let mut contract = Contract::empty(name, category);
    contract.description = format!("Native Rust {name}");
    contract.documentation = vec!["README.md".into()];
    contract.config_schema = Some(
        json!({"anyvaliVersion":"1.0","schemaVersion":"1.1","root":{"kind":"object","properties":fields,"unknownKeys":"reject"},"definitions":{},"extensions":{}}),
    );
    contract
}
