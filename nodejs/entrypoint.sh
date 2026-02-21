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

PLUGIN_DIR="${BSB_PLUGINS_DIR:-${BSB_PLUGIN_DIR:-}}"
PLUGIN_DIR_EXISTS=0
if [ -n "$PLUGIN_DIR" ] && [ -d "$PLUGIN_DIR" ]; then
  PLUGIN_DIR_EXISTS=1
fi

mkdir -p /mnt/.temp /mnt/temp
if [ -n "$PLUGIN_DIR" ] && [ "$PLUGIN_DIR_EXISTS" -eq 0 ]; then
  mkdir -p "$PLUGIN_DIR"
fi

if [ -n "$PLUGIN_DIR" ] && { [ "$PLUGIN_DIR_EXISTS" -eq 0 ] || [ -n "$BSB_PLUGINS" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "1" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "true" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "TRUE" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "yes" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "YES" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "y" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "Y" ]; }; then
  echo "BSB plugin bootstrap: syncing plugins into $PLUGIN_DIR"
  node /home/bsb/entrypoint.js
fi

chown -R node:node /home/bsb
if [ -n "$PLUGIN_DIR" ]; then
  chown -R node:node "$PLUGIN_DIR"
fi
chown -R node:node /mnt/.temp /mnt/temp || true

# Secure pattern:
# - directories need execute bit for traversal
# - files are non-executable by default
find /home/bsb -type d -exec chmod 550 {} \; 2>/dev/null || true
find /home/bsb -type f -exec chmod 440 {} \; 2>/dev/null || true
chmod 550 /home/bsb/entrypoint.sh || true
if [ -f /home/bsb/sec-config.yaml ]; then
  chmod 400 /home/bsb/sec-config.yaml || true
fi

find /mnt/.temp -type d -exec chmod 770 {} \; 2>/dev/null || true
find /mnt/.temp -type f -exec chmod 660 {} \; 2>/dev/null || true
find /mnt/temp -type d -exec chmod 770 {} \; 2>/dev/null || true
find /mnt/temp -type f -exec chmod 660 {} \; 2>/dev/null || true

if [ -n "$PLUGIN_DIR" ]; then
  find "$PLUGIN_DIR" -type d -exec chmod 550 {} \; 2>/dev/null || true
  find "$PLUGIN_DIR" -type f -exec chmod 440 {} \; 2>/dev/null || true
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
  exec gosu node:node node /home/bsb/lib/cli.js
fi
