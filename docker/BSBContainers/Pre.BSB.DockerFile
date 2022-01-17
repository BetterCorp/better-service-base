
# Args
ARG BSB_VERSION=latest
ARG PLUGIN_VERSION=latest
ARG IMAGE_PLATFORM_TYPE=
ARG BUILD_PLATFORM=linux/amd64

# Image setup
FROM --platform=$BUILD_PLATFORM betterweb/service-base:${BSB_VERSION}${IMAGE_PLATFORM_TYPE}

# Some generic build tools .... node-gyp/bcrypt
RUN apk --no-cache add --virtual builds-deps build-base python3 make

# Add package (from local)
RUN mkdir /home/bsb-build
COPY *.tgz /home/bsb-build/
ADD .npmrc .npmrc
RUN mv ./.npmrc ~/.npmrc
RUN echo "HOME: $(echo ~/)" 

