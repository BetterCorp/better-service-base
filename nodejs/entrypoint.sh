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

# Check if the first argument is BSBDEBUG for debugging purposes
if [ "$1" = "BSBDEBUG" ]; then
  shift
  echo "WARNING: RUNNING IN DEBUG MODE"
  echo "IN THIS MODE, ANY COMMAND CAN BE RUN"
  echo "IT WILL BE RUN AS THE NODE USER"
  echo "DO NOT USE IN PRODUCTION"
  echo " - THERE WILL BE A 15s DELAY NOW"
  sleep 15s
  echo " - RUNNING YOUR COMMAND [$@]"
  exec gosu node:node "$@"
else
  exec gosu node:node node lib/cli.js
fi
