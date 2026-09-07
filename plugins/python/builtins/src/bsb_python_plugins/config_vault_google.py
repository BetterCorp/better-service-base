from google.auth.transport.requests import Request
from google.oauth2.id_token import fetch_id_token_credentials

from .config_vault import Plugin as VaultPlugin, SETTINGS
from bsb.schema import av, object_schema


class Config:
    metadata = {"name": "config-vault-google", "description": "Vault with Google application default identity", "category": "config"}
    validation_schema = object_schema({**SETTINGS, "googleAudience": av.string().min_length(1)})


class Plugin(VaultPlugin):
    _credentials = None

    def refresh_auth(self, status):
        return status in (401, 403)

    def headers(self, refresh=False, timeout=5):
        headers = super().headers(refresh, timeout)
        try:
            with Request().session as session:
                transport = Request(session=session)
                def request(*args, **kwargs):
                    kwargs["timeout"] = min(kwargs.get("timeout", timeout), timeout)
                    return transport(*args, **kwargs)
                if self._credentials is None or refresh:
                    self._credentials = fetch_id_token_credentials(self.config["googleAudience"], request=request)
                if refresh or not self._credentials.valid:
                    self._credentials.refresh(request)
                headers["X-Serverless-Authorization"] = "Bearer " + self._credentials.token
        except Exception as error:
            raise RuntimeError("Google ID token acquisition failed") from error
        return headers
