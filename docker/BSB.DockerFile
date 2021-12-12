# Image setup
FROM betterweb/node:14-alpine-${IMAGE_PLATFORM_TYPE}
RUN apk update
RUN npm i -g typescript@4.3.5 ts-node@10.0.0
RUN mkdir /home/bsb
WORKDIR /home/bsb

# NPM repo defaults
RUN npm init -y

# Add core BSB lib (from local)
RUN mkdir /home/bsb-build
COPY *.tgz /home/bsb-build/

# Default plugins/setup
RUN npm i --save "/home/bsb-build/$(ls /home/bsb-build/ | grep .tgz)"
RUN npm i --save @bettercorp/service-base-plugin-config-1password
RUN npm i --save @bettercorp/service-base-plugin-events-rabbitmq
RUN npm i --save @bettercorp/service-base-plugin-events-pubnub
RUN npm i --save @bettercorp/service-base-plugin-log-gelf

RUN cat ./package.json

# Cleanup
RUN rm -rfv /home/bsb-build

CMD npm start