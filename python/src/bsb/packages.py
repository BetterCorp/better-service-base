"""Use wheels, entry points and pip's dependency resolver for native Python plugins."""
import importlib.metadata
from pathlib import Path
import re
import subprocess
import sys
import tomllib
import zipfile

from .schema_export import build_project


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
    if wheel.suffix == ".whl" and wheel.is_file():
        with zipfile.ZipFile(wheel) as archive:
            names = [name for name in archive.namelist() if name.endswith(".dist-info/entry_points.txt")]
            if len(names) != 1 or "[bsb.plugins]" not in archive.read(names[0]).decode():
                raise ValueError("Wheel does not declare bsb.plugins entry points")
        requirement = str(wheel.resolve())
    else:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", package) or not version or not re.fullmatch(r"\d+\.\d+\.\d+", version):
            raise ValueError("A distribution name and exact --version are required")
        requirement = f"{package}=={version}"
    args = [sys.executable, "-m", "pip", "install", requirement]
    if source:
        args.extend(["--find-links", source])
    subprocess.run(args, check=True)
    importlib.invalidate_caches()
