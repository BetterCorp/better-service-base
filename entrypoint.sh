#!/bin/sh

if [ "$BSB_CONTAINER" == "true" ]; then
  pushd /mnt/bsb-plugins && node /root/entrypoint.js && popd
  node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)
fi

chown -R root:node /home/bsb
chmod -R 650 /home/bsb
chown node:node /home/bsb/sec.config.json
chown -R root:node /mnt/bsb-plugins
chmod -R 650 /mnt/bsb-plugins

exec gosu node "$@"
