#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
eu5_rust_check
eu5_dependencies
cargo test --locked --manifest-path core/Cargo.toml -- --nocapture
npm run test:ui
