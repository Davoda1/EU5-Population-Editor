#!/usr/bin/env bash
# Complete pipeline. Any failed gate stops packaging with a nonzero exit code.
set -euo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/env.sh"
exec > >(tee "build/run-linux-$(date -u +%Y%m%dT%H%M%SZ).log") 2>&1
bash scripts/check-linux.sh
bash scripts/test-linux.sh
bash scripts/build-linux.sh
if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
  npm run test:desktop
else
  printf '\nDesktop GUI test unavailable without a display. Native/core tests and package verification still run.\n'
fi
bash scripts/package-linux.sh
node scripts/source-package.mjs
node scripts/checksums.mjs
printf '\nALL AVAILABLE RELEASE GATES PASSED. See release/ and build/ logs.\n'
