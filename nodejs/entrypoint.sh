#!/bin/sh

# if [ "$BSB_CONTAINER" == "true" ]; then
#   cd /mnt/bsb-plugins
#   node /root/entrypoint.js
#   cd /home/bsb
#   # node ./node_modules/@bettercorp/service-base/postinstall.js --cwd=$(pwd)
# fi

chown -R root:node /home/bsb
chmod -R 650 /home/bsb
mkdir /home/bsb/.temp
chmod -R 660 /home/bsb/.temp
chown node:node /home/bsb/sec-config.yaml
chown -R root:node /mnt/bsb-plugins
chmod -R 660 /mnt/bsb-plugins

#exec gosu node "$@"
exec gosu node "$@"
