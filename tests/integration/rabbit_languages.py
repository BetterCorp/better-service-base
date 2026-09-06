"""Real Node/.NET/Python RPC/stream matrix plus absent/crashed consumer recovery."""
import asyncio
import hashlib
import os
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit
import uuid

from bsb.base import PluginCtor
from bsb.observable import ObservableBackend, SBObservable
from bsb.plugins.events_rabbitmq import Plugin


async def main():
    root = Path(__file__).resolve().parents[2]
    url = os.environ["BSB_RABBITMQ_URL"]
    endpoint = urlsplit(url)
    platform = "interop-" + uuid.uuid4().hex
    env = {**os.environ, "BSB_INTEROP_PLATFORM": platform}
    backend = ObservableBackend("test", "interop", "python", SBObservable("interop", "test"))
    trace = backend.create_trace("interop")
    rabbit = Plugin(PluginCtor("interop", "test", "rabbit", str(root), "", "", {"platformKey": platform, "endpoints": [url],
        "credentials": {"username": unquote(endpoint.username or "guest"), "password": unquote(endpoint.password or "guest")}}, "1.0.0", backend))
    commands = {"nodejs": ["node", str(root / "tests/integration/node-rabbit-peer.mjs")],
        "csharp": ["dotnet", str(root / "dotnet/tests/RabbitPeer/bin/Release/net10.0/RabbitPeer.dll")]}
    peers = {}
    async def line(process, expected):
        async with asyncio.timeout(30):
            while True:
                output = await process.stdout.readline()
                if not output: raise RuntimeError(f"Peer exited before {expected}: {process.returncode}")
                if output.decode().strip() == expected: return
    async def start(language, crash=False):
        process = await asyncio.create_subprocess_exec(*commands[language], cwd=root, env={**env, "BSB_INTEROP_CRASH_FIRST": str(crash).lower()},
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
        peers[language] = process
        await line(process, "READY")
    async def rpc(target, event, value):
        return await rabbit.emit_event_and_return(trace, target, event, 30, value)
    data = bytes(range(256)) * 4096
    expected = hashlib.sha256(data).hexdigest()
    incoming = None
    async def receive(span, error, stream):
        if error: incoming.set_exception(error)
        else: incoming.set_result(hashlib.sha256(await stream.read()).hexdigest())
    try:
        await rabbit.init(trace)
        async def echo(span, value): return {"value": value, "trace": span.trace_id}
        await rabbit.on_returnable_event(trace, "python", "echo", echo)
        # Publish first: broker must retain an RPC before either native peer starts.
        waiting = asyncio.create_task(rpc("nodejs", "echo", {"late": True}))
        await asyncio.sleep(.2)
        await start("nodejs", True)
        queued = await waiting
        assert queued["value"] == {"late": True}, queued
        print("PASS: request queued before listener startup", flush=True)
        await start("csharp", True)
        for caller in ("python", "nodejs", "csharp"):
            for target in ("python", "nodejs", "csharp"):
                if caller == target: continue
                value = {"from": caller, "to": target, "optional": None}
                result = await rpc(target, "echo", value) if caller == "python" else await rpc(caller, "call", {"target": target, "value": value})
                assert result == {"value": value, "trace": trace.trace_id}, result
                print(f"PASS: RPC {caller} -> {target}", flush=True)
        for language in ("nodejs", "csharp"):
            pending = asyncio.create_task(rpc(language, "crash", "redelivered"))
            process = peers[language]
            await line(process, "CRASH_READY")
            process.kill()
            await process.wait()
            await start(language)
            assert await pending == "redelivered"
            print(f"PASS: {language} consumer crash redelivery", flush=True)
        # Every directed language pair transfers the same binary data.
        for sender in ("python", "nodejs", "csharp"):
            for receiver in ("python", "nodejs", "csharp"):
                if sender == receiver: continue
                incoming = asyncio.get_running_loop().create_future()
                stream_id = await rabbit.receive_stream(trace, "python", "file", receive, 5) if receiver == "python" else await rpc(receiver, "receive", {})
                if sender == "python": await rabbit.send_stream(trace, receiver, "file", stream_id, data)
                else: assert await rpc(sender, "send", {"target": receiver, "id": stream_id}) is True
                if receiver == "python": digest = await asyncio.wait_for(incoming, 10)
                else:
                    async with asyncio.timeout(10):
                        while (digest := await rpc(receiver, "digest", {})) is None: await asyncio.sleep(.01)
                assert digest == expected, (sender, receiver, digest)
                print(f"PASS: binary stream {sender} -> {receiver}", flush=True)
        print("PASS: six-direction RPC/trace/1 MiB stream matrix, absent listeners and crashed native consumers")
    finally:
        for process in peers.values():
            if process.returncode is None:
                process.stdin.write(b"stop\n")
                await process.stdin.drain()
                try: await asyncio.wait_for(process.wait(), 10)
                except TimeoutError:
                    process.kill()
                    await process.wait()
        await rabbit.dispose()


if __name__ == "__main__":
    asyncio.run(main())
