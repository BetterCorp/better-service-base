from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any, Awaitable, Callable

from ..base import BSBEvents
from ..observable import Trace
from ..schema import object_schema


class Config:
    metadata = {
        "name": "events-default",
        "description": "Default in-memory events transport.",
        "category": "events",
    }
    validation_schema = object_schema({})


class Plugin(BSBEvents):
    def __init__(self, ctor) -> None:
        super().__init__(ctor)
        self._event_listeners: dict[str, list[Callable[..., Awaitable[None]]]] = defaultdict(list)
        self._broadcast_listeners: dict[str, list[Callable[..., Awaitable[None]]]] = defaultdict(list)
        self._returnable_listeners: dict[str, list[Callable[..., Awaitable[Any]]]] = defaultdict(list)

    def _key(self, plugin_name: str, event: str) -> str:
        return f"{plugin_name}:{event}"

    async def on_broadcast(self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        self._broadcast_listeners[self._key(plugin_name, event)].append(listener)

    async def emit_broadcast(self, trace: Trace, plugin_name: str, event: str, payload: Any) -> None:
        listeners = list(self._broadcast_listeners.get(self._key(plugin_name, event), []))
        for listener in listeners:
            await listener(trace, payload)

    async def on_event(self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[None]]) -> None:
        self._event_listeners[self._key(plugin_name, event)].append(listener)

    async def emit_event(self, trace: Trace, plugin_name: str, event: str, payload: Any) -> None:
        listeners = list(self._event_listeners.get(self._key(plugin_name, event), []))
        for listener in listeners:
            await listener(trace, payload)

    async def on_returnable_event(
        self, trace: Trace, plugin_name: str, event: str, listener: Callable[..., Awaitable[Any]]
    ) -> None:
        self._returnable_listeners[self._key(plugin_name, event)].append(listener)

    async def emit_event_and_return(
        self,
        trace: Trace,
        plugin_name: str,
        event: str,
        timeout_seconds: float,
        payload: Any,
    ) -> Any:
        listeners = list(self._returnable_listeners.get(self._key(plugin_name, event), []))
        if not listeners:
            raise RuntimeError(f"No returnable listener for {plugin_name}:{event}")
        return await asyncio.wait_for(listeners[0](trace, payload), timeout=timeout_seconds)
