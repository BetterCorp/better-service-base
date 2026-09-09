#!/bin/sh
set -eu
version=${1:?version required}
printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?(\+[A-Za-z0-9.-]+)?$'
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
for manifest in rust/Cargo.toml rust/cli/Cargo.toml plugins/rust/builtins/Cargo.toml; do
    sed -i "0,/^version = /s/^version = .*/version = \"$version\"/" "$root/$manifest"
done
for package in better-service-base better-service-base-cli bsb-rust-builtins; do
    sed -i "/^name = \"$package\"$/ {n;s/^version = .*/version = \"$version\"/;}" "$root/Cargo.lock"
done
