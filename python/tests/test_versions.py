from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path

import bsb.main
from bsb.interfaces import BSBOptions
from bsb.service_base import ServiceBase
from bsb.versions import EXACT_VERSION


def test_exact_version_matches_shared_semver_cases() -> None:
    cases = json.loads((Path(__file__).parents[2] / "tests" / "fixtures" / "semver-versions.json").read_text(encoding="utf-8"))

    assert all(EXACT_VERSION.fullmatch(version) for version in cases["valid"])
    assert not any(EXACT_VERSION.fullmatch(version) for version in cases["invalid"])


def test_main_generates_app_id_unless_explicitly_configured(monkeypatch) -> None:
    created: list[ServiceBase] = []

    async def noop(*_args, **_kwargs) -> None:
        return None

    async def dispose(*_args, **_kwargs) -> int:
        return 0

    def create(options: BSBOptions) -> ServiceBase:
        app = ServiceBase(options)
        created.append(app)
        return app

    monkeypatch.setattr(ServiceBase, "init", noop)
    monkeypatch.setattr(ServiceBase, "run", noop)
    monkeypatch.setattr(ServiceBase, "wait_for_shutdown", noop)
    monkeypatch.setattr(ServiceBase, "dispose", dispose)
    monkeypatch.setattr(bsb.main, "ServiceBase", create)
    monkeypatch.delenv("BSB_APP_ID", raising=False)
    assert asyncio.run(bsb.main._main()) == 0
    assert re.fullmatch(r"bsb-[0-9a-f]{8}", created[-1].app_id)
    first_generated = created[-1].app_id
    assert asyncio.run(bsb.main._main()) == 0
    assert created[-1].app_id != first_generated

    monkeypatch.setenv("BSB_APP_ID", "configured-app")
    assert asyncio.run(bsb.main._main()) == 0
    assert created[-1].app_id == "configured-app"
