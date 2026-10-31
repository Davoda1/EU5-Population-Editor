#requires -Version 7.0
. "$PSScriptRoot/env.ps1"
Write-Host 'EU5 Population & Demographics Editor — Windows preflight'
Test-Eu5Rust
Write-Host 'Preflight PASS. No global settings changed.'
