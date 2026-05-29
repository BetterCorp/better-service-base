from __future__ import annotations

import asyncio
import os
import time
import uuid
from pathlib import Path
from typing import Any

from .config_controller import SBConfig
from .events_controller import SBEvents
from .interfaces import BSBOptions
from .observable import ObservableBackend, SBObservable
from .plugin_loader import SBPlugins
from .services_controller import SBServices


class ServiceBase:
    def __init__(self, options: BSBOptions | None = None) -> None:
        resolved = options or BSBOptions(cwd=os.getcwd())
        self.mode = resolved.mode
        self.cwd = str(Path(resolved.cwd).resolve())
        self.app_id = resolved.app_id or f"bsb-{uuid.uuid4().hex[:8]}"

        self._keep: dict[str, int] = {"BSB": time.time_ns()}
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._disposing = False

        self.observable = SBObservable(self.app_id, self.mode)
        self.core_obs = ObservableBackend(self.mode, self.app_id, "core", self.observable)
        self.plugins = SBPlugins(self.cwd, self.mode == "development")
        self.config = SBConfig(self.app_id, self.mode, self.cwd, self.plugins, self.core_obs)
        self.events = SBEvents(self.app_id, self.mode, self.cwd, self.plugins, self.core_obs)
        self.services = SBServices(self.app_id, self.mode, self.cwd, self.plugins, self.events, self.core_obs)

        self.heartbeat_metric = self.core_obs.create_counter("heartbeat")
        self.boot_time_metric = self.core_obs.create_gauge("bsbBootTime")

    @staticmethod
    def development(cwd: str | None = None) -> "ServiceBase":
        return ServiceBase(BSBOptions(cwd=cwd or os.getcwd(), mode="development"))

    @staticmethod
    def production(cwd: str | None = None) -> "ServiceBase":
        return ServiceBase(BSBOptions(cwd=cwd or os.getcwd(), mode="production"))

    async def init(self) -> None:
        self._start("INIT")
        self._start("CONFIG")
        await self.config.init()
        self._end("CONFIG")

        self._start("OBSERVABLE")
        await self.observable.init()
        self._end("OBSERVABLE")

        self._start("EVENTS")
        await self.events.init(self.config)
        self._end("EVENTS")

        self._start("SERVICES")
        await self.services.setup(self.config)
        await self.services.init()
        self._end("SERVICES")
        self._end("INIT")

    async def run(self) -> None:
        self._start("RUN")
        await self.observable.run()
        await self.events.run()
        await self.services.run()
        self.config.dispose()
        self._end("RUN")
        self._end("BSB")
        self.boot_time_metric.set(self._ms("BSB"))
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def dispose(self, code: int = 0, reason: str = "shutdown", extra_data: Any = None) -> int:
        if self._disposing:
            return code
        self._disposing = True
        trace = self.core_obs.create_trace("dispose", "ServiceBase")
        self.core_obs.info(trace, "Disposing BSB: {reason}", {"reason": reason})
        if extra_data is not None:
            self.core_obs.error(trace, "Extra data: {data}", {"data": str(extra_data)})
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
        self.services.dispose()
        self.events.dispose()
        self.observable.dispose()
        self.config.dispose()
        return code

    def _start(self, key: str) -> None:
        self._keep[key] = time.time_ns()

    def _end(self, key: str) -> None:
        start = self._keep.get(key)
        if start is None:
            return
        duration_ns = time.time_ns() - start
        self._keep[key] = duration_ns
        self.core_obs.info(
            self.core_obs.create_trace("timer", "ServiceBase"),
            "[TIMER] {timerName} took ({nsTime}ns) ({msTime}ms)",
            {"timerName": key, "nsTime": duration_ns, "msTime": duration_ns / 1_000_000.0},
        )

    def _ms(self, key: str) -> float:
        return float(self._keep.get(key, 0)) / 1_000_000.0

    async def _heartbeat_loop(self) -> None:
        while True:
            self.heartbeat_metric.increment()
            await asyncio.sleep(60 * 60)
