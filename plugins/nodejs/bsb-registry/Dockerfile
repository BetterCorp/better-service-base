# BSB Registry plugin package image
# Builds @bsb/registry and packages it in BSB plugin-dir format:
#   /mnt/plugins/@bsb/registry/<major>/<minor>/<micro>/
#
# Build from repo root:
#   docker build -f plugins/nodejs/bsb-registry/Dockerfile -t betterweb/bsb-registry-plugin:1.0.1 .

FROM betterweb/node:24 AS builder

WORKDIR /workspace

COPY plugins/nodejs/bsb-registry ./
COPY package-lock.json ./package-lock.json
RUN npm ci --include=dev

RUN npm run build

# Keep runtime package lean for plugin loading in BSB container.
RUN npm prune --omit=dev

# Package output in BSB plugin-dir layout.
RUN set -eux; \
  VERSION="$(npm pkg get version | tr -d '\"')"; \
  MAJOR="$(echo "${VERSION}" | cut -d. -f1)"; \
  MINOR="$(echo "${VERSION}" | cut -d. -f2)"; \
  MICRO="$(echo "${VERSION}" | cut -d. -f3)"; \
  PKG_ROOT="/out/@bsb/registry"; \
  VERSION_DIR="${PKG_ROOT}/${MAJOR}/${MINOR}/${MICRO}"; \
  mkdir -p "${VERSION_DIR}"; \
  cp -a package.json package-lock.json bsb-plugin.json lib node_modules "${VERSION_DIR}/";

FROM betterweb/service-base:latest

COPY --from=builder /out/ /mnt/plugins/
COPY plugins/nodejs/bsb-registry/BADGES.json /mnt/plugins/@bsb/registry/BADGES.json

ENV BSB_PLUGIN_DIR=/mnt/plugins
