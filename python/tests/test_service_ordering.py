from graphlib import CycleError
import asyncio

import pytest

from bsb.services_controller import SBServices, _SortedService


def test_service_dependency_order_and_cycles():
    controller = object.__new__(SBServices)
    def service(name, after=()):
        return _SortedService(name, name, [], list(after), [], list(after), None)
    for phase in ("init", "run"):
        ordered = controller._sort_by_deps(phase, [service("A", ["C"]), service("B"), service("C")])
        names = [item.plugin_name for item in ordered]
        assert names.index("C") < names.index("A")
        try:
            controller._sort_by_deps(phase, [service("A", ["C"]), service("C", ["A"])])
        except CycleError:
            pass
        else:
            raise AssertionError("Dependency cycle accepted")


def test_lifecycle_dependencies_reject_unknown_but_retain_disabled_and_aliases():
    controller = object.__new__(SBServices)
    controller._definitions = {
        "disabled": {"plugin": "worker", "enabled": False},
        "active": {"plugin": "worker", "enabled": True},
    }
    assert asyncio.run(controller._map_plugins(None, "caller", ["disabled"])) == ["disabled"]
    assert asyncio.run(controller._map_plugins(None, "caller", ["worker"])) == ["disabled", "active"]
    with pytest.raises(ValueError, match="Unknown lifecycle dependency missing for service caller"):
        asyncio.run(controller._map_plugins(None, "caller", ["missing"]))
