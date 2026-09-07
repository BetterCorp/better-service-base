"""Registry versions stay exact; Python distributions use PEP 440 normalization."""
import re
from packaging.version import InvalidVersion, Version

EXACT_VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?")


def versions_equal(actual: str, requested: str) -> bool:
    if actual == requested:
        return True
    try:
        return Version(actual) == Version(requested)
    except InvalidVersion:
        return False
