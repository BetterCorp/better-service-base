# BSB Documentation Site

This directory contains the documentation website for Better Service Base (BSB).

### What is BSB (in brief)
- BSB is an event-bus based microservice framework
- You install BSB to get types and tooling, but it typically runs as its own container that discovers and runs plugins
- Your services are packaged as plugins and exposed through typed event interfaces

---

## Quick Start (Docs Site)

- Install dependencies:
  ```bash
  cd docs
  npm install
  ```
- Run locally (with HMR):
  ```bash
  npm run dev
  # open http://localhost:3000
  ```
- Build static site:
  ```bash
  npm run build
  # or
  ./build.sh
  # Output: docs/dist/
  ```
- Preview the build:
  ```bash
  npm run preview
  ```

Note: The current distribution folder is `docs/dist/`. A future task is to move this to a root-level `docs-dist/` per the TODOs.

---

## Type Definitions (Node.js)

Type pages are generated from the Node.js implementation.

- Generate types (from `docs/`):
  ```bash
  npm run build-types:nodejs
  ```
  This runs `npm run docs` in `../nodejs` and copies the artifacts consumed by the site.

- Full build including types:
  ```bash
  npm run build
  ```

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
