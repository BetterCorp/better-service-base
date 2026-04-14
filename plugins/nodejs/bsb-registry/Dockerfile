# BSB Registry plugin package image
# Builds @bsb/registry and packages it in BSB plugin-dir format:
#   /mnt/plugins/@bsb/registry/<major>/<minor>/<micro>/
#
# Build from repo root:
#   docker build -f plugins/nodejs/bsb-registry/Dockerfile -t betterweb/bsb-registry-plugin:1.0.1 .

FROM betterweb/node:24 AS builder

WORKDIR /workspace

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY docs/package.json ./docs/package.json
COPY nodejs ./nodejs
COPY plugins/nodejs/bsb-registry ./plugins/nodejs/bsb-registry
RUN npm ci --include=dev

RUN npm run tsc --workspace nodejs
RUN chmod +x /workspace/nodejs/lib/scripts/bsb-plugin-cli.js
RUN npm run build --workspace plugins/nodejs/bsb-registry

# Keep runtime package lean for plugin loading in BSB container.
RUN npm prune --omit=dev --workspace plugins/nodejs/bsb-registry

# Package output in BSB plugin-dir layout.
RUN set -eux; \
  VERSION="$(node -p "require('./plugins/nodejs/bsb-registry/package.json').version")"; \
  MAJOR="$(echo "${VERSION}" | cut -d. -f1)"; \
  MINOR="$(echo "${VERSION}" | cut -d. -f2)"; \
  MICRO="$(echo "${VERSION}" | cut -d. -f3)"; \
  PKG_ROOT="/out/@bsb/registry"; \
  VERSION_DIR="${PKG_ROOT}/${MAJOR}/${MINOR}/${MICRO}"; \
  mkdir -p "${VERSION_DIR}"; \
  cp -a plugins/nodejs/bsb-registry/package.json plugins/nodejs/bsb-registry/bsb-plugin.json plugins/nodejs/bsb-registry/lib plugins/nodejs/bsb-registry/node_modules "${VERSION_DIR}/";

FROM betterweb/service-base:latest

COPY --from=builder /out/ /mnt/plugins/
COPY plugins/nodejs/bsb-registry/BADGES.json /home/bsb/BADGES.json

ENV BSB_PLUGIN_DIR=/mnt/plugins
