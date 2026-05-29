from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


Mode = str


@dataclass(slots=True)
class PluginDefinition:
    plugin: str
    enabled: bool = True
    package: str | None = None
    version: str | None = None
    config: dict[str, Any] | None = None
    filter: Any = None


@dataclass(slots=True)
class ProfileConfig:
    observable: dict[str, PluginDefinition] = field(default_factory=dict)
    events: dict[str, PluginDefinition] = field(default_factory=dict)
    services: dict[str, PluginDefinition] = field(default_factory=dict)


@dataclass(slots=True)
class BSBOptions:
    cwd: str
    mode: Mode = "development"
    app_id: str = "bsb-python"
