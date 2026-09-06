#!/bin/sh
set -eu
version=${1:?version required}
printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$'
sed -i "0,/^version = /s/^version = .*/version = \"$version\"/" Cargo.toml
sed -i "/^name = \"better-service-base\"$/ {n;s/^version = .*/version = \"$version\"/;}" Cargo.lock
