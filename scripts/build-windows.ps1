#requires -Version 7.0
. "$PSScriptRoot/env.ps1"
Test-Eu5Rust
Initialize-Eu5Dependencies
Invoke-Eu5Tool -File cargo -Arguments @('build','--release','--locked','--manifest-path','core/Cargo.toml')
New-Item -ItemType Directory -Force 'build/sidecar' | Out-Null
Copy-Item -LiteralPath (Join-Path $env:CARGO_TARGET_DIR 'release/eu5-population-core.exe') -Destination 'build/sidecar/eu5-population-core.exe'
Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node/npm.cmd') -Arguments @('run','build:ui')

Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node/node.exe') -Arguments @('scripts/collect-notices.mjs')
