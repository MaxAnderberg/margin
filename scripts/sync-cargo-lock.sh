#!/usr/bin/env bash
# Sets Margin's own version in Cargo.lock.
#
#   scripts/sync-cargo-lock.sh <version> [path/to/Cargo.lock]
#
# release-please bumps Cargo.toml but can't select Margin's entry in
# Cargo.lock (its TOML updater doesn't support JSONPath filters), so the
# release workflow runs this on the Release PR. Only the `version` line right
# after `name = "margin"` changes; everything else is left byte-for-byte.
set -euo pipefail

version="${1:?usage: sync-cargo-lock.sh <version> [Cargo.lock]}"
lock="${2:-src-tauri/Cargo.lock}"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$ ]]; then
  echo "Not a version: $version" >&2
  exit 1
fi

count=$(grep -c '^name = "margin"$' "$lock" || true)
if [[ "$count" != 1 ]]; then
  echo "Expected exactly one margin package in $lock, found $count" >&2
  exit 1
fi

tmp="$(mktemp)"
awk -v v="$version" '
  after_name && /^version = "/ { $0 = "version = \"" v "\""; after_name = 0 }
  { after_name = ($0 == "name = \"margin\"") ; print }
' "$lock" > "$tmp"
cat "$tmp" > "$lock" # keep the original file's permissions
rm -f "$tmp"
