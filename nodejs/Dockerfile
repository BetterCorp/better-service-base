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

# BSB Build
# Using 18 until nodejs fixes a bug with v20 - https://github.com/nodejs/docker-node/issues/1829
FROM node:18 as builder

ARG BSB_VERSION=0.0.0

RUN set -eux && mkdir /home/bsb && npm i -g typescript ts-node

WORKDIR /home/bsb

ADD tsconfig-release.json /home/bsb/tsconfig-release.json
ADD package.json /home/bsb/package.json
ADD package-lock.json /home/bsb/package-lock.json
ADD src/ /home/bsb/src/
RUN npm ci && npm version $BSB_VERSION --allow-same-version --no-git-tag-version && npm run build-release

# Final image
FROM node:18

VOLUME /mnt/plugins
VOLUME /mnt/temp
RUN groupadd -r bsb & useradd -r -g bsb bsb
WORKDIR /home/bsb

ENV NODE_ENV production
ENV BSB_LIVE true
ENV BSB_CONTAINER true
ENV BSB_PLUGIN_DIR /mnt/plugins

COPY entrypoint.sh /home/bsb/entrypoint.sh
COPY LICENSE /home/bsb/LICENSE

COPY --from=builder /home/bsb/package.json /home/bsb/package.json
COPY --from=builder /home/bsb/package-lock.json /home/bsb/package-lock.json
COPY --from=builder /home/bsb/lib /home/bsb/lib
COPY --from=builder /home/bsb/node_modules /home/bsb/node_modules

RUN addgroup node dialout && chown -R bsb:bsb /home/bsb && chown -R bsb:bsb /mnt/temp && chown -R bsb:bsb /mnt/plugins && chmod -R 440 /home/bsb && chmod 111 /home/bsb/entrypoint.sh

ENTRYPOINT [ "/home/bsb/entrypoint.sh" ]
CMD -