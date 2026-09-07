"""Install generated clients from a service's public BSB discovery document."""
import hashlib
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit

from .http import json_request, origin
from .registry_client import language_name, parse_plugin_id, save_client_schema
from .versions import EXACT_VERSION


def hosted_origin(url: str, allow_insecure: bool = False) -> str:
    parsed = urlsplit(url)
    if parsed.path not in ("", "/"):
        raise ValueError("Hosted service URL must be an origin without a path")
    return origin(url, allow_http=allow_insecure)


def _request(url: str):
    return json_request("GET", url, headers={}, timeout=10, limit=4 * 1024 * 1024)


def _entry(value):
    if not isinstance(value, dict):
        raise ValueError("Hosted discovery plugins must be objects")
    plugin_id, language, version = value.get("id"), value.get("language"), value.get("version")
    if not isinstance(plugin_id, str) or not isinstance(language, str) or not isinstance(version, str):
        raise ValueError("Hosted discovery entries require id, language and version")
    org, name = parse_plugin_id(plugin_id)
    language = language_name(language)
    if not EXACT_VERSION.fullmatch(version):
        raise ValueError("Hosted discovery versions must be exact semantic versions")
    if not isinstance(value.get("schema"), (str, dict)):
        raise ValueError("Hosted discovery entries require a schema URL or object")
    return org, name, language, version


def _schema_url(value: str, discovery_url: str, hosted: str) -> str:
    parsed = urlsplit(value)
    if parsed.username is not None or parsed.password is not None or parsed.fragment:
        raise ValueError("Hosted schema URLs cannot contain credentials or fragments")
    resolved = urljoin(discovery_url, value)
    target = urlsplit(resolved)
    target_origin = origin(urlunsplit((target.scheme, target.netloc, "", "", "")), allow_http=hosted.startswith("http://"))
    if target_origin != hosted:
        raise ValueError("Hosted schema URL must remain on the same origin")
    return resolved


def install_hosted_plugin(url: str, project_root: str | Path, plugin: str | None = None, source_language: str | None = None,
                          version: str | None = None, allow_insecure: bool = False) -> Path:
    hosted = hosted_origin(url, allow_insecure)
    discovery_url = hosted + "/.well-known/bsb"
    discovery = _request(discovery_url)
    if not isinstance(discovery, dict) or type(discovery.get("bsb")) is not int or discovery["bsb"] != 1 or not isinstance(discovery.get("plugins"), list):
        raise ValueError("Invalid hosted BSB discovery document")
    entries = discovery["plugins"]
    if len(entries) > 128:
        raise ValueError("Hosted discovery allows at most 128 plugins")
    identities = set()
    parsed_entries = []
    for entry in entries:
        org, name, language, entry_version = _entry(entry)
        identity = (org, name, language, entry_version)
        if identity in identities:
            raise ValueError("Hosted discovery contains duplicate plugin identities")
        identities.add(identity)
        parsed_entries.append((entry, org, name, language, entry_version))
    if plugin is not None:
        requested = parse_plugin_id(plugin)
        parsed_entries = [entry for entry in parsed_entries if entry[1:3] == requested]
    if source_language is not None:
        source_language = language_name(source_language)
        parsed_entries = [entry for entry in parsed_entries if entry[3] == source_language]
    if version is not None:
        if not EXACT_VERSION.fullmatch(version):
            raise ValueError("An exact semantic version is required")
        parsed_entries = [entry for entry in parsed_entries if entry[4] == version]
    if not parsed_entries:
        raise ValueError("No hosted plugin matches the requested selection")
    if len(parsed_entries) != 1:
        raise ValueError("Multiple hosted plugins match; specify --plugin, --source-language or --version")
    entry, org, name, language, entry_version = parsed_entries[0]
    schema = _request(_schema_url(entry["schema"], discovery_url, hosted)) if isinstance(entry["schema"], str) else entry["schema"]
    if not isinstance(schema, dict) or not isinstance(schema.get("events"), dict):
        raise ValueError("Hosted schema must be a portable event schema object")
    target = schema.get("pluginId", schema.get("pluginName", name))
    if not isinstance(target, str) or parse_plugin_id(target)[1] != target:
        raise ValueError("Hosted schema pluginId must be an unqualified identifier")
    if "version" in schema and schema["version"] != entry_version:
        raise ValueError("Hosted schema version must match the discovery version")
    schema = {**schema, "pluginId": target, "version": entry_version, "source": {"url": hosted, "org": org, "name": name, "language": language, "version": entry_version}}
    local_name = f"hosted~{hashlib.sha256(hosted.encode()).hexdigest()[:16]}~{org}~{name}~{language}"
    return save_client_schema(schema, local_name, project_root)
