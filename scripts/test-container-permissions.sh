#!/usr/bin/env bash
set -euo pipefail

WORK=$(mktemp -d)
CONTAINER=
trap 'if [ -n "$CONTAINER" ]; then docker rm -f "$CONTAINER" >/dev/null; fi; rm -rf "$WORK"' EXIT

cat > "$WORK/Dockerfile" <<'DOCKERFILE'
FROM service-base:node-ci
RUN mkdir /home/bsb/permission-smoke && touch /home/bsb/permission-smoke/file
COPY cli.js /home/bsb/node_modules/@bsb/base/lib/cli.js
RUN /home/bsb/sync-permissions.sh \
    && test "$(stat -c '%U:%G:%a' /home/bsb/permission-smoke/file)" = node:node:440 \
    && test "$(stat -c '%a' /home/bsb/permission-smoke)" = 550 \
    && test "$(stat -c '%a' /home/bsb/.bsb)" = 770 \
    && test -x /home/bsb/entrypoint.sh && test -x /home/bsb/sync-permissions.sh
DOCKERFILE
cat > "$WORK/cli.js" <<'JAVASCRIPT'
import fs from 'node:fs';
const expected = process.env.BSB_SYNC_PERMISSIONS === 'true' ? 0o440 : 0o600;
if ((fs.statSync('/home/bsb/permission-smoke/file').mode & 0o777) !== expected) {
  throw new Error('Startup permission sync did not respect its opt-in flag');
}
fs.writeFileSync('/home/bsb/.bsb/permission-smoke', 'cache is writable');
if (process.env.BSB_SYNC_PERMISSIONS === 'true') {
  fs.writeFileSync('/data/nested/permission-smoke', 'custom path is writable');
} else if (fs.existsSync('/data/nested')) {
  throw new Error('Writable paths were prepared without opting in');
}
console.log('BSB CLI reached');
JAVASCRIPT
docker build -t service-base:permission-ci "$WORK"
mkdir "$WORK/readonly"
touch "$WORK/file"
chmod 600 "$WORK/file"
printf 'console.log("Watcher install stub reached");\n' > "$WORK/entrypoint.js"

for MODE in default enabled; do
  OPTIONS=()
  if [ "$MODE" = enabled ]; then OPTIONS+=(--env BSB_SYNC_PERMISSIONS=true); fi
  CONTAINER=$(docker create "${OPTIONS[@]}" \
    --env BSB_PLUGIN_DIRS=/mnt/plugins,/readonly \
    --env BSB_WRITABLE_PATHS=/data/nested \
    --volume "$WORK/readonly:/readonly:ro" service-base:permission-ci)
  docker cp "$WORK/file" "$CONTAINER":/home/bsb/permission-smoke/file
  timeout 60s docker start --attach "$CONTAINER" | tee "$WORK/$MODE.log"
  test "$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER")" = 0
  grep -Fx 'BSB startup' "$WORK/$MODE.log"
  grep -Fx 'BSB CLI reached' "$WORK/$MODE.log"
  if [ "$MODE" = enabled ]; then
    grep -Fx 'BSB entrypoint: chown /home/bsb' "$WORK/$MODE.log"
    grep -Fx 'BSB entrypoint: chmod d /home/bsb' "$WORK/$MODE.log"
    grep -Fx 'BSB entrypoint: chmod f /home/bsb' "$WORK/$MODE.log"
    grep -Fx 'BSB permission sync complete' "$WORK/$MODE.log"
    grep -Fx 'BSB plugin dir is read-only; skipping permission fix: /readonly' "$WORK/$MODE.log"
  else
    grep -Fx 'BSB entrypoint: permission sync skipped (BSB_SYNC_PERMISSIONS=false)' "$WORK/$MODE.log"
    if grep -E 'BSB entrypoint: (chown|chmod|write probe)' "$WORK/$MODE.log"; then exit 1; fi
  fi
  docker rm "$CONTAINER" >/dev/null
  CONTAINER=

  CONTAINER=$(docker create "${OPTIONS[@]}" --env BSB_PLUGIN_WATCHER=true \
    --env BSB_PLUGIN_WATCH_ONCE=true --env BSB_PLUGINS=smoke service-base:permission-ci)
  docker cp "$WORK/entrypoint.js" "$CONTAINER":/home/bsb/entrypoint.js
  timeout 60s docker start --attach "$CONTAINER" | tee "$WORK/watcher-$MODE.log"
  test "$(docker inspect --format '{{.State.ExitCode}}' "$CONTAINER")" = 0
  grep -Fx 'Watcher install stub reached' "$WORK/watcher-$MODE.log"
  if [ "$MODE" = enabled ]; then
    grep -Fx 'BSB permission sync complete' "$WORK/watcher-$MODE.log"
  else
    grep -Fx '[BSB] Permission sync skipped (BSB_SYNC_PERMISSIONS=false)' "$WORK/watcher-$MODE.log"
    if grep -E 'BSB entrypoint: (chown|chmod|write probe)' "$WORK/watcher-$MODE.log"; then exit 1; fi
  fi
  docker rm "$CONTAINER" >/dev/null
  CONTAINER=
done
