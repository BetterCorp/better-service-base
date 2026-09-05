# BSB (Better-Service-Base) is an event-bus based microservice framework.  
# Copyright (C) 2024 BetterCorp (PTY) Ltd  

# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

# Alternatively, you may obtain a commercial license for this program. 
# The commercial license allows you to use the Program in a closed-source manner, 
# including the right to create derivative works that are not subject to the terms 
# of the AGPL. 

# To obtain a commercial license, please contact the copyright holders at 
# https://www.bettercorp.dev. The terms and conditions of the commercial license 
# will be provided upon request.

# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.

# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

ARG NODE_BASE_IMAGE=betterweb/node:26

# Stage 1: Build TypeScript
FROM ${NODE_BASE_IMAGE} AS builder

ARG BSB_VERSION=0.0.0
ARG BSB_BUNDLED_PLUGINS=
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_PROGRESS=false
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_YES=true

WORKDIR /build

# Keep workspace manifests at their lockfile paths. Installing the root lockfile
# beside nodejs/package.json changes the dependency graph.
COPY package.json package-lock.json ./
COPY nodejs/ ./nodejs/
COPY plugins/nodejs/ ./plugins/nodejs/
COPY docs/package.json ./docs/package.json
COPY tests/nodejs/package.json ./tests/nodejs/package.json
RUN npm ci --workspace nodejs --include-workspace-root=false

WORKDIR /build/nodejs
RUN npm version $BSB_VERSION --allow-same-version --no-git-tag-version --workspaces=false
RUN npm run build-release
RUN mkdir -p /tmp/bsb-pack && npm pack --pack-destination /tmp/bsb-pack

# Stage 2: Install the production graph from the same workspace lockfile.
FROM ${NODE_BASE_IMAGE} AS dependencies

ARG BSB_VERSION=0.0.0
ARG BSB_BUNDLED_PLUGINS=
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_PROGRESS=false
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_YES=true

WORKDIR /build
COPY package.json package-lock.json ./
COPY nodejs/package.json ./nodejs/package.json
COPY --from=builder /build/plugins/nodejs/ ./plugins/nodejs/
COPY docs/package.json ./docs/package.json
COPY tests/nodejs/package.json ./tests/nodejs/package.json
COPY --from=builder /tmp/bsb-pack/*.tgz /tmp/bsb-base.tgz
RUN npm ci --omit=dev --workspace nodejs --include-workspace-root=false
# Replace the build workspace link with the package BSB actually runs.
RUN rm node_modules/@bsb/base && mkdir node_modules/@bsb/base \
    && tar -xzf /tmp/bsb-base.tgz -C node_modules/@bsb/base --strip-components=1
RUN mkdir -p /home/bsb && mv node_modules /home/bsb/node_modules
WORKDIR /home/bsb
RUN printf '{"type":"module","private":true,"scripts":{"start":"node node_modules/@bsb/base/lib/cli.js","debug":"BSB_DEBUG=true node node_modules/@bsb/base/lib/cli.js","plugins":"node node_modules/@bsb/base/lib/scripts/list-plugin-search-paths.js"}}\n' > package.json
RUN npm pkg set "dependencies.@bsb/base=${BSB_VERSION}"
# Explicit extra packages remain an opt-in extension of the locked base image.
RUN if [ -n "$BSB_BUNDLED_PLUGINS" ]; then npm install --omit=dev --save-exact $BSB_BUNDLED_PLUGINS; fi
RUN rm -f package-lock.json

# Stage 3: Final image
FROM ${NODE_BASE_IMAGE}

RUN mkdir -p /mnt /mnt/plugins /mnt/temp /home/bsb/.bsb

VOLUME /mnt/plugins
VOLUME /mnt/temp
WORKDIR /home/bsb

ENV NODE_ENV=production
ENV BSB_LIVE=true
ENV BSB_CONTAINER=true
ENV BSB_PLUGIN_DIRS=/mnt/plugins
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_PROGRESS=false
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_YES=true

COPY nodejs/entrypoint.sh /home/bsb/entrypoint.sh
COPY nodejs/entrypoint.js /home/bsb/entrypoint.js
COPY nodejs/plugin-watcher.js /home/bsb/plugin-watcher.js
COPY nodejs/LICENSE /home/bsb/LICENSE

COPY --from=dependencies /home/bsb/package.json /home/bsb/package.json
COPY --from=dependencies /home/bsb/node_modules /home/bsb/node_modules

RUN chown -R node:node /home/bsb \
    && chown -R node:node /mnt/temp \
    && chown -R node:node /mnt/plugins \
    && find /home/bsb -type d -exec chmod 550 {} + \
    && find /home/bsb -type f -exec chmod 440 {} + \
    && chmod 770 /home/bsb/.bsb \
    && chmod 550 /home/bsb/entrypoint.sh

ENTRYPOINT [ "/home/bsb/entrypoint.sh" ]
CMD -
