#!/bin/sh

if [ "$BSB_CONTAINER" == "true" ]; then
  pushd /mnt/bsb-plugins && node /root/entrypoint.js && popd
  node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)
fi

chmod -R 644 /home/bsb
chown node:node /home/bsb/sec.config.json
chown -R root:root /mnt/bsb-plugins
chmod -R 644 /mnt/bsb-plugins

exec gosu node "$@"
