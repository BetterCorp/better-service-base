"""Bounded JSON requests shared by registry and Vault; credentials never follow redirects."""
import http.client
import json
import math
import socket
import threading
import time
from urllib.error import HTTPError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPHandler, HTTPRedirectHandler, HTTPSHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class _Deadline:
    def __init__(self, timeout: float) -> None:
        self.expires = time.monotonic() + timeout
        self.socket = None
        self.expired = False
        self.lock = threading.Lock()

    def expire(self) -> None:
        with self.lock:
            self.expired = True
            sock = self.socket
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    def register_socket(self, sock) -> None:
        with self.lock:
            self.socket = sock
            expired = self.expired
        if expired:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    def set_socket_timeout(self, timeout: float) -> None:
        with self.lock:
            sock = self.socket
        if sock is not None:
            sock.settimeout(timeout)


class _DeadlineConnection:
    def __init__(self, *args, deadline: _Deadline, **kwargs) -> None:
        self._deadline = deadline
        super().__init__(*args, **kwargs)

    def connect(self) -> None:
        if time.monotonic() >= self._deadline.expires:
            raise TimeoutError("HTTP request timed out")
        super().connect()
        self._deadline.register_socket(self.sock)
        if self._deadline.expired:
            self.abort()
            raise TimeoutError("HTTP request timed out")

    def getresponse(self):
        response = super().getresponse()
        # urllib detaches the connection socket; retain the response-owned socket for body deadlines.
        self._deadline.register_socket(response.fp.raw._sock)
        return response

    def abort(self) -> None:
        sock = self.sock
        if sock is not None:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
        self.close()


class _HTTPConnection(_DeadlineConnection, http.client.HTTPConnection):
    pass


class _HTTPSConnection(_DeadlineConnection, http.client.HTTPSConnection):
    pass


class _DeadlineHTTPHandler(HTTPHandler):
    def __init__(self, deadline: _Deadline) -> None:
        super().__init__()
        self.deadline = deadline

    def http_open(self, request):
        return self.do_open(lambda host, **kwargs: _HTTPConnection(host, deadline=self.deadline, **kwargs), request)


class _DeadlineHTTPSHandler(HTTPSHandler):
    def __init__(self, deadline: _Deadline) -> None:
        super().__init__()
        self.deadline = deadline

    def https_open(self, request):
        return self.do_open(lambda host, **kwargs: _HTTPSConnection(host, deadline=self.deadline, **kwargs), request,
                            context=self._context)


def _read(response, limit: int, deadline: _Deadline) -> bytes:
    payload = bytearray()
    read = getattr(response, "read1", response.read)
    while len(payload) <= limit:
        remaining = deadline.expires - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("HTTP request timed out")
        deadline.set_socket_timeout(remaining)
        part = read(min(65536, limit + 1 - len(payload)))
        if time.monotonic() >= deadline.expires:
            raise TimeoutError("HTTP request timed out")
        if not part:
            return bytes(payload)
        payload.extend(part)
        if callable(getattr(response, "isclosed", None)) and response.isclosed():
            return bytes(payload)
    return bytes(payload)


def origin(url: str, *, allow_http: bool = False) -> str:
    parsed = urlsplit(url)
    if parsed.scheme != "https" and not (allow_http and parsed.scheme == "http"):
        raise ValueError("Endpoint requires HTTPS (explicitly enable insecure HTTP for local development)")
    if not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.fragment or parsed.query:
        raise ValueError("Invalid endpoint URL")
    port = parsed.port
    host = parsed.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    authority = host if port is None or (parsed.scheme, port) in (("http", 80), ("https", 443)) else f"{host}:{port}"
    return urlunsplit((parsed.scheme, authority, "", "", ""))


def json_request(method: str, url: str, *, body=None, headers=None, timeout: float = 5, limit: int = 4 * 1024 * 1024):
    if type(timeout) not in (int, float) or not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("HTTP timeout must be positive and finite")
    data = None if body is None else json.dumps(body, allow_nan=False).encode("utf-8")
    request = Request(url, data=data, headers={"Accept": "application/json", "Content-Type": "application/json", **(headers or {})}, method=method)
    deadline = _Deadline(timeout)
    timer = threading.Timer(timeout, deadline.expire)
    timer.daemon = True
    timer.start()
    try:
        try:
            response = build_opener(NoRedirect(), _DeadlineHTTPHandler(deadline), _DeadlineHTTPSHandler(deadline)).open(request, timeout=timeout)
        except HTTPError as error:
            try:
                payload = _read(error, min(limit, 65536), deadline)
                error.bsb_body = payload.decode("utf-8", errors="replace") if len(payload) <= min(limit, 65536) else ""
            except Exception:
                # A failed error-body read must not turn a 401/403 into a retryable network error.
                error.bsb_body = ""
            finally:
                error.close()
            raise
        with response:
            payload = _read(response, limit, deadline)
            if len(payload) > limit:
                raise ValueError("HTTP response exceeds size limit")
            return json.loads(payload) if payload else {}
    except Exception as error:
        if deadline.expired and not isinstance(error, HTTPError):
            raise TimeoutError("HTTP request timed out") from error
        raise
    finally:
        timer.cancel()
        timer.join()
