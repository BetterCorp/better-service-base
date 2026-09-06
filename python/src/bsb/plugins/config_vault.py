import asyncio
import base64
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import ssl
import tempfile
import time
from urllib.error import HTTPError, URLError

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from ..config_common import JsonConfig, merge
from ..http import json_request, origin
from ..schema import av, object_schema


SETTINGS = {
    "vaultUrl": av.string().min_length(1), "apiKeyId": av.string().min_length(1),
    "apiSecret": av.string().min_length(1).describe("Vault runtime secret", sensitive=True),
    "timeoutMs": av.int32().min(1000).default(5000),
    "staleAllowedHours": av.int32().min(0).default(24),
    "allowInsecureHttp": av.bool_().default(False),
    "cacheDir": av.optional(av.string().min_length(1)),
    "googleAudience": av.optional(av.string().min_length(1)),
    "BSB_CONFIG_OVERRIDES": av.optional(av.string().max_length(128 * 1024)),
}


class Config:
    metadata = {"name": "config-vault", "description": "Vault configuration with encrypted transient-failure cache", "category": "config"}
    validation_schema = object_schema(SETTINGS)


class RetryableVaultError(RuntimeError):
    pass


def apply_overrides(document: dict, profile: str, raw: str | None) -> None:
    if not raw:
        return
    if len(raw) > 128 * 1024:
        raise ValueError("BSB_CONFIG_OVERRIDES exceeds size limit")
    overrides = json.loads(raw)
    nodes = 0
    def safe(value, depth=0):
        nonlocal nodes
        nodes += 1
        if nodes > 10000 or depth > 64:
            raise ValueError("Overrides exceed complexity limit")
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ("__proto__", "prototype", "constructor"):
                    raise ValueError("Forbidden override key")
                safe(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                safe(child, depth + 1)
    safe(overrides)
    if not isinstance(overrides, dict):
        raise ValueError("Overrides must be an object")
    for section, plugins in overrides.items():
        if section not in ("services", "events", "observable") or not isinstance(plugins, dict):
            raise ValueError("Invalid override section")
        for name, patch in plugins.items():
            definition = document.get(profile, {}).get(section, {}).get(name)
            if not isinstance(definition, dict) or not isinstance(patch, dict):
                raise ValueError(f"Unknown override plugin: {name}")
            paths = definition.get("envOverridePaths")
            if not isinstance(paths, list) or not all(isinstance(path, str) for path in paths):
                raise ValueError(f"Environment overrides are not permitted: {name}")
            def validate(value, prefix=""):
                for key, child in value.items():
                    path = f"{prefix}.{key}" if prefix else key
                    if path in paths:
                        continue
                    if isinstance(child, dict) and child:
                        validate(child, path)
                    else:
                        raise ValueError(f"Override path is not permitted: {name}.{path}")
            validate(patch)
            definition["config"] = merge(definition.get("config") or {}, patch)


class Plugin(JsonConfig):
    retry_budget = 15.0

    async def init(self, trace):
        self.endpoint = origin(self.config["vaultUrl"], allow_http=self.config["allowInsecureHttp"])
        try:
            response = await asyncio.to_thread(self.fetch)
        except RetryableVaultError:
            if not self.config["staleAllowedHours"]:
                raise
            response = await asyncio.to_thread(self.read_cache)
            self.apply_response(response)
            trace.warn("Vault unavailable; using encrypted cached configuration", {"version": response["version"]})
        else:
            self.apply_response(response)
            try:
                await asyncio.to_thread(self.write_cache, response)
            except OSError:
                trace.warn("Vault loaded but encrypted cache could not be written")

    def headers(self, refresh=False, timeout=5):
        return {"x-vault-key-id": self.config["apiKeyId"], "x-vault-secret": self.config["apiSecret"]}

    def refresh_auth(self, status):
        return False

    def fetch(self):
        deadline = time.monotonic() + self.retry_budget
        while time.monotonic() < deadline:
            for attempt in range(2):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                timeout = min(self.config["timeoutMs"] / 1000, remaining)
                # Credential failures are fatal; never hide them behind stale configuration.
                headers = self.headers(attempt > 0, timeout)
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    return json_request("GET", self.endpoint + "/runtime/config", headers=headers, timeout=min(timeout, remaining))
                except HTTPError as error:
                    if attempt == 0 and self.refresh_auth(error.code):
                        continue
                    if error.code not in (429, 502, 503, 504):
                        raise RuntimeError(f"Vault refused configuration: HTTP {error.code}") from error
                except URLError as error:
                    if isinstance(error.reason, ssl.SSLError):
                        raise RuntimeError("Vault TLS validation failed") from error
                except (TimeoutError, ConnectionError):
                    pass
                break
            time.sleep(max(0, min(.25, deadline - time.monotonic())))
        raise RetryableVaultError("Vault unavailable after retry budget")

    def apply_response(self, response):
        if not isinstance(response, dict) or response.get("language") != "python":
            raise ValueError("Vault deployment language must be python")
        for key in ("profile", "application", "group"):
            if not isinstance(response.get(key), str) or not 0 < len(response[key]) <= 100:
                raise ValueError(f"Invalid Vault {key}")
        if type(response.get("version")) is not int or response["version"] < 1 or not isinstance(response.get("config"), dict):
            raise ValueError("Invalid Vault version or configuration")
        config = deepcopy(response["config"])
        apply_overrides(config, response["profile"], self.config.get("BSB_CONFIG_OVERRIDES"))
        self.load(config, response["profile"])
        if not self._enabled("services"):
            raise ValueError("At least one enabled service is required")

    def binding(self):
        return f"{self.endpoint}\n{self.config['apiKeyId']}\npython".encode()

    def cache_key(self):
        return HKDF(algorithm=hashes.SHA256(), length=32, salt=self.binding(), info=b"BSB config-vault cache v1").derive(self.config["apiSecret"].encode())

    def cache_file(self):
        directory = Path(self.config.get("cacheDir") or Path(self.cwd) / ".bsb" / "config-vault")
        return directory / (hashlib.sha256(self.binding()).hexdigest() + ".python.json")

    def write_cache(self, response):
        plaintext = json.dumps({"fetchedAt": datetime.now(timezone.utc).isoformat(), "response": response}).encode()
        iv = os.urandom(12)
        encrypted = AESGCM(self.cache_key()).encrypt(iv, plaintext, self.binding())
        payload = {key: base64.b64encode(value).decode() for key, value in {"iv": iv, "tag": encrypted[-16:], "data": encrypted[:-16]}.items()}
        file = self.cache_file()
        file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=file.parent, delete=False) as stream:
                temporary = stream.name
                json.dump(payload, stream)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, file)
        finally:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)

    def read_cache(self):
        with self.cache_file().open("rb") as stream:
            payload = stream.read(6 * 1024 * 1024 + 1)
        if len(payload) > 6 * 1024 * 1024:
            raise ValueError("Vault cache exceeds size limit")
        encrypted = {key: base64.b64decode(value, validate=True) for key, value in json.loads(payload).items()}
        plaintext = AESGCM(self.cache_key()).decrypt(encrypted["iv"], encrypted["data"] + encrypted["tag"], self.binding())
        decoded = json.loads(plaintext)
        fetched = datetime.fromisoformat(decoded["fetchedAt"])
        age = (datetime.now(timezone.utc) - fetched).total_seconds()
        if not 0 <= age <= self.config["staleAllowedHours"] * 3600:
            raise ValueError("Vault cache expired")
        return decoded["response"]
