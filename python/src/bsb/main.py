from __future__ import annotations

import asyncio
import os

from .interfaces import BSBOptions
from .service_base import ServiceBase


async def _main() -> int:
    app = ServiceBase(
        BSBOptions(
            cwd=os.getcwd(),
            mode=os.environ.get("BSB_MODE", "development"),
            app_id=os.environ.get("BSB_APP_ID", "bsb-python"),
        )
    )
    try:
        await app.init()
        await app.run()
        return 0
    except KeyboardInterrupt:
        return await app.dispose(0, "keyboard interrupt")
    except Exception as ex:  # pragma: no cover
        return await app.dispose(3, "uncaught exception", ex)


def main() -> int:
    return asyncio.run(_main())


if __name__ == "__main__":
    raise SystemExit(main())
