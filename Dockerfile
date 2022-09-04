FROM betterweb/node:latest
# RUN npm i -g typescript ts-node

VOLUME /mnt/bsb-plugins
RUN mkdir /home/bsb
WORKDIR /home/bsb

ENV NODE_ENV production
ENV BSB_LIVE true
ENV BSB_CONTAINER true
ENV BSB_PLUGIN_DIR /mnt/bsb-plugins

# NPM repo defaults
RUN npm init -y
RUN echo '{"deploymentProfiles":{"default":{}},"plugins":{}}' >> ./sec.config.json
# RUN pushd /mnt/bsb-plugins && npm init -y && pushd

# Add core BSB lib (from local)
RUN mkdir /home/bsb-build
COPY *.tgz /home/bsb-build/
COPY entrypoint.sh /root/entrypoint.sh
COPY entrypoint.js /root/entrypoint.js
RUN chmod 550 /root/entrypoint.sh

# Default plugins/setup
RUN ls -la /home/bsb-build/
RUN pnpm add "/home/bsb-build/$(ls /home/bsb-build/ | grep .tgz | head -1)"
# RUN pnpm i --prod --fix-lockfile "/home/bsb-build/$(ls /home/bsb-build/ | grep .tgz | head -1)"
RUN node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)

RUN cat ./package.json

# Cleanup
RUN rm -rfv /home/bsb-build

RUN chown -R root:node /home/bsb
RUN chmod -R 650 /home/bsb
RUN chown node:node /home/bsb/sec.config.json

ENTRYPOINT [ "/root/entrypoint.sh" ]
CMD npm start