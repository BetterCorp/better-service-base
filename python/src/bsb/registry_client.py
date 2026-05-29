from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

from .client_generator import generate_clients
from .schema_export import build_project, read_project_metadata


REGISTRY_URL = os.environ.get("BSB_REGISTRY_URL", "https://io.bsbcode.dev")
REGISTRY_TOKEN = os.environ.get("BSB_REGISTRY_TOKEN")
VALID_CATEGORIES = {"service", "observable", "events", "config"}


def parse_plugin_id(plugin_id: str) -> tuple[str, str]:
    if "/" in plugin_id:
        org, name = plugin_id.split("/", 1)
        return org, name
    return "_", plugin_id


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
            f"{detail.get('path', '<root>')}: {detail.get('message', 'Invalid value')}" for detail in details
        )
        return f"{base}{code} - {detail_text}"
    if isinstance(parsed.get("message"), str) and parsed["message"].strip():
        return f"{base}{code} - {parsed['message']}"
    return f"{base}{code}"


def registry_request(method: str, path: str, body: Any | None = None, require_auth: bool = False) -> Any:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    if require_auth:
        if not REGISTRY_TOKEN:
            raise RuntimeError("BSB_REGISTRY_TOKEN environment variable not set")
        headers["Authorization"] = f"Bearer {REGISTRY_TOKEN}"

    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = Request(urljoin(REGISTRY_URL, path), data=data, headers=headers, method=method)

    try:
        with urlopen(request) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return {}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return raw
    except HTTPError as error:
        payload = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(_format_registry_error(payload, error.code)) from error
    except URLError as error:
        raise RuntimeError(str(error.reason)) from error


def ensure_gitignore(project_root: str | Path) -> Path:
    project_root = Path(project_root)
    gitignore_path = project_root / ".gitignore"
    entry = "src/.bsb/"
    if gitignore_path.exists():
        lines = gitignore_path.read_text(encoding="utf-8").splitlines()
        normalized = {line.strip().rstrip("/") for line in lines}
        if "src/.bsb" not in normalized and ".bsb" not in normalized:
            content = gitignore_path.read_text(encoding="utf-8")
            newline = "" if content.endswith("\n") or content == "" else "\n"
            gitignore_path.write_text(f"{content}{newline}{entry}\n", encoding="utf-8")
    else:
        gitignore_path.write_text(f"{entry}\n", encoding="utf-8")
    return gitignore_path


def list_plugins(limit: int = 100) -> Any:
    return registry_request("GET", f"/plugins?{urlencode({'limit': limit})}")


def search_plugins(query: str, limit: int = 100) -> Any:
    return registry_request("GET", f"/plugins?{urlencode({'query': query, 'limit': limit})}")


def get_plugin_info(plugin_id: str) -> Any:
    org, name = parse_plugin_id(plugin_id)
    return registry_request("GET", f"/plugins/{org}/{name}")


def get_plugin_schema(plugin_id: str) -> Any:
    org, name = parse_plugin_id(plugin_id)
    detail = get_plugin_info(plugin_id)
    plugin = detail.get("plugin", detail)
    version = plugin["version"]
    return registry_request("GET", f"/plugins/{org}/{name}/{version}/schema")


def install_plugin(plugin_id: str, project_root: str | Path) -> Path:
    org, name = parse_plugin_id(plugin_id)
    detail = get_plugin_info(plugin_id)
    plugin = detail.get("plugin", detail)
    schema = registry_request("GET", f"/plugins/{org}/{name}/{plugin['version']}/schema")

    project_root = Path(project_root)
    schemas_dir = project_root / "src" / ".bsb" / "schemas"
    schemas_dir.mkdir(parents=True, exist_ok=True)
    ensure_gitignore(project_root)
    schema_path = schemas_dir / f"{name}.json"
    schema_path.write_text(json.dumps(schema, indent=2), encoding="utf-8")
    generate_clients(project_root)
    return schema_path


def sync_clients(project_root: str | Path) -> list[Path]:
    ensure_gitignore(project_root)
    return generate_clients(project_root)


def publish_plugins(project_root: str | Path) -> list[dict[str, Any]]:
    project_root = Path(project_root)
    build_project(project_root)
    manifest_path = project_root / "bsb-plugin.json"
    if not manifest_path.exists():
        raise RuntimeError("No bsb-plugin.json found. Run 'bsb plugin build' first.")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugin_entries = manifest.get("python", [])
    if not plugin_entries:
        raise RuntimeError("No Python plugins found in bsb-plugin.json")

    project_meta = read_project_metadata(project_root)
    package_name = project_meta.get("name")
    version = str(project_meta.get("version") or "1.0.0")
    readme_path = project_root / "README.md"
    fallback_docs = readme_path.read_text(encoding="utf-8") if readme_path.exists() else None
    org = os.environ.get("BSB_ORG_ID", "_")
    published: list[dict[str, Any]] = []

    for plugin_meta in plugin_entries:
        plugin_id = plugin_meta["id"]
        category = str(plugin_meta.get("category") or plugin_id.split("-", 1)[0]).lower()
        if category not in VALID_CATEGORIES:
            raise RuntimeError(f"Invalid category '{category}' for plugin '{plugin_id}'")

        schema_path = project_root / "lib" / "schemas" / f"{plugin_id}.json"
        event_schema: dict[str, Any] = {"pluginName": plugin_id, "version": version, "events": {}}
        config_schema: dict[str, Any] | None = None
        dependencies: list[dict[str, str]] | None = None
        if schema_path.exists():
            parsed = json.loads(schema_path.read_text(encoding="utf-8"))
            event_schema = {
                "pluginName": parsed.get("pluginName", plugin_id),
                "version": parsed.get("version", version),
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
            "version": version,
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

        published.append(registry_request("POST", "/plugins", publish_request, require_auth=True))

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
    "sync_clients",
]
