"""Use wheels, entry points and pip's dependency resolver for native Python plugins."""
import configparser
from email.parser import BytesParser
import importlib.metadata
import os
from pathlib import Path
import re
import subprocess
import sys
import tomllib
import zipfile
from packaging.requirements import InvalidRequirement, Requirement
from packaging.version import Version

from .schema_export import build_project
from .versions import EXACT_VERSION


def _validate_wheelhouse(source):
    root = Path(source).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("Python plugin --source must be a local wheelhouse directory")
    wheels = sorted(root.glob("*.whl"))
    if not wheels:
        raise ValueError("Python plugin --source must contain wheel packages")
    for wheel in wheels:
        with zipfile.ZipFile(wheel) as archive:
            metadata = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
            if len(metadata) != 1:
                raise ValueError(f"Wheel {wheel.name} must contain exactly one METADATA file")
            message = BytesParser().parsebytes(archive.read(metadata[0]))
            for value in message.get_all("Requires-Dist", []):
                try:
                    dependency = Requirement(value)
                except InvalidRequirement as exc:
                    raise ValueError(f"Wheel {wheel.name} has an invalid dependency requirement") from exc
                if dependency.url:
                    raise ValueError(f"Wheel {wheel.name} contains a direct URL dependency")
    return root


def pack(project_root):
    root = Path(project_root).resolve()
    result = build_project(root)
    config = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))
    entries = config.get("project", {}).get("entry-points", {}).get("bsb.plugins", {})
    if not entries:
        raise ValueError('Wheel plugins require [project.entry-points."bsb.plugins"] in pyproject.toml')
    output = root / ".bsb" / "packages"
    output.mkdir(parents=True, exist_ok=True)
    subprocess.run([sys.executable, "-m", "pip", "wheel", "--no-deps", "--wheel-dir", str(output), str(root)], check=True, cwd=root)
    return output


def install(package, version=None, source=None):
    if sys.prefix == sys.base_prefix:
        raise ValueError("Install Python plugins in the application's virtual environment")
    wheel = Path(package)
    is_wheel = wheel.suffix == ".whl" and wheel.is_file()
    if is_wheel:
        with zipfile.ZipFile(wheel) as archive:
            names = [name for name in archive.namelist() if name.endswith(".dist-info/entry_points.txt")]
            entries = configparser.ConfigParser(interpolation=None)
            valid = False
            try:
                if len(names) == 1:
                    entries.read_string(archive.read(names[0]).decode())
                    valid = bool(entries._sections.get("bsb.plugins"))
            except (UnicodeDecodeError, configparser.Error):
                pass
            if not valid:
                raise ValueError("Wheel does not declare bsb.plugins entry points")
        requirement = str(wheel.resolve())
    else:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", package) or not isinstance(version, str) or not EXACT_VERSION.fullmatch(version):
            raise ValueError("A distribution name and exact --version are required")
        requirement = f"{package}=={Version(version)}"
    args = [sys.executable, "-m", "pip", "install", requirement]
    environment = os.environ.copy()
    if source:
        wheelhouse = _validate_wheelhouse(source)
        # Disable every ambient pip source. --no-index does not suppress
        # inherited find-links settings, and an installed distribution could
        # otherwise satisfy the requirement without coming from this source.
        environment = {key: value for key, value in environment.items() if not key.upper().startswith("PIP_")}
        environment["PIP_CONFIG_FILE"] = os.devnull
        args.extend([
            "--no-index", "--only-binary=:all:", "--force-reinstall",
            "--find-links", str(wheelhouse),
        ])
    subprocess.run(args, check=True, env=environment)
    importlib.invalidate_caches()
    if not is_wheel:
        distribution = importlib.metadata.distribution(package)
        if not any(entry.group == "bsb.plugins" for entry in distribution.entry_points):
            raise ValueError(f"Distribution {package} does not declare bsb.plugins entry points")
