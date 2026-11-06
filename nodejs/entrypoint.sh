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

INSTALL_TARGET=""
if [ -n "$RAW_PLUGIN_DIRS" ]; then
  OLDIFS="$IFS"
  IFS=","
  for DIR in $RAW_PLUGIN_DIRS; do
    DIR=$(echo "$DIR" | xargs)
    [ -z "$DIR" ] && continue
    INSTALL_TARGET="$DIR"
    break
  done
  IFS="$OLDIFS"
fi

if [ -n "$INSTALL_TARGET" ]; then
  printf 'BSB entrypoint: check plugin install target %s\n' "$INSTALL_TARGET"
  if [ ! -d "$INSTALL_TARGET" ] || [ ! -f "$INSTALL_TARGET/package.json" ]; then
    NEED_INSTALL=1
  fi

  if [ "$NEED_PLUGIN_WRITE" -eq 1 ] || [ "$NEED_INSTALL" -eq 1 ]; then
    printf 'BSB entrypoint: prepare plugin install target %s\n' "$INSTALL_TARGET"
    mkdir -p "$INSTALL_TARGET"
    chown node:node "$INSTALL_TARGET" 2>/dev/null || true
    chmod u+rwx "$INSTALL_TARGET" 2>/dev/null || true

    # Migrate installer state left by older root-run images or permission sync.
    # These paths are installer-owned and must remain writable after privileges
    # are dropped; secondary plugin search directories remain untouched.
    for INSTALLER_DIR in \
      "$INSTALL_TARGET/.bsb-plugin-install-locks" \
      "$INSTALL_TARGET/.bsb-plugin-installer"; do
      mkdir -p "$INSTALLER_DIR"
      chown -R node:node "$INSTALLER_DIR" 2>/dev/null || true
      chmod -R u+rwX "$INSTALLER_DIR" 2>/dev/null || true
    done

    # Updates replace version directories atomically. Prepare only the package
    # roots explicitly requested for installation, never every search path.
    if [ -n "${BSB_PLUGINS:-}" ]; then
      OLDIFS="$IFS"
      IFS=","
      for SPEC in $BSB_PLUGINS; do
        SPEC=$(echo "$SPEC" | xargs)
        [ -z "$SPEC" ] && continue
        case "$SPEC" in
          *:*) PACKAGE_NAME=${SPEC%%:*} ;;
          @*)
            PACKAGE_TAIL=${SPEC#@}
            case "$PACKAGE_TAIL" in
              *@*) PACKAGE_NAME="@${PACKAGE_TAIL%@*}" ;;
              *) PACKAGE_NAME="$SPEC" ;;
            esac
            ;;
          *) PACKAGE_NAME=${SPEC%%@*} ;;
        esac
        case "$PACKAGE_NAME" in
          ""|/*|*..*|*\\*|*/?*/*)
            printf 'BSB entrypoint: invalid plugin package path %s\n' "$PACKAGE_NAME" >&2
            exit 1
            ;;
          */*)
            case "$PACKAGE_NAME" in
              @*/*) ;;
              *)
                printf 'BSB entrypoint: invalid plugin package path %s\n' "$PACKAGE_NAME" >&2
                exit 1
                ;;
            esac
            ;;
        esac
        PACKAGE_ROOT="$INSTALL_TARGET/$PACKAGE_NAME"
        PACKAGE_PARENT=${PACKAGE_ROOT%/*}
        if [ "$PACKAGE_PARENT" != "$INSTALL_TARGET" ] && [ -d "$PACKAGE_PARENT" ]; then
          chown node:node "$PACKAGE_PARENT" 2>/dev/null || true
          chmod u+rwx "$PACKAGE_PARENT" 2>/dev/null || true
        fi
        if [ -d "$PACKAGE_ROOT" ]; then
          printf 'BSB entrypoint: migrate writable plugin package %s\n' "$PACKAGE_ROOT"
          chown -R node:node "$PACKAGE_ROOT" 2>/dev/null || true
          chmod -R u+rwX "$PACKAGE_ROOT" 2>/dev/null || true
        fi
      done
      IFS="$OLDIFS"
    fi
  fi
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
