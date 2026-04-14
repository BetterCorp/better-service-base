# BSB Documentation Site

This directory contains the documentation website for Better Service Base (BSB).

### What is BSB (in brief)
- BSB is an event-bus based microservice framework
- You install BSB to get types and tooling, but it typically runs as its own container that discovers and runs plugins
- Your services are packaged as plugins and exposed through typed event interfaces

---

## Quick Start (Docs Site)

- From repo root, install dependencies:
  ```bash
  npm install
  ```
- From repo root, run locally (with HMR):
  ```bash
  npm run dev --workspace docs
  # open http://localhost:3000
  ```
- From repo root, build static site:
  ```bash
  npm run build --workspace docs
  # or
  ./build.sh
  # Output: docs/dist/
  ```
- Preview the build:
  ```bash
  npm run preview --workspace docs
  ```

### Workspace Notes

- `docs/` is part of root npm workspace.
- Root `package-lock.json` is only lockfile for workspace packages.
- Do not run `npm install` or `npm ci` inside `docs/`.
- If `@bsb/base` version changes, sync workspace versions from repo root:
  ```bash
  npm run ws:sync-versions
  npm install
  ```

Note: The current distribution folder is `docs/dist/`. A future task is to move this to a root-level `docs-dist/` per the TODOs.

---

## Plugin Registry Redirect

Plugin marketplace content is no longer built inside `docs/`.

- `/registry/` is a redirect page to the external registry UI.
- Set `BSB_DOCS_REGISTRY_URL` to control the redirect target.
- Default target is `http://localhost:3200/plugins`.

---

## Type Definitions (Node.js)

Type pages are hosted separately at:

- `https://types.bsbcode.dev/nodejs/`

Generation and hosting are handled by the root-level `Dockerfile.types`.
The docs site does not build or bundle TypeDoc output anymore.

---

## Project Structure (Docs)

```
docs/
├─ build.sh                 # Convenience build script (wraps Vite + types)
├─ dist/                    # Build output (static site)
├─ node_modules/
├─ package.json             # Vite multi-page config via scripts
├─ src/                     # Source for the docs site
│  ├─ assets/               # Shared CSS/JS assets
│  ├─ get-started/          # Getting started page
│  ├─ index.html            # Landing page
│  ├─ languages/            # Language sections (e.g. Node.js)
│  └─ plugins/              # Plugin system overview
├─ TODO.md                  # Open tasks and design notes
└─ vite.config.js           # Vite multi-page build configuration
```

---

## How BSB Runs (Architecture Overview)

- **Container-first**: In production BSB runs as a container that discovers and loads plugins
- **Flexible deployment**: Run a single service, multiple services in the same container, independent microservices, or distribute across regions/edge
- **Event bus centric**: All inter-service communication is through a pluggable event bus

Common patterns:
- Single service per container
- Multiple services in one container (tightly coupled)
- Independent microservices scaled individually
- Distributed/edge deployments across regions

---

## Plugin Layout (Node.js)

During development you’ll commonly organize plugins like this; in production you’ll deliver prebuilt plugins for the container to load.

```
{src for dev | lib for prod}/plugins/
  {service|logging|metrics}-{name-kebab}/
    index.{ts for dev | js for prod}
```

Events interface example:

```ts
export interface Events extends BSBPluginEvents {
  emitEvents: {};
  onEvents: {};
  emitReturnableEvents: {};
  onReturnableEvents: {
    add(a: number, b: number): number;
  };
  emitBroadcast: {};
  onBroadcast: {};
}
```

Production delivery example (mounted plugin repo):

```
/mnt/plugins/
  @org/your-plugin/
    latest/
      package.json
      lib/plugins/service-your-plugin/index.js
    1.0.0/
      package.json
      lib/plugins/service-your-plugin/index.js
```

---

## Contributing to the Docs

- Keep examples accurate to the container-first model
- Prefer clear, minimal UI with full-width layout and neutral color scheme (`#333333` primary text)
- Follow the existing CSS variables and structure in `docs/src/assets/`
- When adding new pages, register them in `vite.config.js` if they are separate entry points

---

## License

This documentation is part of the BSB project and is licensed under the same terms (AGPL-3.0 or Commercial).
