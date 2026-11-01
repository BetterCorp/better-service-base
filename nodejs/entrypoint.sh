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

is_truthy() {
  case "${1:-}" in
    1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss]|[Yy]) return 0 ;;
    *) return 1 ;;
  esac
}

printf '%s\n' 'BSB entrypoint: read runtime version'
BSB_RUNTIME_VERSION="$(node -p "require('/home/bsb/node_modules/@bsb/base/package.json').version" 2>/dev/null || echo unknown)"
echo "BSB runtime version: ${BSB_RUNTIME_VERSION}"

printf '%s\n' 'BSB entrypoint: mkdir /mnt/temp'
mkdir -p /mnt/temp || true

NEED_INSTALL=0
NEED_PLUGIN_WRITE=0
if [ -n "${BSB_PLUGINS:-}" ] || is_truthy "${BSB_PLUGIN_WATCHER:-}" || is_truthy "${BSB_PLUGIN_UPDATE:-}"; then
  NEED_PLUGIN_WRITE=1
fi
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
    if [ "$NEED_PLUGIN_WRITE" -eq 1 ] || [ "$NEED_INSTALL" -eq 1 ]; then
      # Only the directory itself needs to be writable for the unprivileged
      # installer. Never recursively chown plugin contents during bootstrap.
      chown node:node "$DIR" 2>/dev/null || true
      chmod u+rwx "$DIR" 2>/dev/null || true
    fi
  done
  IFS="$OLDIFS"
fi

chown node:node /mnt/temp 2>/dev/null || true

if is_truthy "${BSB_PLUGIN_WATCHER:-}"; then
  echo "BSB plugin watcher mode enabled"
  if is_truthy "${BSB_SYNC_PERMISSIONS:-false}"; then
    printf '%s\n' 'BSB entrypoint: permission sync is incompatible with a writable plugin watcher; skipping it'
  fi
  printf '%s\n' 'BSB entrypoint: start plugin watcher as node'
  exec gosu node:node node /home/bsb/plugin-watcher.js
fi

if [ -n "$RAW_PLUGIN_DIRS" ] && { [ "$NEED_INSTALL" -eq 1 ] || [ -n "$BSB_PLUGINS" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "true" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "TRUE" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "yes" ] || [ "${BSB_PLUGIN_UPDATE:-}" = "YES" ]; }; then
  echo "BSB plugin bootstrap: syncing plugins"
  if ! gosu node:node node /home/bsb/entrypoint.js; then
    echo "BSB plugin bootstrap failed; refusing to start BSB"
    exit 1
  fi
  printf '%s\n' 'BSB entrypoint: plugin bootstrap complete'
fi

case "${BSB_SYNC_PERMISSIONS:-false}" in
  1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss]|[Yy])
    printf '%s\n' 'BSB entrypoint: sync permissions'
    if ! /home/bsb/sync-permissions.sh; then
      printf '%s\n' 'BSB permission sync failed; refusing to start BSB' >&2
      exit 1
    fi
    ;;
  *) printf '%s\n' 'BSB entrypoint: permission sync skipped (BSB_SYNC_PERMISSIONS=false)' ;;
esac

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
