#requires -Version 7.0
. "$PSScriptRoot/env.ps1"
Initialize-Eu5Node
if (!(Test-Path -LiteralPath 'build/sidecar/eu5-population-core.exe')) { throw 'Compiled MSVC Rust sidecar missing. Run build-windows.ps1. No incomplete binary package will be produced.' }
Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node/node.exe') -Arguments @('node_modules/electron-builder/cli.js','--win','zip','--x64','--publish','never')
Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node/node.exe') -Arguments @('scripts/verify-release.mjs','windows')
Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node/node.exe') -Arguments @('scripts/checksums.mjs')
