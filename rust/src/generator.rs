use crate::contract::{Contract, flip};
use anyhow::{Context, Result, bail, ensure};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    fmt::Write,
};

pub fn identifier(raw: &str) -> String {
    let mut out = String::new();
    let mut upper = true;
    for ch in raw.chars() {
        if ch.is_ascii_alphanumeric() {
            if out.is_empty() && ch.is_ascii_digit() {
                out.push('X')
            };
            out.push(if upper { ch.to_ascii_uppercase() } else { ch });
            upper = false
        } else {
            upper = true
        }
    }
    if out.is_empty() {
        out = "Value".into()
    }
    out
}
pub fn snake(raw: &str) -> String {
    let mut out = String::new();
    for ch in identifier(raw).chars() {
        if ch.is_ascii_uppercase() && !out.is_empty() {
            out.push('_')
        };
        out.push(ch.to_ascii_lowercase())
    }
    if [
        "self", "super", "crate", "type", "match", "ref", "mod", "move", "async", "await", "loop",
        "fn", "in", "use", "pub", "where", "struct", "enum", "trait", "impl", "const", "static",
        "return", "let", "mut", "as", "break", "continue", "else", "if", "for", "while", "dyn",
        "unsafe", "extern", "true", "false", "box", "do", "yield", "try", "gen", "abstract",
        "become", "final", "macro", "override", "priv", "typeof", "unsized", "virtual",
    ]
    .contains(&out.as_str())
    {
        out.push('_')
    }
    out
}
#[derive(Default)]
struct Generator {
    declarations: Vec<String>,
    names: BTreeSet<String>,
}
impl Generator {
    fn reserve(&mut self, name: &str) -> Result<()> {
        ensure!(
            self.names.insert(name.into()),
            "generated symbol collision: {name}"
        );
        Ok(())
    }
    fn shape(&mut self, document: &Value, hint: &str) -> Result<String> {
        let definitions: BTreeMap<String, Value> = document
            .get("definitions")
            .and_then(Value::as_object)
            .map(|v| v.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
            .unwrap_or_default();
        let references: BTreeMap<String, String> = definitions
            .keys()
            .enumerate()
            .map(|(i, key)| (key.clone(), format!("{hint}Definition{i}")))
            .collect();
        self.node(
            &document["root"],
            hint,
            &definitions,
            &references,
            &mut BTreeSet::new(),
        )
    }
    fn node(
        &mut self,
        node: &Value,
        name: &str,
        definitions: &BTreeMap<String, Value>,
        references: &BTreeMap<String, String>,
        seen: &mut BTreeSet<String>,
    ) -> Result<String> {
        let child = |primary: &str, alias: &str| {
            node.get(primary)
                .or_else(|| node.get(alias))
                .unwrap_or(&Value::Null)
        };
        Ok(
            match node["kind"].as_str().context("schema kind required")? {
                "string" => "String".into(),
                "bool" => "bool".into(),
                "int" | "int64" => "i64".into(),
                "int8" => "i8".into(),
                "int16" => "i16".into(),
                "int32" => "i32".into(),
                "uint8" => "u8".into(),
                "uint16" => "u16".into(),
                "uint32" => "u32".into(),
                "uint64" => "u64".into(),
                "float32" => "f32".into(),
                "float64" | "number" => "f64".into(),
                "any" | "unknown" | "never" | "null" | "union" | "intersection" | "tuple" => {
                    "bsb::Value".into()
                }
                "optional" => format!(
                    "bsb::contract::Optional<{}>",
                    self.node(
                        child("schema", "inner"),
                        name,
                        definitions,
                        references,
                        seen
                    )?
                ),
                "nullable" => format!(
                    "Option<{}>",
                    self.node(
                        child("schema", "inner"),
                        name,
                        definitions,
                        references,
                        seen
                    )?
                ),
                "array" => format!(
                    "Vec<{}>",
                    self.node(
                        child("items", "item"),
                        &format!("{name}Item"),
                        definitions,
                        references,
                        seen
                    )?
                ),
                "record" => {
                    let value = node
                        .get("valueSchema")
                        .or_else(|| node.get("values"))
                        .or_else(|| node.get("value"))
                        .context("record value schema required")?;
                    format!(
                        "std::collections::BTreeMap<String,{}>",
                        self.node(
                            value,
                            &format!("{name}Value"),
                            definitions,
                            references,
                            seen
                        )?
                    )
                }
                "ref" => {
                    let key = node["ref"]
                        .as_str()
                        .context("reference required")?
                        .trim_start_matches("#/definitions/");
                    let reference = references.get(key).context("unknown schema reference")?;
                    if seen.insert(key.into()) {
                        let value =
                            self.node(&definitions[key], reference, definitions, references, seen)?;
                        if &value != reference {
                            self.reserve(reference)?;
                            self.declarations
                                .push(format!("pub type {reference} = {value};"));
                        }
                    }
                    format!("Box<{reference}>")
                }
                "enum" | "literal" => {
                    let values = if node["kind"] == "literal" {
                        vec![node["value"].clone()]
                    } else {
                        node["values"]
                            .as_array()
                            .context("enum values required")?
                            .clone()
                    };
                    if !values.is_empty() && values.iter().all(Value::is_string) {
                        self.reserve(name)?;
                        let mut source = format!(
                            "#[derive(Clone,Debug,PartialEq,bsb::serde::Serialize,bsb::serde::Deserialize)]\n#[serde(crate=\"bsb::serde\")]\npub enum {name} {{\n"
                        );
                        for (i, value) in values.iter().enumerate() {
                            writeln!(
                                source,
                                "#[serde(rename={:?})] Value{i},",
                                value.as_str().unwrap()
                            )?;
                        }
                        source.push_str("}\n");
                        self.declarations.push(source);
                        name.into()
                    } else {
                        "bsb::Value".into()
                    }
                }
                "object" => {
                    self.reserve(name)?;
                    let mut source = format!(
                        "#[derive(Clone,Debug,bsb::serde::Serialize,bsb::serde::Deserialize)]\n#[serde(crate=\"bsb::serde\")]\npub struct {name} {{\n"
                    );
                    let mut fields = BTreeSet::new();
                    let properties = node["properties"]
                        .as_object()
                        .context("object properties required")?;
                    let required = node.get("required").and_then(Value::as_array);
                    for (key, value) in properties {
                        let field = snake(key);
                        ensure!(fields.insert(field.clone()), "generated field collision");
                        let mut ty = self.node(
                            value,
                            &format!("{name}{}", identifier(key)),
                            definitions,
                            references,
                            seen,
                        )?;
                        let optional = value["kind"] == "optional"
                            || required.is_some_and(|required| !required.iter().any(|v| v == key));
                        if optional && value["kind"] != "optional" {
                            ty = format!("bsb::contract::Optional<{ty}>")
                        };
                        writeln!(
                            source,
                            "#[serde(rename={key:?}{} )] pub {field}: {ty},",
                            if optional {
                                ",default,skip_serializing_if=\"bsb::contract::Optional::is_missing\""
                            } else {
                                ""
                            }
                        )?;
                    }
                    source.push_str("}\n");
                    self.declarations.push(source);
                    name.into()
                }
                kind => bail!("unsupported schema kind {kind}"),
            },
        )
    }
}
pub fn generate(data: &str, local_name: &str) -> Result<String> {
    let contract: Contract = serde_json::from_str(data)?;
    contract.validate()?;
    let class = format!("{}Client", identifier(local_name));
    let mut generator = Generator::default();
    generator.reserve(&class)?;
    let mut methods = String::new();
    let mut names = BTreeSet::from(["new".to_owned(), "specific".into(), "events".into()]);
    for (name, event) in &contract.events {
        let category = flip(&event.category)?;
        let method = if category.starts_with("on") {
            format!("on_{}", snake(name))
        } else {
            snake(name)
        };
        ensure!(names.insert(method.clone()), "generated method collision");
        let input = generator.shape(
            &event.input_schema,
            &format!("{class}{}Input", identifier(&method)),
        )?;
        let output = if let Some(schema) = &event.output_schema {
            generator.shape(schema, &format!("{class}{}Output", identifier(&method)))?
        } else {
            "bsb::Value".into()
        };
        if category.starts_with("emit") {
            let (result, timeout) = if category == "emitReturnableEvents" {
                (output.as_str(), ",timeout:Option<std::time::Duration>")
            } else {
                ("()", "")
            };
            writeln!(
                methods,
                "pub async fn {method}(&self,obs:&bsb::observable::Observable,payload:{input}{timeout})->bsb::Result<{result}>{{let result=self.events.emit(obs,{name:?},bsb::serde_json::to_value(payload)?,{}).await?;{} }}",
                if timeout.is_empty() {
                    "None"
                } else {
                    "timeout"
                },
                if result == "()" {
                    "let _ = result; Ok(())".to_owned()
                } else {
                    format!("Ok(bsb::serde_json::from_value::<{output}>(result)?)")
                }
            )?;
        } else {
            let result = if category == "onReturnableEvents" {
                output.as_str()
            } else {
                "()"
            };
            writeln!(
                methods,
                "pub async fn {method}<F,Fut>(&self,handler:F)->bsb::Result<()> where F:Fn(bsb::observable::Observable,{input})->Fut+Send+Sync+'static,Fut:std::future::Future<Output=bsb::Result<{result}>>+Send+'static {{let handler=std::sync::Arc::new(handler);self.events.listen({name:?},std::sync::Arc::new(move|obs,value|{{let handler=handler.clone();Box::pin(async move{{let payload=bsb::serde_json::from_value::<{input}>(value)?;let result=handler(obs,payload).await?;Ok(bsb::serde_json::to_value(result)?)}})}})).await }}"
            )?;
        }
    }
    Ok(format!(
        "// Code generated by BSB. DO NOT EDIT.\n{}\n#[derive(Clone)]\npub struct {class} {{ events:bsb::events::Events }}\nimpl {class} {{pub fn new(parent:&bsb::events::Events,target:Option<&str>)->bsb::Result<Self>{{let contract=bsb::serde_json::from_str({data:?})?;Ok(Self{{events:parent.client(contract,target)?}})}}\npub fn specific(&self,id:&str)->bsb::Result<Self>{{Ok(Self{{events:self.events.specific(id)?}})}}\npub fn events(&self)->&bsb::events::Events{{&self.events}}\n{methods}\n}}",
        generator.declarations.join("\n")
    ))
}
