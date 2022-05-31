# Args
ARG IMAGE_PLATFORM_TYPE=
ARG BUILD_PLATFORM=linux/amd64

# Image setup
FROM --platform=$BUILD_PLATFORM betterweb/node:16-alpine${IMAGE_PLATFORM_TYPE}
RUN apk update
RUN npm i -g typescript@4.6.2 ts-node@10.7.0
RUN mkdir /home/bsb
WORKDIR /home/bsb

# NPM repo defaults
RUN npm init -y

# Add core BSB lib (from local)
RUN mkdir /home/bsb-build
COPY *.tgz /home/bsb-build/

# Default plugins/setup
RUN npm i --save "/home/bsb-build/$(ls /home/bsb-build/ | grep .tgz)"
RUN node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)

RUN cat ./package.json

# Cleanup
RUN rm -rfv /home/bsb-build

CMD npm start