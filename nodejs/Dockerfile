# BSB Build
FROM betterweb/node:20 as builder

RUN set -eux && mkdir /home/bsb && npm i -g typescript ts-node

WORKDIR /home/bsb

ADD tsconfig-release.json /home/bsb/tsconfig-release.json
ADD package.json /home/bsb/package.json
ADD package-lock.json /home/bsb/package-lock.json
ADD src/ /home/bsb/src/
RUN npm ci
RUN npm run build-release

# Final image
FROM betterweb/node:20

COPY --from=builder /home/bsb/lib /home/bsb/lib
COPY --from=builder /home/bsb/node_modules /home/bsb/node_modules

VOLUME /mnt/bsb-plugins
WORKDIR /home/bsb

ENV NODE_ENV production
ENV BSB_LIVE true
ENV BSB_CONTAINER true
ENV BSB_PLUGIN_DIR /mnt/bsb-plugins

ADD package.json /home/bsb/package.json
ADD package-lock.json /home/bsb/package-lock.json
ADD lib/ /home/bsb/lib/

COPY entrypoint.sh /root/entrypoint.sh

RUN addgroup node dialout && touch /home/bsb/sec-config.yaml && chown -R root:node /home/bsb && chmod -R 650 /home/bsb && chown node:node /home/bsb/sec-config.yaml && chmod +x /root/entrypoint.sh && npm ci

ENTRYPOINT [ "/root/entrypoint.sh" ]
CMD node lib/cli.js