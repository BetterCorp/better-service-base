# Install clients from a hosted service

`bsb client install https://service.example.com` downloads a public BSB contract and generates a client in the caller's language. It does not install executable plugins or add an HTTP transport: generated calls still use the application's configured BSB events transport.

Publish a JSON document at `/.well-known/bsb` on the service origin:

```json
{
  "bsb": 1,
  "plugins": [{
    "id": "acme/service-reports",
    "language": "nodejs",
    "version": "1.2.3",
    "schema": "/contracts/reports.json"
  }]
}
```

`schema` may instead contain the full portable BSB event-schema document inline. It must include an `events` object, with complete AnyVali documents. Its `pluginId` (or legacy `pluginName`) is the wire target; if omitted, the unqualified entry name is used. It must be a valid unqualified plugin identifier. If the contract contains a `version`, it must match the discovery entry; otherwise the installer stamps the selected version. Publishing this endpoint is an explicit choice by the hosted service; BSB does not start an HTTP listener automatically.

The installer selects the sole matching entry. Use `--plugin acme/service-reports` when multiple plugins are hosted, and `--source-language` / `--version` to select an exact implementation. Ambiguous or absent matches fail before saved schemas change. IDs use the existing `name` or `org/name` rules; versions must be exact semantic versions, including optional prerelease/build suffixes. Discovery allows at most 128 entries and rejects duplicate ID/language/version identities.

Use an HTTPS origin without credentials, paths, query strings or fragments. `--allow-insecure` permits HTTP for local development. Schema links resolve relative to `/.well-known/bsb` and must remain on the same origin; credentials and fragments are rejected. Redirects are rejected, requests time out after 10 seconds and each JSON response is limited to 4 MiB. Registry/Vault tokens are never sent to hosted origins. This initial discovery format is public; it does not infer service credentials.

Snapshots retain the complete contract and `source: {url, org, name, language, version}`. The local name is `hosted~<first 16 lowercase SHA-256 hex characters of the canonical origin>~<org>~<name>~<language>`; unqualified entries use org `_`. The hash identifies a public origin, not a secret. Canonical origins lowercase the host, omit default ports and have no trailing slash. Reinstalling the URL refreshes its snapshot; normal client sync/generate remains offline. Existing normalized-name collision checks apply.

Node hosted imports use the same schema-safety gate as Registry and Vault: at most 10,000 nodes and 64 nesting levels, no prototype-related keys, and patterns limited to 1,024 characters and checked by `safe-regex2`. Rejected documents do not replace an installed snapshot.

All five client installers validate discovery versions and `--version` against [SemVer 2.0.0](https://semver.org/): no leading zeroes in core numbers or numeric prerelease identifiers, no empty suffix identifiers, and no surrounding whitespace. Build identifiers may contain leading zeroes (`1.2.3+001` is valid). Their tests share `tests/fixtures/semver-versions.json` to keep acceptance consistent.
