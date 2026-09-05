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
RAW_WRITABLE_PATHS="/home/bsb/.bsb${BSB_WRITABLE_PATHS:+,$BSB_WRITABLE_PATHS}"

is_writable_dir() {
  DIR="$1"
  TEST_FILE="$DIR/.bsb-write-test-$$"
  printf 'BSB entrypoint: write probe %s\n' "$DIR"
  if ( : > "$TEST_FILE" ) 2>/dev/null; then
    printf 'BSB entrypoint: remove write probe %s\n' "$DIR"
    rm -f "$TEST_FILE" 2>/dev/null || true
    return 0
  fi
  return 1
}

printf '%s\n' 'BSB entrypoint: read runtime version'
BSB_RUNTIME_VERSION="$(node -p "require('/home/bsb/node_modules/@bsb/base/package.json').version" 2>/dev/null || echo unknown)"
echo "BSB runtime version: ${BSB_RUNTIME_VERSION}"

printf '%s\n' 'BSB entrypoint: mkdir /mnt/temp'
mkdir -p /mnt/temp || true

if [ "${BSB_PLUGIN_WATCHER:-}" = "1" ] || [ "${BSB_PLUGIN_WATCHER:-}" = "true" ] || [ "${BSB_PLUGIN_WATCHER:-}" = "TRUE" ] || [ "${BSB_PLUGIN_WATCHER:-}" = "yes" ] || [ "${BSB_PLUGIN_WATCHER:-}" = "YES" ]; then
  echo "BSB plugin watcher mode enabled"
  printf '%s\n' 'BSB entrypoint: start plugin watcher'
  exec node /home/bsb/plugin-watcher.js
fi

NEED_INSTALL=0
if [ -n "$RAW_PLUGIN_DIRS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_PLUGIN_DIRS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    printf 'BSB entrypoint: check plugin directory %s\n' "$DIR"
    if [ ! -d "$DIR" ]; then
      printf 'BSB entrypoint: mkdir %s\n' "$DIR"
      mkdir -p "$DIR"
      NEED_INSTALL=1
    fi
  done
  IFS="$OLDIFS"
fi

if [ -n "$RAW_PLUGIN_DIRS" ] && { [ "$NEED_INSTALL" -eq 1 ] || [ -n "$BSB_PLUGINS" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "true" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "TRUE" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "yes" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "YES" ]; }; then
  echo "BSB plugin bootstrap: syncing plugins"
  if ! node /home/bsb/entrypoint.js; then
    echo "BSB plugin bootstrap failed; refusing to start BSB"
    exit 1
  fi
  printf '%s\n' 'BSB entrypoint: plugin bootstrap complete'
fi

printf '%s\n' 'BSB entrypoint: chown /home/bsb'
chown -R node:node /home/bsb
if [ -n "$RAW_PLUGIN_DIRS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_PLUGIN_DIRS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    if is_writable_dir "$DIR"; then
      printf 'BSB entrypoint: chown %s\n' "$DIR"
      chown -R node:node "$DIR" || true
    else
      echo "BSB plugin dir is read-only; skipping ownership fix: $DIR"
    fi
  done
  IFS="$OLDIFS"
fi
if [ -n "$RAW_WRITABLE_PATHS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_WRITABLE_PATHS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    printf 'BSB entrypoint: mkdir %s\n' "$DIR"
    mkdir -p "$DIR" || true
    printf 'BSB entrypoint: chown %s\n' "$DIR"
    chown -R node:node "$DIR" || true
  done
  IFS="$OLDIFS"
fi
printf '%s\n' 'BSB entrypoint: chown /mnt/temp'
chown -R node:node /mnt/temp || true

printf '%s\n' 'BSB entrypoint: chmod d /home/bsb'
find /home/bsb -type d -exec chmod 550 {} + 2>/dev/null || true
printf '%s\n' 'BSB entrypoint: chmod f /home/bsb'
find /home/bsb -type f -exec chmod 440 {} + 2>/dev/null || true
printf '%s\n' 'BSB entrypoint: chmod /home/bsb/entrypoint.sh'
chmod 550 /home/bsb/entrypoint.sh || true
printf '%s\n' 'BSB entrypoint: check /home/bsb/sec-config.yaml'
if [ -f /home/bsb/sec-config.yaml ]; then
  printf '%s\n' 'BSB entrypoint: chmod /home/bsb/sec-config.yaml'
  chmod 400 /home/bsb/sec-config.yaml || true
fi

printf '%s\n' 'BSB entrypoint: chmod d /mnt/temp'
find /mnt/temp -type d -exec chmod 770 {} + 2>/dev/null || true
printf '%s\n' 'BSB entrypoint: chmod f /mnt/temp'
find /mnt/temp -type f -exec chmod 660 {} + 2>/dev/null || true
if [ -n "$RAW_WRITABLE_PATHS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_WRITABLE_PATHS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    printf 'BSB entrypoint: chmod d %s\n' "$DIR"
    find "$DIR" -type d -exec chmod 770 {} + 2>/dev/null || true
    printf 'BSB entrypoint: chmod f %s\n' "$DIR"
    find "$DIR" -type f -exec chmod 660 {} + 2>/dev/null || true
  done
  IFS="$OLDIFS"
fi

if [ -n "$RAW_PLUGIN_DIRS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_PLUGIN_DIRS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    if is_writable_dir "$DIR"; then
      printf 'BSB entrypoint: chmod d %s\n' "$DIR"
      find "$DIR" -type d -exec chmod 550 {} + 2>/dev/null || true
      printf 'BSB entrypoint: chmod f %s\n' "$DIR"
      find "$DIR" -type f -exec chmod 440 {} + 2>/dev/null || true
    else
      echo "BSB plugin dir is read-only; skipping permission fix: $DIR"
    fi
  done
  IFS="$OLDIFS"
fi

if [ "${BSB_SHOW_PACKAGES:-}" = "1" ] || [ "${BSB_SHOW_PACKAGES:-}" = "true" ] || [ "${BSB_SHOW_PACKAGES:-}" = "TRUE" ] || [ "${BSB_SHOW_PACKAGES:-}" = "yes" ] || [ "${BSB_SHOW_PACKAGES:-}" = "YES" ] || [ "${BSB_SHOW_PACKAGES:-}" = "y" ] || [ "${BSB_SHOW_PACKAGES:-}" = "Y" ]; then
  printf '%s\n' 'BSB entrypoint: list plugin search paths'
  gosu node:node node /home/bsb/node_modules/@bsb/base/lib/scripts/list-plugin-search-paths.js
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
  printf '%s\n' 'BSB entrypoint: start debug command'
  exec gosu node:node "$@"
else
  printf '%s\n' 'BSB startup'
  exec gosu node:node node /home/bsb/node_modules/@bsb/base/lib/cli.js
fi
