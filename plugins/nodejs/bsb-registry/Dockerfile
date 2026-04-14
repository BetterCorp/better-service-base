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
COPY docs ./docs
COPY nodejs ./nodejs
COPY plugins ./plugins
RUN npm ci --include=dev

RUN npm run tsc --workspace nodejs
RUN npm run build --workspace plugins/nodejs/bsb-registry

# Keep runtime package lean for plugin loading in BSB container.
RUN npm prune --omit=dev --workspace plugins/nodejs/bsb-registry

WORKDIR /workspace/plugins/nodejs/bsb-registry

# Package output in BSB plugin-dir layout.
RUN set -eux; \
  VERSION="$(npm pkg get version | tr -d '\"')"; \
  MAJOR="$(echo "${VERSION}" | cut -d. -f1)"; \
  MINOR="$(echo "${VERSION}" | cut -d. -f2)"; \
  MICRO="$(echo "${VERSION}" | cut -d. -f3)"; \
  PKG_ROOT="/out/@bsb/registry"; \
  VERSION_DIR="${PKG_ROOT}/${MAJOR}/${MINOR}/${MICRO}"; \
  mkdir -p "${VERSION_DIR}"; \
  cp -a package.json bsb-plugin.json lib node_modules "${VERSION_DIR}/"; \
  mkdir -p "${VERSION_DIR}/node_modules/@bsb"; \
  rm -rf "${VERSION_DIR}/node_modules/@bsb/base"; \
  ln -s /home/bsb "${VERSION_DIR}/node_modules/@bsb/base"

FROM betterweb/service-base:latest

COPY --from=builder /out/ /mnt/plugins/
COPY plugins/nodejs/bsb-registry/BADGES.json /mnt/plugins/@bsb/registry/BADGES.json

ENV BSB_PLUGIN_DIR=/mnt/plugins
