#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 IMAGE[:TAG] [IMAGE[:TAG] ...]" >&2
  exit 2
fi

auth_args=()
if [ -n "${DOCKER_HUB_USER:-}" ] && [ -n "${DOCKER_HUB_TOKEN:-}" ]; then
  auth_args=(--user "${DOCKER_HUB_USER}:${DOCKER_HUB_TOKEN}")
fi

parse_image() {
  local image="$1"
  image="${image#docker.io/}"
  image="${image%%@*}"

  local repo="$image"
  local tag="latest"
  if [[ "$image" == *:* ]]; then
    repo="${image%:*}"
    tag="${image##*:}"
  fi

  if [[ "$repo" != */* ]]; then
    repo="library/${repo}"
  fi

  printf '%s %s\n' "$repo" "$tag"
}

for image in "$@"; do
  read -r repo tag < <(parse_image "$image")
  echo "Checking Docker Hub quota for ${repo}:${tag}"

  token="$(
    curl --silent --show-error --fail \
      "${auth_args[@]}" \
      "https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repo}:pull" \
      | jq -r '.token'
  )"

  headers="$(mktemp)"
  status="$(
    curl --silent --show-error \
      --output /dev/null \
      --dump-header "$headers" \
      --write-out '%{http_code}' \
      --header "Authorization: Bearer ${token}" \
      --header "Accept: application/vnd.docker.distribution.manifest.v2+json" \
      "https://registry-1.docker.io/v2/${repo}/manifests/${tag}"
  )"

  limit="$(grep -i '^ratelimit-limit:' "$headers" | tail -1 | cut -d' ' -f2- | tr -d '\r' || true)"
  remaining="$(grep -i '^ratelimit-remaining:' "$headers" | tail -1 | cut -d' ' -f2- | tr -d '\r' || true)"
  reset_after="$(grep -i '^docker-ratelimit-source:' "$headers" | tail -1 | cut -d' ' -f2- | tr -d '\r' || true)"
  rm -f "$headers"

  echo "Docker Hub status=${status} ratelimit-limit=${limit:-unknown} ratelimit-remaining=${remaining:-unknown} source=${reset_after:-unknown}"

  if [ "$status" = "429" ]; then
    echo "Docker Hub quota exhausted for ${repo}:${tag}" >&2
    exit 1
  fi

  if [[ "$remaining" =~ ^0\; ]]; then
    echo "Docker Hub quota remaining is zero for ${repo}:${tag}" >&2
    exit 1
  fi

  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    echo "Unexpected Docker Hub status ${status} for ${repo}:${tag}" >&2
    exit 1
  fi
done
