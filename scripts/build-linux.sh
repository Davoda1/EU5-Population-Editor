#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
bash scripts/check-linux.sh
eu5_dependencies
cargo build --release --locked --manifest-path core/Cargo.toml
mkdir -p build/sidecar
cp -- "$CARGO_TARGET_DIR/release/eu5-population-core" build/sidecar/eu5-population-core
npm run build:ui
node scripts/collect-notices.mjs
