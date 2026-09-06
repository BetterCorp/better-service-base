"""Bounded JSON requests shared by registry and Vault; credentials never follow redirects."""
import json
from urllib.error import HTTPError
from urllib.parse import urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


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
    data = None if body is None else json.dumps(body, allow_nan=False).encode("utf-8")
    request = Request(url, data=data, headers={"Accept": "application/json", "Content-Type": "application/json", **(headers or {})}, method=method)
    try:
        response = build_opener(NoRedirect()).open(request, timeout=timeout)
    except HTTPError as error:
        error.close()
        raise
    with response:
        payload = response.read(limit + 1)
        if len(payload) > limit:
            raise ValueError("HTTP response exceeds size limit")
        return json.loads(payload) if payload else {}
