#!/usr/bin/env bash
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
printf 'EU5 Population & Demographics Editor — GNU/Linux preflight\n'
eu5_rust_check
for tool in cc tar dpkg-deb sha256sum readelf; do command -v "$tool" >/dev/null || eu5_die "Missing required build/package tool: $tool. Install it yourself, then rerun."; done
printf 'Preflight PASS. No global settings changed.\n'
