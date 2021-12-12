
# cleanup build tools
RUN apk del builds-deps

# Permissions
RUN chown -R node:node /home/bsb
USER node
