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
                "vaultUrl apiKeyId cacheDir googleAudience",
                json!({"kind":"string"}),
            );
            add(
                "apiSecret",
                json!({"kind":"string","metadata":{"sensitive":true,"writeonly":true}}),
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
                json!({"kind":"object","unknownKeys":"reject","properties":{"username":{"kind":"optional","inner":{"kind":"string"}},"password":{"kind":"optional","inner":{"kind":"string","metadata":{"sensitive":true,"writeonly":true}}}}}),
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
                "path filePath endpoint serviceName serviceVersion dataset orgId host protocol hostname appName rfc framing caCertificatePath clientCertificatePath clientKeyPath httpEndpoint",
                json!({"kind":"string"}),
            );
            add(
                "token",
                json!({"kind":"string","metadata":{"sensitive":true,"writeonly":true}}),
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
                "headers",
                json!({"kind":"record","values":{"kind":"string"},"metadata":{"sensitive":true,"writeonly":true}}),
            );
            add(
                "resourceAttributes",
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telemetry_headers_are_write_only() {
        let schema = contract("observable-opentelemetry", "observable")
            .config_schema
            .unwrap();
        let properties = &schema["root"]["properties"];
        assert_eq!(
            properties["headers"]["inner"]["metadata"]["sensitive"],
            true
        );
        assert_eq!(
            properties["headers"]["inner"]["metadata"]["writeonly"],
            true
        );
        assert!(
            properties["resourceAttributes"]["inner"]
                .get("metadata")
                .is_none()
        );
    }

    #[test]
    fn builtin_credentials_are_write_only() {
        let vault = contract("config-vault", "config").config_schema.unwrap();
        assert_eq!(
            vault["root"]["properties"]["apiSecret"]["inner"]["metadata"]["writeonly"],
            true
        );
        let rabbit = contract("events-rabbitmq", "events").config_schema.unwrap();
        assert_eq!(
            rabbit["root"]["properties"]["credentials"]["inner"]["properties"]["password"]["inner"]
                ["metadata"]["sensitive"],
            true
        );
        let telemetry = contract("observable-axiom", "observable")
            .config_schema
            .unwrap();
        assert_eq!(
            telemetry["root"]["properties"]["token"]["inner"]["metadata"]["writeonly"],
            true
        );
    }
}
