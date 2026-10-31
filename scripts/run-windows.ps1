#requires -Version 7.0
. "$PSScriptRoot/env.ps1"
$Log=Join-Path $Eu5Root ("build/run-windows-"+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')+'.log')
Start-Transcript -LiteralPath $Log
try {
 foreach ($Stage in @('check','test','build')) { Invoke-Eu5Tool -File ((Get-Command pwsh).Source) -Arguments @('-NoProfile','-File',(Join-Path $PSScriptRoot "$Stage-windows.ps1")) }
 Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node-v26.13.0/npm.cmd') -Arguments @('run','test:desktop')
 Invoke-Eu5Tool -File ((Get-Command pwsh).Source) -Arguments @('-NoProfile','-File',(Join-Path $PSScriptRoot 'package-windows.ps1'))
 Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node-v26.13.0/node.exe') -Arguments @('scripts/source-package.mjs')
 Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node-v26.13.0/node.exe') -Arguments @('scripts/checksums.mjs')
 Write-Host 'ALL AVAILABLE RELEASE GATES PASSED. See release/ and build/ logs.'
} finally { Stop-Transcript }
