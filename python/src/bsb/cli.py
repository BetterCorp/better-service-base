from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from .client_generator import generate_clients
from .registry_client import (
    REGISTRY_URL,
    get_plugin_info,
    get_plugin_schema,
    install_plugin,
    list_plugins,
    publish_plugins,
    search_plugins,
    sync_clients,
)
from .schema_export import build_project, export_schemas


def _error(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 1


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, indent=2))


def _usage() -> int:
    print("BSB Python CLI")
    print("")
    print("Usage:")
    print("  bsb run")
    print("  bsb plugin build")
    print("  bsb plugin export")
    print("  bsb client list")
    print("  bsb client search <query>")
    print("  bsb client info <name>")
    print("  bsb client schema <name>")
    print("  bsb client install <name>")
    print("  bsb client sync")
    print("  bsb client export")
    print("  bsb client publish")
    print("")
    print(f"Registry: {REGISTRY_URL}")
    return 0


def _run_service() -> int:
    from .main import main as runtime_main

    return runtime_main()


def main(argv: list[str] | None = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    if not args:
        return _usage()

    cwd = Path(os.getcwd())
    command = args.pop(0)

    try:
        if command == "run":
            return _run_service()

        if command == "plugin":
            if not args:
                return _error("Missing plugin subcommand")
            subcommand = args.pop(0)
            if subcommand == "build":
                result = build_project(cwd)
                print(f"Generated manifest: {result['manifest']}")
                print(f"Exported {len(result['schemas'])} schema file(s)")
                return 0
            if subcommand == "export":
                written = export_schemas(cwd)
                print(f"Exported {len(written)} schema file(s)")
                return 0
            return _error(f"Unknown plugin subcommand: {subcommand}")

        if command == "client":
            if not args:
                return _error("Missing client subcommand")
            subcommand = args.pop(0)
            if subcommand == "list":
                _print_json(list_plugins())
                return 0
            if subcommand == "search":
                if not args:
                    return _error("Usage: bsb client search <query>")
                _print_json(search_plugins(args[0]))
                return 0
            if subcommand == "info":
                if not args:
                    return _error("Usage: bsb client info <name>")
                _print_json(get_plugin_info(args[0]))
                return 0
            if subcommand == "schema":
                if not args:
                    return _error("Usage: bsb client schema <name>")
                _print_json(get_plugin_schema(args[0]))
                return 0
            if subcommand == "install":
                if not args:
                    return _error("Usage: bsb client install <name>")
                schema_path = install_plugin(args[0], cwd)
                print(f"Installed schema: {schema_path}")
                return 0
            if subcommand == "sync":
                written = sync_clients(cwd)
                print(f"Generated {len(written)} client file(s)")
                return 0
            if subcommand == "export":
                result = build_project(cwd)
                generated = generate_clients(cwd)
                print(f"Generated manifest: {result['manifest']}")
                print(f"Exported {len(result['schemas'])} schema file(s)")
                print(f"Generated {len(generated)} client file(s)")
                return 0
            if subcommand == "publish":
                published = publish_plugins(cwd)
                print(f"Published {len(published)} plugin(s)")
                return 0
            return _error(f"Unknown client subcommand: {subcommand}")

        return _error(f"Unknown command: {command}")
    except Exception as ex:  # pragma: no cover
        return _error(str(ex))


__all__ = ["main"]


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
