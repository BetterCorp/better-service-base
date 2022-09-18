
# Install plugin
ARG NPM2_TOKEN=
RUN npm i "/home/bsb-build/$(ls /home/bsb-build/ | grep .tgz)"
RUN npm version ${PLUGIN_VERSION}

# Cleanup
RUN rm -rfv /home/bsb-build
RUN rm -fv ~/.npmrc
