#!/bin/sh

# BSB (Better-Service-Base) is an event-bus based microservice framework.  
# Copyright (C) 2024 BetterCorp (PTY) Ltd  
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# Alternatively, you may obtain a commercial license for this program. 
# The commercial license allows you to use the Program in a closed-source manner, 
# including the right to create derivative works that are not subject to the terms 
# of the AGPL. 
#
# To obtain a commercial license, please contact the copyright holders at 
# https://www.bettercorp.dev. The terms and conditions of the commercial license 
# will be provided upon request.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

RAW_PLUGIN_DIRS="${BSB_PLUGIN_DIRS:-${BSB_PLUGINS_DIR:-${BSB_PLUGIN_DIR:-}}}"
RAW_WRITABLE_PATHS="${BSB_WRITABLE_PATHS:-}"

mkdir -p /mnt/temp || true

NEED_INSTALL=0
if [ -n "$RAW_PLUGIN_DIRS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_PLUGIN_DIRS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    if [ ! -d "$DIR" ]; then
      mkdir -p "$DIR"
      NEED_INSTALL=1
    fi
  done
  IFS="$OLDIFS"
fi

if [ -n "$RAW_PLUGIN_DIRS" ] && { [ "$NEED_INSTALL" -eq 1 ] || [ -n "$BSB_PLUGINS" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "1" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "true" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "TRUE" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "yes" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "YES" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "y" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "Y" ]; }; then
  echo "BSB plugin bootstrap: syncing plugins"
  node /home/bsb/entrypoint.js
fi

chown -R node:node /home/bsb
if [ -n "$RAW_PLUGIN_DIRS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_PLUGIN_DIRS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    chown -R node:node "$DIR"
  done
  IFS="$OLDIFS"
fi
if [ -n "$RAW_WRITABLE_PATHS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_WRITABLE_PATHS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    mkdir -p "$DIR" || true
    chown -R node:node "$DIR" || true
  done
  IFS="$OLDIFS"
fi
chown -R node:node /mnt/temp || true

find /home/bsb -type d -exec chmod 550 {} \; 2>/dev/null || true
find /home/bsb -type f -exec chmod 440 {} \; 2>/dev/null || true
chmod 550 /home/bsb/entrypoint.sh || true
if [ -f /home/bsb/sec-config.yaml ]; then
  chmod 400 /home/bsb/sec-config.yaml || true
fi

find /mnt/temp -type d -exec chmod 770 {} \; 2>/dev/null || true
find /mnt/temp -type f -exec chmod 660 {} \; 2>/dev/null || true
if [ -n "$RAW_WRITABLE_PATHS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_WRITABLE_PATHS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    find "$DIR" -type d -exec chmod 770 {} \; 2>/dev/null || true
    find "$DIR" -type f -exec chmod 660 {} \; 2>/dev/null || true
  done
  IFS="$OLDIFS"
fi

if [ -n "$RAW_PLUGIN_DIRS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_PLUGIN_DIRS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    find "$DIR" -type d -exec chmod 550 {} \; 2>/dev/null || true
    find "$DIR" -type f -exec chmod 440 {} \; 2>/dev/null || true
  done
  IFS="$OLDIFS"
fi

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
  exec gosu node:node node /home/bsb/node_modules/@bsb/base/lib/cli.js
fi
