#!/usr/bin/env bash
# Source inside these scripts only: all environment changes end with the process.
set -euo pipefail
EU5_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
export CARGO_HOME="$EU5_ROOT/dependencies/cargo-home"
export CARGO_TARGET_DIR="$EU5_ROOT/build/rust-target"
# Encoded flags keep paths with spaces intact; inherited Rust flags remain process-local.
if [[ -z "${CARGO_ENCODED_RUSTFLAGS:-}" && -n "${RUSTFLAGS:-}" ]]; then
  read -ra EU5_INHERITED_FLAGS <<< "$RUSTFLAGS"
  printf -v CARGO_ENCODED_RUSTFLAGS '%s\x1f' "${EU5_INHERITED_FLAGS[@]}"
  CARGO_ENCODED_RUSTFLAGS="${CARGO_ENCODED_RUSTFLAGS%$'\x1f'}"
fi
export CARGO_ENCODED_RUSTFLAGS="${CARGO_ENCODED_RUSTFLAGS:+$CARGO_ENCODED_RUSTFLAGS$'\x1f'}--remap-path-prefix=$EU5_ROOT=."
export npm_config_cache="$EU5_ROOT/dependencies/npm-cache"
export npm_config_userconfig="$EU5_ROOT/dependencies/npm-user.conf"
export npm_config_globalconfig="$EU5_ROOT/dependencies/npm-global.conf"
export NPM_CONFIG_CACHE="$npm_config_cache"
export NPM_CONFIG_USERCONFIG="$npm_config_userconfig"
export NPM_CONFIG_GLOBALCONFIG="$npm_config_globalconfig"
export ELECTRON_CACHE="$EU5_ROOT/dependencies/electron-cache"
export ELECTRON_BUILDER_CACHE="$EU5_ROOT/dependencies/electron-builder-cache"
mkdir -p "$EU5_ROOT/toolings" "$EU5_ROOT/dependencies" "$EU5_ROOT/build" "$EU5_ROOT/release"
: >> "$npm_config_userconfig"
: >> "$npm_config_globalconfig"
# Do not change RUSTUP_HOME or install/update toolchains/components.
if [[ -x "$EU5_ROOT/toolings/node/bin/node" ]]; then export PATH="$EU5_ROOT/toolings/node/bin:$PATH"; fi
cd -- "$EU5_ROOT"
eu5_die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
eu5_rust_check() {
  command -v rustc >/dev/null || eu5_die 'rustc is not installed or not in this process PATH. Install a suitable Rust toolchain yourself (minimum 1.85), then rerun. This script will not install or modify Rust.'
  command -v cargo >/dev/null || eu5_die 'cargo is not available; expose the already installed Cargo for this process.'
  rustc --version
  cargo --version
  if command -v rustup >/dev/null; then rustup --version; fi
  local version major minor
  version="$(rustc --version)"; version="${version#rustc }"; version="${version%% *}"; major="${version%%.*}"; minor="${version#*.}"; minor="${minor%%.*}"
  [[ "$major" -gt 1 || ( "$major" -eq 1 && "$minor" -ge 85 ) ]] || eu5_die 'Rust >=1.85 required. No toolchain changes were made.'
  [[ "$(uname -m)" == x86_64 ]] || eu5_die 'This release targets GNU/Linux x86-64 only.'
}
eu5_node_prepare() {
  if [[ ! -x "$EU5_ROOT/toolings/node/bin/node" ]]; then
    for tool in curl tar sha256sum awk; do command -v "$tool" >/dev/null || eu5_die "Missing prerequisite: $tool"; done
    printf '\nPreparing pinned Node.js 24.22.1 for linux-x64...\n'
    local version archive expected actual
    version="v24.22.1"
    [[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || eu5_die 'Invalid pinned Node.js version.'
    archive="node-$version-linux-x64.tar.xz"
    curl --fail --location --retry 3 --connect-timeout 30 --max-time 900 "https://nodejs.org/dist/$version/$archive" -o "dependencies/$archive"
    curl --fail --location --retry 3 "https://nodejs.org/dist/$version/SHASUMS256.txt" -o dependencies/node-SHASUMS256.txt
    expected="$(awk -v file="$archive" '$2==file {print $1}' dependencies/node-SHASUMS256.txt)"
    actual="$(sha256sum "dependencies/$archive")"; actual="${actual%% *}"
    [[ -n "$expected" && "$expected" == "$actual" ]] || eu5_die 'Official Node archive checksum mismatch; archive will not be extracted.'
    tar -xJf "dependencies/$archive" -C toolings
    mv -- "toolings/node-$version-linux-x64" toolings/node
  fi
  export PATH="$EU5_ROOT/toolings/node/bin:$PATH"
  { printf 'Node: '; node --version; printf 'npm: '; npm --version; printf 'npx: '; npx --version; } | tee build/tooling-manifest.txt
}
eu5_dependencies() {
  eu5_node_prepare
  [[ -f package-lock.json ]] || eu5_die 'package-lock.json is missing; restore the source package.'
  npm ci --no-audit --no-fund
  [[ -f core/Cargo.lock ]] || eu5_die 'core/Cargo.lock is missing; restore the source package. Native dependency resolution must not change during release builds.'
  node node_modules/electron/install.js
  cargo fetch --locked --manifest-path core/Cargo.toml
}
