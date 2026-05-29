from __future__ import annotations

import asyncio
import os
from pathlib import Path

from bsb import BSBValidationError
from bsb.interfaces import BSBOptions
from bsb.service_base import ServiceBase


def test_service_base_bootstrap(tmp_path: Path) -> None:
    prev = os.environ.get("BSB_CONFIG_FILE")
    cfg_path = tmp_path / "sec-config.yaml"
    cfg_path.write_text(
        "\n".join(
            [
                "default:",
                "  observable: {}",
                "  events: {}",
                "  services:",
                "    service-default0:",
                "      plugin: service-default0",
                "      enabled: true",
                "      config:",
                "        testa: 1",
                "        testb: 2",
                "        junk: true",
            ]
        ),
        encoding="utf-8",
    )
    try:
        app = ServiceBase(BSBOptions(cwd=str(tmp_path), mode="development", app_id="test-app"))
        asyncio.run(app.init())
        assert app.services._active_services[0].config == {"testa": 1, "testb": 2}
        asyncio.run(app.run())
        code = asyncio.run(app.dispose(0, "test complete"))
        assert code == 0
        assert app.boot_time_metric.value >= 0
    finally:
        if prev is None:
            os.environ.pop("BSB_CONFIG_FILE", None)
        else:
            os.environ["BSB_CONFIG_FILE"] = prev


def test_service_base_rejects_invalid_plugin_config(tmp_path: Path) -> None:
    prev = os.environ.get("BSB_CONFIG_FILE")
    cfg_path = tmp_path / "sec-config.yaml"
    cfg_path.write_text(
        "\n".join(
            [
                "default:",
                "  observable: {}",
                "  events: {}",
                "  services:",
                "    service-default0:",
                "      plugin: service-default0",
                "      enabled: true",
                "      config:",
                "        testa: bad",
                "        testb: 2",
            ]
        ),
        encoding="utf-8",
    )
    try:
        app = ServiceBase(BSBOptions(cwd=str(tmp_path), mode="development", app_id="test-app"))
        try:
            asyncio.run(app.init())
            raise AssertionError("Expected invalid config to fail")
        except BSBValidationError as ex:
            assert "service-default0" in str(ex)
            assert "testa" in str(ex)
    finally:
        if prev is None:
            os.environ.pop("BSB_CONFIG_FILE", None)
        else:
            os.environ["BSB_CONFIG_FILE"] = prev


def test_service_base_uses_default_yaml_filename(tmp_path: Path) -> None:
    (tmp_path / "sec-config.yaml").write_text(
        "\n".join(
            [
                "default:",
                "  observable: {}",
                "  events: {}",
                "  services:",
                "    service-default0:",
                "      plugin: service-default0",
                "      enabled: true",
                "      config:",
                "        testa: 3",
                "        testb: 4",
            ]
        ),
        encoding="utf-8",
    )
    prev = os.environ.get("BSB_CONFIG_FILE")
    os.environ.pop("BSB_CONFIG_FILE", None)
    try:
        app = ServiceBase(BSBOptions(cwd=str(tmp_path), mode="development", app_id="test-app"))
        asyncio.run(app.init())
        assert app.services._active_services[0].config == {"testa": 3, "testb": 4}
    finally:
        if prev is None:
            os.environ.pop("BSB_CONFIG_FILE", None)
        else:
            os.environ["BSB_CONFIG_FILE"] = prev
