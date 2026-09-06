from __future__ import annotations

import asyncio
import os
import signal
import sys

from .interfaces import BSBOptions
from .service_base import ServiceBase


async def _main() -> int:
    app = ServiceBase(BSBOptions(cwd=os.getcwd(), mode=os.environ.get("BSB_MODE", "development"), app_id=os.environ.get("BSB_APP_ID", "bsb-python")))
    loop = asyncio.get_running_loop()
    signals = {}
    for signum in (signal.SIGINT, signal.SIGTERM):
        signals[signum] = signal.getsignal(signum)
        try:
            loop.add_signal_handler(signum, app.request_shutdown)
        except NotImplementedError:
            signal.signal(signum, lambda *_: loop.call_soon_threadsafe(app.request_shutdown))
    try:
        await app.init()
        await app.run()
        await app.wait_for_shutdown()
        return 0
    except Exception as error:
        print(f"BSB failed: {error}", file=sys.stderr, flush=True)
        return 3
    finally:
        try:
            await app.dispose()
        finally:
            for signum, previous in signals.items():
                try:
                    loop.remove_signal_handler(signum)
                except NotImplementedError:
                    pass
                signal.signal(signum, previous)


def main() -> int:
    return asyncio.run(_main())


if __name__ == "__main__":
    raise SystemExit(main())
