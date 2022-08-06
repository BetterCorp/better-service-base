FROM betterweb/node:latest
# RUN npm i -g typescript ts-node
RUN mkdir /home/bsb
WORKDIR /home/bsb

ENV NODE_ENV production
ENV BSB_LIVE true

# NPM repo defaults
RUN npm init -y

# Add core BSB lib (from local)
RUN mkdir /home/bsb-build
COPY *.tgz /home/bsb-build/

# Default plugins/setup
RUN npm i --save --omit=dev --no-optional --production "/home/bsb-build/$(ls /home/bsb-build/ | grep .tgz)"
RUN node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)

RUN cat ./package.json

# Cleanup
RUN rm -rfv /home/bsb-build

CMD npm start