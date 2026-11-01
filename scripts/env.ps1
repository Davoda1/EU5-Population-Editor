# PowerShell 7. Dot-source only from these child build scripts.
# Variables are process-local; no profiles, registry settings or user config are edited.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:Eu5Root = Split-Path -Parent $PSScriptRoot
foreach ($Name in @('toolings','dependencies','build','release')) { New-Item -ItemType Directory -Force (Join-Path $Eu5Root $Name) | Out-Null }
$env:CARGO_HOME = Join-Path $Eu5Root 'dependencies/cargo-home'
$env:CARGO_TARGET_DIR = Join-Path $Eu5Root 'build/rust-target'
$RustFlags = if ($env:CARGO_ENCODED_RUSTFLAGS) { $env:CARGO_ENCODED_RUSTFLAGS } elseif ($env:RUSTFLAGS) { ($env:RUSTFLAGS -split '\s+') -join [char]31 } else { '' }
$env:CARGO_ENCODED_RUSTFLAGS = ($RustFlags, "--remap-path-prefix=$Eu5Root=.") | Where-Object { $_ } | Join-String -Separator ([char]31)

$env:npm_config_cache = Join-Path $Eu5Root 'dependencies/npm-cache'
$env:npm_config_userconfig = Join-Path $Eu5Root 'dependencies/npm-user.conf'
$env:npm_config_globalconfig = Join-Path $Eu5Root 'dependencies/npm-global.conf'
$env:ELECTRON_CACHE = Join-Path $Eu5Root 'dependencies/electron-cache'
$env:ELECTRON_BUILDER_CACHE = Join-Path $Eu5Root 'dependencies/electron-builder-cache'
foreach ($File in @($env:npm_config_userconfig,$env:npm_config_globalconfig)) { if (!(Test-Path -LiteralPath $File)) { [IO.File]::WriteAllText($File,'') } }
Set-Location -LiteralPath $Eu5Root
function Invoke-Eu5Tool { param([string]$File,[string[]]$Arguments=@()) & $File @Arguments; if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $File $($Arguments -join ' ')" } }
function Test-Eu5Rust {
 if (!$IsWindows -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw 'Windows 10/11 x86-64 is required by these scripts.' }
 foreach ($Tool in @('rustc','cargo')) { if (!(Get-Command $Tool -ErrorAction SilentlyContinue)) { throw "$Tool is missing. Install/expose a suitable existing MSVC Rust toolchain, then rerun. No automatic Rust installation or configuration changes are permitted." } }
 $RustVersion = (& rustc --version).Split(' ')[1]
 if ([version]$RustVersion -lt [version]'1.88.0') { throw "Rust 1.88 or newer is required; found $RustVersion. No toolchain changes made." }
 Invoke-Eu5Tool -File rustc -Arguments @('--version'); Invoke-Eu5Tool -File cargo -Arguments @('--version')
 if (Get-Command rustup -ErrorAction SilentlyContinue) { Invoke-Eu5Tool -File rustup -Arguments @('--version') }
 $VerboseRust = & rustc -vV
 if (!($VerboseRust -match '^host: x86_64-pc-windows-msvc$')) { throw 'An existing x86_64-pc-windows-msvc host toolchain is required. This script does not install targets or switch toolchains.' }
 if (!$env:VCToolsInstallDir) { throw 'Run from a Visual Studio x64 Native Tools environment with PowerShell 7; VCToolsInstallDir is missing.' }
 $MsvcLinker = Join-Path $env:VCToolsInstallDir 'bin/Hostx64/x64/link.exe'
 if (!(Test-Path -LiteralPath $MsvcLinker -PathType Leaf)) { throw 'The native x64 MSVC linker is missing from the selected Visual Studio toolchain.' }
 # Git for Windows also ships link.exe; Cargo must never select that utility.
 $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $MsvcLinker
}
function Initialize-Eu5Node {
 $NodeDir=Join-Path $Eu5Root 'toolings/node-v26.13.0'
 if (!(Test-Path -LiteralPath (Join-Path $NodeDir 'node.exe'))) {
  Write-Host 'Preparing pinned Node.js 26.13.0 for Windows x64...'
  $Selected = @{ version = 'v26.13.0' }
  $Archive="node-$($Selected.version)-win-x64.zip"; $ArchivePath=Join-Path $Eu5Root "dependencies/$Archive"
  Invoke-WebRequest "https://nodejs.org/dist/$($Selected.version)/$Archive" -OutFile $ArchivePath -MaximumRetryCount 3
  $Sums=(Invoke-WebRequest "https://nodejs.org/dist/$($Selected.version)/SHASUMS256.txt").Content
  if ($Sums -is [byte[]]) { $Sums=[Text.Encoding]::UTF8.GetString($Sums) }
  $Line=$Sums -split "`n" | Where-Object { $_.TrimEnd().EndsWith("  $Archive") } | Select-Object -First 1
  if (!$Line) { throw 'Official checksum entry missing.' }
  $Expected=($Line -split '\s+')[0]; $Actual=(Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash
  if ($Expected -ne $Actual) { throw 'Node archive checksum mismatch; refusing extraction.' }
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath (Join-Path $Eu5Root 'toolings')
  Move-Item -LiteralPath (Join-Path $Eu5Root "toolings/node-$($Selected.version)-win-x64") -Destination $NodeDir
 }
 $env:PATH="$NodeDir;$env:PATH"
 $Versions=@("Node: $(& (Join-Path $NodeDir 'node.exe') --version)","npm: $(& (Join-Path $NodeDir 'npm.cmd') --version)","npx: $(& (Join-Path $NodeDir 'npx.cmd') --version)")
 $Versions | Tee-Object -FilePath (Join-Path $Eu5Root 'build/tooling-manifest.txt')
}
function Initialize-Eu5Dependencies {
 Initialize-Eu5Node
 Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node-v26.13.0/npm.cmd') -Arguments @('ci','--no-audit','--no-fund')
 if (!(Test-Path -LiteralPath 'core/Cargo.lock')) { throw 'core/Cargo.lock is missing; restore the source package.' }
 Invoke-Eu5Tool -File (Join-Path $Eu5Root 'toolings/node-v26.13.0/node.exe') -Arguments @('node_modules/electron/install.js')
 Invoke-Eu5Tool -File cargo -Arguments @('fetch','--locked','--manifest-path','core/Cargo.toml')
}
