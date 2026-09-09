from pathlib import Path

from setuptools import setup
from setuptools.command.build_py import build_py
from setuptools.command.sdist import sdist


def prepare() -> None:
    from bsb.schema_export import build_project

    build_project(Path(__file__).parent)


class BuildPy(build_py):
    def run(self) -> None:
        prepare()
        super().run()


class Sdist(sdist):
    def run(self) -> None:
        prepare()
        super().run()


setup(cmdclass={"build_py": BuildPy, "sdist": Sdist})
