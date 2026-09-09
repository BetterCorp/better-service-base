from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote

from .client_generator import generate_clients, generate_client_code, validate_client_names
from .http import json_request, origin
from .schema_export import build_project, read_project_metadata
from .versions import EXACT_VERSION


REGISTRY_URL = os.environ.get("BSB_REGISTRY_URL", "https://io.bsbcode.dev")
REGISTRY_TOKEN = os.environ.get("BSB_REGISTRY_TOKEN")
VALID_CATEGORIES = {"service", "observable", "events", "config"}


def parse_plugin_id(plugin_id: str) -> tuple[str, str]:
    parts = plugin_id.split("/")
    org, name = ("_", parts[0]) if len(parts) == 1 else parts if len(parts) == 2 else ("", "")
    if len(plugin_id) > 200 or not all(re.fullmatch(r"@?[A-Za-z0-9_][A-Za-z0-9._-]*", value) for value in (org, name)):
        raise ValueError("Invalid registry plugin identifier; expected org/name or name")
    return org, name


def language_name(language: str) -> str:
    language = "csharp" if language == "dotnet" else language
    if language not in ("nodejs", "csharp", "python", "go", "java", "rust"):
        raise ValueError("Unsupported implementation language")
    return language


def display_plugin_id(org: str, name: str) -> str:
    return name if org == "_" else f"{org}/{name}"


def _format_registry_error(raw_body: str, status_code: int | None = None) -> str:
    if not raw_body:
        return f"HTTP {status_code or 'error'}"
    try:
        parsed = json.loads(raw_body)
    except json.JSONDecodeError:
        return raw_body

    if not isinstance(parsed, dict):
        return raw_body
    base = parsed.get("error") or f"HTTP {status_code or 'error'}"
    code = f" [{parsed['code']}]" if parsed.get("code") else ""
    details = parsed.get("details")
    if isinstance(details, list) and details:
        detail_text = "; ".join(
            f"{detail.get('path', '<root>')}: {detail.get('message', 'Invalid value')}" for detail in details if isinstance(detail, dict)
        )
        return f"{base}{code} - {detail_text}"
    if isinstance(parsed.get("message"), str) and parsed["message"].strip():
        return f"{base}{code} - {parsed['message']}"
    return f"{base}{code}"


def registry_request(method: str, path: str, body: Any | None = None, require_auth: bool = False, *, target=None, token=None, allow_insecure=False) -> Any:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    token = REGISTRY_TOKEN if token is None else token
    if require_auth and not token:
        raise RuntimeError("BSB_REGISTRY_TOKEN environment variable not set")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("Registry request must use a relative API path")
    endpoint = origin(target or REGISTRY_URL, allow_http=allow_insecure or os.environ.get("BSB_REGISTRY_ALLOW_INSECURE_HTTP") == "true")
    try:
        return json_request(method, endpoint + path, body=body, headers=headers)
    except HTTPError as error:
        raise RuntimeError("Registry request failed: " + _format_registry_error(getattr(error, "bsb_body", ""), error.code)) from error
    except URLError as error:
        raise RuntimeError(str(error.reason)) from error


def ensure_gitignore(project_root: str | Path) -> Path:
    project_root = Path(project_root)
    gitignore_path = project_root / ".gitignore"
    entries = [".bsb/", "src/bsb_clients/" if (project_root / "src").is_dir() else "bsb_clients/"]
    if gitignore_path.exists():
        lines = gitignore_path.read_text(encoding="utf-8").splitlines()
        normalized = {line.strip().rstrip("/") for line in lines}
        missing = [entry for entry in entries if entry.rstrip("/") not in normalized]
        if missing:
            content = gitignore_path.read_text(encoding="utf-8")
            newline = "" if content.endswith("\n") or content == "" else "\n"
            gitignore_path.write_text(content + newline + "\n".join(missing) + "\n", encoding="utf-8")
    else:
        gitignore_path.write_text("\n".join(entries) + "\n", encoding="utf-8")
    return gitignore_path


def list_plugins(limit: int = 100) -> Any:
    return registry_request("GET", f"/plugins?{urlencode({'limit': limit})}")


def search_plugins(query: str, limit: int = 100) -> Any:
    return registry_request("GET", f"/plugins?{urlencode({'query': query, 'limit': limit})}")


def resolve_language(plugin_id: str, source_language: str | None) -> str:
    if source_language is not None:
        return language_name(source_language)
    org, name = parse_plugin_id(plugin_id)
    result = registry_request("GET", f"/plugins/{org}/{name}/implementations")
    variants = result.get("implementations")
    if not isinstance(variants, list) or not variants:
        raise ValueError("No accessible plugin implementations")
    if len(variants) != 1:
        raise ValueError("Multiple implementations available; specify --source-language")
    return language_name(variants[0]["language"])


def get_plugin_info(plugin_id: str, source_language: str | None = None) -> Any:
    org, name = parse_plugin_id(plugin_id)
    language = resolve_language(plugin_id, source_language)
    return registry_request("GET", f"/plugins/{org}/{name}?{urlencode({'language': language})}")


def get_plugin_schema(plugin_id: str, source_language: str | None = None, version: str | None = None) -> Any:
    org, name = parse_plugin_id(plugin_id)
    language = resolve_language(plugin_id, source_language)
    if version is None:
        detail = get_plugin_info(plugin_id, language)
        version = detail.get("plugin", detail)["version"]
    if not isinstance(version, str) or not EXACT_VERSION.fullmatch(version):
        raise ValueError("An exact semantic version is required")
    schema = registry_request("GET", f"/plugins/{org}/{name}/{quote(version, safe='')}/schema?{urlencode({'language': language})}")
    if not isinstance(schema, dict):
        raise ValueError("Registry schema must be an object")
    return {**schema, "pluginId": name, "source": {"org": org, "name": name, "language": language, "version": version, "registry": REGISTRY_URL}}


def save_client_schema(schema: dict, local_name: str, project_root: str | Path) -> Path:
    generate_client_code(schema, local_name)  # Reject invalid remote contracts before changing the saved snapshot.

    project_root = Path(project_root)
    schemas_dir = project_root / ".bsb" / "schemas"
    schema_path = schemas_dir / f"{local_name}.json"
    snapshots = [*schemas_dir.glob("*.json"), *(project_root / "src" / ".bsb" / "schemas").glob("*.json")]
    validate_client_names([file.stem for file in snapshots if file != schema_path] + [local_name])
    schemas_dir.mkdir(parents=True, exist_ok=True)
    ensure_gitignore(project_root)
    schema_path.write_text(json.dumps(schema, indent=2), encoding="utf-8")
    generate_clients(project_root)
    return schema_path


def install_plugin(plugin_id: str, project_root: str | Path, source_language: str | None = None, version: str | None = None) -> Path:
    org, name = parse_plugin_id(plugin_id)
    schema = get_plugin_schema(plugin_id, source_language, version)
    return save_client_schema(schema, f"{org}~{name}~{schema['source']['language']}", project_root)


def sync_clients(project_root: str | Path) -> list[Path]:
    ensure_gitignore(project_root)
    return generate_clients(project_root)


def publish_plugins(project_root: str | Path, *, target=None, token=None, plugin=None, org=None, allow_insecure=False) -> list[dict[str, Any]]:
    project_root = Path(project_root)
    build_project(project_root)
    manifest_path = project_root / "bsb-plugin.json"
    if not manifest_path.exists():
        raise RuntimeError("No bsb-plugin.json found. Run 'bsb plugin build' first.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_entries = manifest.get("python", [])
    if plugin is not None:
        plugin_entries = [entry for entry in plugin_entries if entry["id"] == plugin]
    if not plugin_entries:
        raise RuntimeError("No Python plugins found in bsb-plugin.json")

    project_meta = read_project_metadata(project_root)
    package_name = project_meta.get("name")
    version = str(project_meta.get("version") or "1.0.0")
    readme_path = project_root / "README.md"
    fallback_docs = readme_path.read_text(encoding="utf-8") if readme_path.exists() else None
    org = org or os.environ.get("BSB_ORG_ID", "_")
    parse_plugin_id(org + "/check")
    published: list[dict[str, Any]] = []

    for plugin_meta in plugin_entries:
        plugin_id = plugin_meta["id"]
        plugin_version = str(plugin_meta.get("version") or version)
        category = str(plugin_meta.get("category") or plugin_id.split("-", 1)[0]).lower()
        if category not in VALID_CATEGORIES:
            raise RuntimeError(f"Invalid category '{category}' for plugin '{plugin_id}'")

        schema_path = project_root / "lib" / "schemas" / f"{plugin_id}.json"
        event_schema: dict[str, Any] = {"pluginName": plugin_id, "version": plugin_version, "events": {}}
        config_schema: dict[str, Any] | None = None
        dependencies: list[dict[str, str]] | None = None
        if schema_path.exists():
            parsed = json.loads(schema_path.read_text(encoding="utf-8"))
            event_schema = {
                "pluginName": parsed.get("pluginName", plugin_id),
                "version": plugin_version,
                "events": parsed.get("events", {}),
            }
            if parsed.get("capabilities"):
                event_schema["capabilities"] = parsed["capabilities"]
            if parsed.get("configSchema"):
                config_schema = parsed["configSchema"]
            if parsed.get("dependencies"):
                dependencies = parsed["dependencies"]

        if not config_schema and isinstance(plugin_meta.get("configSchema"), dict):
            config_schema = plugin_meta["configSchema"]

        documentation_contents: list[str] = []
        for doc_path in plugin_meta.get("documentation", []):
            full_path = project_root / doc_path
            if full_path.exists():
                documentation_contents.append(full_path.read_text(encoding="utf-8"))
        if not documentation_contents and fallback_docs:
            documentation_contents.append(fallback_docs)

        publish_request: dict[str, Any] = {
            "org": org,
            "name": plugin_id,
            "version": plugin_version,
            "language": "python",
            "metadata": {
                "displayName": plugin_meta.get("name", plugin_id),
                "description": plugin_meta.get("description") or project_meta.get("description", ""),
                "category": category,
                "tags": plugin_meta.get("tags", []),
                "author": plugin_meta.get("author") or project_meta.get("author"),
                "license": plugin_meta.get("license") or project_meta.get("license"),
                "homepage": plugin_meta.get("homepage") or project_meta.get("homepage"),
                "repository": plugin_meta.get("repository") or project_meta.get("repository"),
            },
            "eventSchema": event_schema,
            "documentation": documentation_contents,
            "package": {"python": package_name} if package_name else None,
            "visibility": plugin_meta.get("visibility", "public"),
            "runtime": project_meta.get("runtime"),
        }
        if publish_request["package"] is None:
            publish_request.pop("package")
        if publish_request["runtime"] is None:
            publish_request.pop("runtime")
        if config_schema is not None:
            publish_request["configSchema"] = config_schema
        if dependencies:
            publish_request["dependencies"] = dependencies

        if target:
            publish_request.pop("documentation", None)
            publish_request["eventSchema"]["pluginId"] = plugin_id
        published.append(registry_request("POST", "/api/plugins/publish" if target else "/plugins", publish_request,
            require_auth=True, target=target, token=token, allow_insecure=allow_insecure))

    return published


__all__ = [
    "display_plugin_id",
    "ensure_gitignore",
    "get_plugin_info",
    "get_plugin_schema",
    "install_plugin",
    "list_plugins",
    "parse_plugin_id",
    "publish_plugins",
    "registry_request",
    "search_plugins",
    "save_client_schema",
    "sync_clients",
]
