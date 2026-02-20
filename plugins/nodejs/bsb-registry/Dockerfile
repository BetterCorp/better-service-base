# BSB Registry plugin package image
# Builds @bsb/registry and packages it in BSB plugin-dir format:
#   /mnt/plugins/@bsb/registry/<version>/
#   /mnt/plugins/@bsb/registry/latest/
#
# Build from repo root:
#   docker build -f plugins/nodejs/bsb-registry/Dockerfile -t betterweb/bsb-registry-plugin:1.0.1 .

FROM betterweb/node:23 AS builder

WORKDIR /workspace/plugins/nodejs/bsb-registry

COPY plugins/nodejs/bsb-registry/package*.json ./
RUN npm ci

COPY plugins/nodejs/bsb-registry/ ./
RUN npm run build

# Keep runtime package lean for plugin loading in BSB container.
RUN npm prune --omit=dev

# Package output in BSB plugin-dir layout.
RUN set -eux; \
  VERSION="$(node -p "require('./package.json').version")"; \
  PKG_ROOT="/out/@bsb/registry"; \
  mkdir -p "${PKG_ROOT}/${VERSION}" "${PKG_ROOT}/latest"; \
  cp -a package.json package-lock.json bsb-plugin.json README.md docs lib node_modules "${PKG_ROOT}/${VERSION}/"; \
  cp -a "${PKG_ROOT}/${VERSION}/." "${PKG_ROOT}/latest/"

FROM betterweb/service-base:9

WORKDIR /mnt/plugins

COPY --from=builder /out/ /plugins/

ENV BSB_PLUGIN_DIR=/plugins
