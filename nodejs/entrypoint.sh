#!/bin/sh

# if [ "$BSB_CONTAINER" == "true" ]; then
#   cd /mnt/bsb-plugins
#   node /root/entrypoint.js
#   cd /home/bsb
#   # node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)
# fi

mkdir /home/bsb/.temp

chown -R node:node /home/bsb
chown -R node:node /mnt/bsb-plugins

chmod -R 444 /home/bsb
chmod -R 644 /home/bsb/.temp
chmod -R 444 /mnt/bsb-plugins
chmod 600 /home/bsb/sec-config.yaml


exec gosu node:node node lib/cli.js
