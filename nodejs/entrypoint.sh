#!/bin/sh

if [ "$BSB_CONTAINER" == "true" ]; then
  cd /mnt/bsb-plugins
  node /root/entrypoint.js
  cd /home/bsb
  # node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)
fi

if [ "$BSB_DIALOUT" == "true" ]; then
  addgroup node dialout;
fi

chown -R root:node /home/bsb
chmod -R 650 /home/bsb
chown node:node /home/bsb/sec.config.json
chown -R root:node /mnt/bsb-plugins
chmod -R 650 /mnt/bsb-plugins

exec gosu node "$@"
