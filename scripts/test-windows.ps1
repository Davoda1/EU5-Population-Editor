#requires -Version 7.0
. "$PSScriptRoot/env.ps1"
Test-Eu5Rust
Initialize-Eu5Dependencies
Invoke-Eu5Tool -File cargo -Arguments @('test','--locked','--manifest-path','core/Cargo.toml','--','--nocapture')
Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node-v26.13.0/npm.cmd') -Arguments @('run','test:ui')
