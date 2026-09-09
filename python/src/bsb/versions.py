"""Registry versions stay exact; Python distributions use PEP 440 normalization."""
import re
from packaging.version import InvalidVersion, Version

_CORE = r"(?:0|[1-9][0-9]*)"
_PRERELEASE = r"(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
EXACT_VERSION = re.compile(
    rf"{_CORE}\.{_CORE}\.{_CORE}(?:-{_PRERELEASE}(?:\.{_PRERELEASE})*)?"
    r"(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
)


def versions_equal(actual: str, requested: str) -> bool:
    if actual == requested:
        return True
    try:
        return Version(actual) == Version(requested)
    except InvalidVersion:
        return False
