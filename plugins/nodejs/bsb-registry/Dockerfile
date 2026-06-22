# BSB Registry plugin package image
# Builds @bsb/registry and packages it in BSB plugin-dir format:
#   /mnt/plugins/@bsb/registry/<major>/<minor>/<micro>/
#
# Build from repo root:
#   docker build -f plugins/nodejs/bsb-registry/Dockerfile -t betterweb/bsb-registry-plugin:1.0.1 .
#
# By default this builds against the published latest Node.js BSB runtime image.
# Override for pinned builds:
#   docker build -f plugins/nodejs/bsb-registry/Dockerfile --build-arg BSB_IMAGE_TAG=node-9.5.1 .

ARG BSB_IMAGE_TAG=node-latest

FROM betterweb/service-base:${BSB_IMAGE_TAG} AS builder

WORKDIR /workspace
ENV PATH="/home/bsb/lib/scripts:${PATH}"

COPY plugins/nodejs/bsb-registry ./

RUN npm install --include=dev
RUN npm run build

# Package output in BSB plugin-dir layout.
RUN set -eux; \
  VERSION="$(node -p "require('./package.json').version")"; \
  MAJOR="$(echo "${VERSION}" | cut -d. -f1)"; \
  MINOR="$(echo "${VERSION}" | cut -d. -f2)"; \
  MICRO="$(echo "${VERSION}" | cut -d. -f3)"; \
  PKG_ROOT="/out/@bsb/registry"; \
  VERSION_DIR="${PKG_ROOT}/${MAJOR}/${MINOR}/${MICRO}"; \
  mkdir -p "${VERSION_DIR}"; \
  cp -a package.json bsb-plugin.json lib node_modules "${VERSION_DIR}/";

FROM betterweb/service-base:${BSB_IMAGE_TAG} AS buildermodules

WORKDIR /workspace
ENV PATH="/home/bsb/lib/scripts:${PATH}"

COPY plugins/nodejs/bsb-registry ./

RUN npm install --omit=dev

# Package output in BSB plugin-dir layout.
RUN set -eux; \
  VERSION="$(node -p "require('./package.json').version")"; \
  MAJOR="$(echo "${VERSION}" | cut -d. -f1)"; \
  MINOR="$(echo "${VERSION}" | cut -d. -f2)"; \
  MICRO="$(echo "${VERSION}" | cut -d. -f3)"; \
  PKG_ROOT="/out/@bsb/registry"; \
  VERSION_DIR="${PKG_ROOT}/${MAJOR}/${MINOR}/${MICRO}"; \
  mkdir -p "${VERSION_DIR}"; \
  cp -a node_modules "${VERSION_DIR}/";

FROM betterweb/service-base:${BSB_IMAGE_TAG}

COPY --from=builder /out/ /mnt/plugins/
COPY --from=buildermodules /out/ /mnt/plugins/
COPY plugins/nodejs/bsb-registry/BADGES.json /home/bsb/BADGES.json

ENV BSB_PLUGIN_DIRS=/mnt/plugins
