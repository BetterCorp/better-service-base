use anyhow::{Result, bail, ensure};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub category: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub input_schema: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_schema: Option<Value>,
    #[serde(default = "default_timeout")]
    pub default_timeout: f64,
    #[serde(default)]
    pub description: String,
}
fn default_timeout() -> f64 {
    5.0
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Contract {
    pub plugin_id: String,
    #[serde(default)]
    pub version: String,
    #[serde(default = "service_category")]
    pub category: String,
    #[serde(default)]
    pub description: String,
    pub events: BTreeMap<String, Event>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config_schema: Option<Value>,
    #[serde(default)]
    pub capabilities: Value,
    #[serde(default)]
    pub documentation: Vec<String>,
    #[serde(default, flatten)]
    pub metadata: BTreeMap<String, Value>,
}
fn service_category() -> String {
    "service".into()
}
pub fn flip(category: &str) -> Result<&'static str> {
    Ok(match category {
        "onEvents" => "emitEvents",
        "emitEvents" => "onEvents",
        "onReturnableEvents" => "emitReturnableEvents",
        "emitReturnableEvents" => "onReturnableEvents",
        "onBroadcast" => "emitBroadcast",
        "emitBroadcast" => "onBroadcast",
        _ => bail!("unknown event category {category}"),
    })
}
pub fn parse_schema(document: &Value, value: &Value) -> Result<Value> {
    CompiledSchema::new(document)?.parse(value)
}

pub struct CompiledSchema {
    schema: Box<dyn anyvali::Schema>,
    context: anyvali::ParseContext,
}
impl CompiledSchema {
    pub fn new(document: &Value) -> Result<Self> {
        let mut document = document.clone();
        normalize_node(&mut document["root"]);
        if let Some(definitions) = document
            .get_mut("definitions")
            .and_then(Value::as_object_mut)
        {
            for node in definitions.values_mut() {
                normalize_node(node)
            }
        }
        let (schema, context) = anyvali::import_value(&document).map_err(anyhow::Error::msg)?;
        Ok(Self { schema, context })
    }
    pub fn parse(&self, value: &Value) -> Result<Value> {
        // Each call needs its own active-reference set; the SDK context clone shares it.
        let mut context = anyvali::ParseContext::with_definitions(self.context.definitions.clone());
        context.inherited_unknown_keys = self.context.inherited_unknown_keys;
        Ok(self.schema.parse_with_context(value, &context)?)
    }
}
fn normalize_node(node: &mut Value) {
    let Some(object) = node.as_object_mut() else {
        return;
    };
    let kind = object
        .get("kind")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let (target, aliases) = match kind.as_str() {
        "optional" | "nullable" => ("schema", vec!["inner"]),
        "record" => ("values", vec!["valueSchema", "value"]),
        "array" => ("items", vec!["item"]),
        "union" => ("variants", vec!["schemas"]),
        "intersection" => ("allOf", vec!["schemas"]),
        "tuple" => ("elements", vec!["items"]),
        _ => ("", vec![]),
    };
    if !target.is_empty() {
        if !object.contains_key(target) {
            for alias in aliases {
                if let Some(value) = object.get(alias).cloned() {
                    object.insert(target.into(), value);
                    break;
                }
            }
        }
        if let Some(child) = object.get_mut(target) {
            match child {
                Value::Array(items) => {
                    for item in items {
                        normalize_node(item)
                    }
                }
                _ => normalize_node(child),
            }
        }
    }
    if let Some(properties) = object.get_mut("properties").and_then(Value::as_object_mut) {
        for value in properties.values_mut() {
            normalize_node(value)
        }
    }
}
impl Contract {
    pub fn validate(&self) -> Result<()> {
        ensure!(
            !self.plugin_id.is_empty() && self.plugin_id.len() <= 200,
            "invalid plugin identity"
        );
        ensure!(
            ["service", "config", "events", "observable"].contains(&self.category.as_str()),
            "invalid plugin category"
        );
        if let Some(schema) = &self.config_schema {
            CompiledSchema::new(schema)?;
        }
        for (name, event) in &self.events {
            ensure!(
                !name.is_empty() && name.len() <= 200 && !name.chars().any(char::is_control),
                "invalid event name"
            );
            let expected = match event.category.as_str() {
                "onEvents" | "emitEvents" => "fire-and-forget",
                "onReturnableEvents" | "emitReturnableEvents" => "returnable",
                "onBroadcast" | "emitBroadcast" => "broadcast",
                _ => bail!("invalid category for {name}"),
            };
            ensure!(
                expected == event.kind,
                "event type/category mismatch for {name}"
            );
            ensure!(
                event.default_timeout.is_finite()
                    && event.default_timeout > 0.0
                    && event.default_timeout <= 86400.0,
                "invalid event timeout"
            );
            CompiledSchema::new(&event.input_schema)?;
            if expected == "returnable" {
                ensure!(event.output_schema.is_some(), "missing returnable output");
            }
            if let Some(schema) = &event.output_schema {
                CompiledSchema::new(schema)?;
            }
        }
        Ok(())
    }
    pub fn client(&self) -> Result<Self> {
        self.validate()?;
        let mut result = self.clone();
        for event in result.events.values_mut() {
            event.category = flip(&event.category)?.into();
        }
        Ok(result)
    }
    pub fn empty(name: &str, category: &str) -> Self {
        Self {
            plugin_id: name.into(),
            version: env!("CARGO_PKG_VERSION").into(),
            category: category.into(),
            description: String::new(),
            events: BTreeMap::new(),
            config_schema: None,
            capabilities: json!({}),
            documentation: vec![],
            metadata: BTreeMap::new(),
        }
    }
    pub fn export(&self) -> Result<Value> {
        self.validate()?;
        let mut value = serde_json::to_value(self)?;
        value["language"] = json!("rust");
        value["pluginName"] = json!(self.plugin_id);
        Ok(value)
    }
}

// Option alone collapses missing and null. Generated optional fields use this wrapper.
#[derive(Clone, Debug, PartialEq)]
pub enum Optional<T> {
    Missing,
    Present(T),
}
impl<T> Default for Optional<T> {
    fn default() -> Self {
        Self::Missing
    }
}
impl<T> Optional<T> {
    pub fn is_missing(&self) -> bool {
        matches!(self, Self::Missing)
    }
}
impl<T: Serialize> Serialize for Optional<T> {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        match self {
            Self::Missing => serializer.serialize_none(),
            Self::Present(value) => value.serialize(serializer),
        }
    }
}
impl<'de, T: Deserialize<'de>> Deserialize<'de> for Optional<T> {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        T::deserialize(deserializer).map(Self::Present)
    }
}
