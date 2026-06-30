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

RUN set -eux && mkdir /home/bsb && npm i -g typescript ts-node

WORKDIR /home/bsb

ADD nodejs/package.json /home/bsb/package.json
ADD nodejs/tsconfig.json /home/bsb/tsconfig.json
ADD nodejs/tsconfig-release.json /home/bsb/tsconfig-release.json
ADD package-lock.json /home/bsb/package-lock.json
ADD nodejs/src/ /home/bsb/src/

# Install all dependencies (including devDependencies)
RUN npm install
RUN npm version $BSB_VERSION --allow-same-version --no-git-tag-version
RUN npm run build-release
RUN mkdir -p /tmp/bsb-pack && npm pack --pack-destination /tmp/bsb-pack

# Stage 2: Install production dependencies
FROM ${NODE_BASE_IMAGE} AS dependencies

ARG BSB_BUNDLED_PLUGINS=
ENV NPM_CONFIG_AUDIT=false
ENV NPM_CONFIG_FUND=false
ENV NPM_CONFIG_PROGRESS=false
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_YES=true

WORKDIR /home/bsb

COPY --from=builder /tmp/bsb-pack/*.tgz /tmp/bsb-base.tgz

# Install BSB as a normal package so plugins resolve through @bsb/* packages.
RUN printf '{"type":"module","private":true,"scripts":{"start":"node node_modules/@bsb/base/lib/cli.js","debug":"BSB_DEBUG=true node node_modules/@bsb/base/lib/cli.js","plugins":"node node_modules/@bsb/base/lib/scripts/list-plugin-search-paths.js"}}\n' > /home/bsb/package.json
RUN npm install --omit=dev /tmp/bsb-base.tgz
RUN if [ -n "$BSB_BUNDLED_PLUGINS" ]; then echo "Installing bundled BSB plugins: $BSB_BUNDLED_PLUGINS"; npm install --omit=dev $BSB_BUNDLED_PLUGINS; fi

# Stage 3: Final image
FROM ${NODE_BASE_IMAGE}

RUN mkdir -p /mnt /mnt/plugins /mnt/temp /home/bsb

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
COPY nodejs/LICENSE /home/bsb/LICENSE

COPY --from=dependencies /home/bsb/package.json /home/bsb/package.json
COPY --from=dependencies /home/bsb/package-lock.json /home/bsb/package-lock.json
COPY --from=dependencies /home/bsb/node_modules /home/bsb/node_modules

RUN chown -R node:node /home/bsb \
    && chown -R node:node /mnt/temp \
    && chown -R node:node /mnt/plugins \
    && find /home/bsb -type d -exec chmod 550 {} \; \
    && find /home/bsb -type f -exec chmod 440 {} \; \
    && chmod 550 /home/bsb/entrypoint.sh

ENTRYPOINT [ "/home/bsb/entrypoint.sh" ]
CMD -
