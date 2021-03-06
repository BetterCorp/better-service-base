# Args
ARG BSB_VERSION=latest
ARG PLUGIN_VERSION=latest
ARG IMAGE_PLATFORM_TYPE=
ARG BUILD_PLATFORM=linux/amd64

# Image setup
FROM --platform=$BUILD_PLATFORM betterweb/service-base:${BSB_VERSION}${IMAGE_PLATFORM_TYPE}

# Core perms
ADD .npmrc .npmrc
RUN mv ./.npmrc ~/.npmrc
RUN echo "HOME: $(echo ~/)" 

# Add package (from local)
RUN mkdir /home/bsb-build
COPY *.tgz /home/bsb-build/
ADD .npmrc .npmrc
RUN mv ./.npmrc ~/.npmrc
RUN echo "HOME: $(echo ~/)" 

# Install plugin
RUN npm i "/home/bsb-build/$(ls /home/bsb-build/ | grep .tgz)"
RUN npm version ${PLUGIN_VERSION}

# Cleanup
RUN rm -rfv /home/bsb-build
RUN rm -fv ~/.npmrc