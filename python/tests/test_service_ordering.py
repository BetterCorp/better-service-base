from graphlib import CycleError
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
