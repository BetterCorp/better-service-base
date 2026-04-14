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

# Stage 1: Build TypeScript
FROM betterweb/node:24 AS builder

ARG BSB_VERSION=0.0.0

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
RUN rm -rf /home/bsb/lib/plugins/service-*

# Stage 2: Install production dependencies
FROM betterweb/node:24 AS dependencies

WORKDIR /home/bsb

COPY --from=builder /home/bsb/package.json /home/bsb/package.json
COPY --from=builder /home/bsb/package-lock.json /home/bsb/package-lock.json

# Install only production dependencies
RUN npm install --production

# Stage 3: Final image
FROM betterweb/node:24

RUN mkdir -p /mnt /mnt/plugins /mnt/temp /home/bsb

VOLUME /mnt/plugins
VOLUME /mnt/temp
WORKDIR /home/bsb

ENV NODE_ENV=production
ENV BSB_LIVE=true
ENV BSB_CONTAINER=true
ENV BSB_PLUGIN_DIR=/mnt/plugins

COPY nodejs/entrypoint.sh /home/bsb/entrypoint.sh
COPY nodejs/entrypoint.js /home/bsb/entrypoint.js
COPY nodejs/LICENSE /home/bsb/LICENSE

# Copy compiled TypeScript from builder
COPY --from=builder /home/bsb/lib /home/bsb/lib
COPY --from=builder /home/bsb/package.json /home/bsb/package.json
COPY --from=builder /home/bsb/package-lock.json /home/bsb/package-lock.json

# Copy production node_modules from dependencies stage
COPY --from=dependencies /home/bsb/node_modules /home/bsb/node_modules

RUN chown -R node:node /home/bsb \
    && chown -R node:node /mnt/temp \
    && chown -R node:node /mnt/plugins \
    && find /home/bsb -type d -exec chmod 550 {} \; \
    && find /home/bsb -type f -exec chmod 440 {} \; \
    && chmod 550 /home/bsb/entrypoint.sh

ENTRYPOINT [ "/home/bsb/entrypoint.sh" ]
CMD -
