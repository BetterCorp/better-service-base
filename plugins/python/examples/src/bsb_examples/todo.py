import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import tempfile
from threading import Thread
import time
from urllib.parse import urlsplit
import uuid

from bsb.base import BSBService, BSBValidationError
from bsb.schema import import_portable_schema
from bsb.schema_events import import_event_schemas
from .contracts import load_contract


class Config:
    metadata = {"name": "service-demo-todo", "category": "service", "description": "Native todo CRUD, atomic file storage and HTTP example"}
    validation_schema = import_portable_schema(load_contract("service-demo-todo")["configSchema"])


class Plugin(BSBService):
    EventSchemas = import_event_schemas(load_contract("service-demo-todo"))

    def __init__(self, ctor):
        super().__init__(ctor)
        from .clients.service_demo_todo import DemoTodoClient
        self.client = DemoTodoClient(self, self.plugin_name)
        self.path = Path(self.cwd) / self.config["storage"]["path"]
        self.items = {}
        self.generation = self.saved = 0
        self.save_lock = asyncio.Lock()
        self.tasks = []
        self.http = self.thread = None

    async def init(self, trace):
        if self.path.exists():
            def read():
                with self.path.open("rb") as stream:
                    data = stream.read(8 * 1024 * 1024 + 1)
                if len(data) > 8 * 1024 * 1024: raise ValueError("Todo file exceeds size limit")
                return json.loads(data)
            data = await asyncio.to_thread(read)
            if not isinstance(data, list) or len(data) > self.config["features"]["maxTodos"]:
                raise ValueError("Invalid todo storage")
            for item in data:
                item = self.EventSchemas["onReturnableEvents"]["todo.create"]["output"].parse(item)
                if item["id"] in self.items: raise ValueError("Duplicate stored todo ID")
                self.items[item["id"]] = item
        for event, method in (("create", self.create), ("get", self.get), ("list", self.list), ("update", self.update), ("delete", self.delete)):
            await self.events.on_returnable_event("todo." + event, method, obs=trace)

    # ponytail: all mutations run on the host event loop; use a database for multiple processes writing the same file.
    async def create(self, trace, value):
        if len(self.items) >= self.config["features"]["maxTodos"]: raise ValueError("Maximum todo count reached")
        now = datetime.now(timezone.utc).isoformat()
        item = {**value, "id": str(uuid.uuid4()), "completed": False, "createdAt": now, "updatedAt": now}
        self.items[item["id"]] = item
        self.generation += 1
        await self.events.emit_event("todo.created", deepcopy(item), obs=trace)
        return deepcopy(item)

    async def get(self, trace, value): return deepcopy(self.items[value["id"]])
    async def list(self, trace, value): return {"todos": deepcopy(list(self.items.values())), "total": len(self.items)}

    async def update(self, trace, value):
        item = {**self.items[value["id"]], **{key: value[key] for key in ("title", "description", "completed") if key in value}, "updatedAt": datetime.now(timezone.utc).isoformat()}
        self.items[item["id"]] = item
        self.generation += 1
        await self.events.emit_event("todo.updated", deepcopy(item), obs=trace)
        return deepcopy(item)

    async def delete(self, trace, value):
        del self.items[value["id"]]
        self.generation += 1
        await self.events.emit_event("todo.deleted", {"id": value["id"]}, obs=trace)
        return {"success": True}

    async def save(self):
        async with self.save_lock:
            if self.saved == self.generation: return
            generation = self.generation
            data = json.dumps(list(self.items.values()), indent=2 if self.config["storage"]["prettyPrint"] else None)
            def write():
                self.path.parent.mkdir(parents=True, exist_ok=True)
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent, delete=False) as stream:
                        temporary = stream.name
                        stream.write(data)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temporary, self.path)
                finally:
                    if temporary and os.path.exists(temporary): os.unlink(temporary)
            # Shield the atomic write from cancellation before releasing the save lock.
            task = asyncio.create_task(asyncio.to_thread(write))
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                await task
                raise
            self.saved = generation

    async def repeat(self, seconds, action):
        while True:
            await asyncio.sleep(seconds)
            trace = self.create_trace("todo.background")
            try:
                await action(trace)
            except Exception as error:
                trace.error(error)
            finally:
                trace.end()

    async def run(self, trace):
        loop = asyncio.get_running_loop()
        plugin = self
        class Handler(BaseHTTPRequestHandler):
            def setup(self):
                super().setup()
                self.connection.settimeout(10)
            def log_message(self, *_): pass
            def handle_route(self):
                try:
                    if self.headers.get("Transfer-Encoding") or len(self.headers.get_all("Content-Length", [])) > 1:
                        self.send_error(400)
                        return
                    length = int(self.headers.get("Content-Length", "0"))
                    if not 0 <= length <= 65536:
                        self.send_error(413)
                        return
                    body = self.rfile.read(length)
                    if len(body) != length:
                        self.send_error(400)
                        return
                    future = asyncio.run_coroutine_threadsafe(plugin.route(self.command, urlsplit(self.path).path, body), loop)
                    try:
                        status, content_type, payload = future.result(timeout=30)
                    except TimeoutError:
                        future.cancel()
                        self.send_error(504)
                        return
                    self.send_response(status)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(len(payload)))
                    self.send_header("X-Content-Type-Options", "nosniff")
                    if plugin.config["http"]["cors"]:
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
                        self.send_header("Access-Control-Allow-Headers", "Content-Type")
                    self.end_headers()
                    self.wfile.write(payload)
                except (ValueError, ConnectionError, TimeoutError):
                    self.close_connection = True
            do_GET = do_POST = do_PATCH = do_DELETE = do_OPTIONS = handle_route
        # ponytail: stdlib threaded HTTP is sufficient for this demo; use an ASGI server for production traffic.
        self.http = ThreadingHTTPServer((self.config["http"]["host"], self.config["http"]["port"]), Handler)
        self.thread = Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()
        async def save(span): await self.save()
        async def stats(span):
            total = len(self.items)
            completed = sum(item["completed"] for item in self.items.values())
            await self.events.emit_broadcast("todo.stats", {"total": total, "completed": completed, "pending": total - completed, "timestamp": datetime.now(timezone.utc).isoformat()}, obs=span)
        self.tasks.append(asyncio.create_task(self.repeat(self.config["storage"]["autoSaveInterval"] / 1000, save)))
        if self.config["features"]["statsInterval"]:
            self.tasks.append(asyncio.create_task(self.repeat(self.config["features"]["statsInterval"], stats)))
        trace.info("Todo HTTP server started on port {port}", {"port": self.http.server_port})

    async def route(self, method, path, data):
        span = self.create_trace("http.request")
        start, status = time.perf_counter(), 200
        try:
            if method == "OPTIONS" and self.config["http"]["cors"]: return 204, "application/json", b""
            assets = {"/": ("index.html", "text/html"), "/index.html": ("index.html", "text/html"), "/app.js": ("app.js", "text/javascript"), "/style.css": ("style.css", "text/css")}
            if method == "GET" and path in assets:
                name, mime = assets[path]
                return 200, mime, (Path(__file__).parent / "static" / name).read_bytes()
            body = json.loads(data) if method in ("POST", "PATCH") else {}
            if not isinstance(body, dict): raise ValueError("Body must be an object")
            if path == "/api/todos" and method == "GET": result = await self.client.todo_list({}, obs=span)
            elif path == "/api/todos" and method == "POST":
                result = await self.client.todo_create(body, obs=span)
                status = 201
            elif path.startswith("/api/todos/"):
                body["id"] = str(uuid.UUID(path[11:]))
                operation = {"GET": self.client.todo_get, "PATCH": self.client.todo_update, "DELETE": self.client.todo_delete}.get(method)
                if operation is None: raise KeyError("Unknown route")
                result = await operation(body, obs=span)
            else:
                status, result = 404, {"error": "Not found"}
        except Exception as error:
            span.error(error)
            status = 404 if isinstance(error, KeyError) else 400 if isinstance(error, (ValueError, BSBValidationError)) else 500
            result = {"error": "Internal server error" if status == 500 else "Invalid request or missing todo"}
        finally:
            self._obs.create_counter("http.requests").increment(1, {"method": method, "status": str(status)})
            self._obs.create_histogram("http.duration", unit="ms").record((time.perf_counter() - start) * 1000)
            span.end({"http.status_code": status})
        return status, "application/json", json.dumps(result).encode()

    async def dispose(self):
        try:
            if self.http:
                await asyncio.to_thread(self.http.shutdown)
                self.http.server_close()
                await asyncio.to_thread(self.thread.join)
                self.http = None
            for task in self.tasks: task.cancel()
            await asyncio.gather(*self.tasks, return_exceptions=True)
        finally:
            await self.save()
