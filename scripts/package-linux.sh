#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
eu5_node_prepare
[[ -x build/sidecar/eu5-population-core ]] || eu5_die 'Compiled Rust sidecar missing. Run build-linux.sh; no incomplete binary package will be produced.'
node scripts/package-linux.mjs
node scripts/verify-release.mjs linux
