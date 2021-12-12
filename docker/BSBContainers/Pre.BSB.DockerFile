
# Args
ARG BSB_VERSION=latest
ARG PLUGIN_VERSION=latest
ARG IMAGE_PLATFORM_TYPE=

# Image setup
FROM --platform=$BUILDPLATFORM betterweb/service-base:${BSB_VERSION}${IMAGE_PLATFORM_TYPE}

# Add package (from local)
RUN mkdir /home/bsb-build
COPY *.tgz /home/bsb-build/
ADD .npmrc .npmrc
RUN mv ./.npmrc ~/.npmrc
RUN echo "HOME: $(echo ~/)" 
