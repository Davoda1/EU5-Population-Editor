# Building 1.0.3

Release builds use Node.js **26.13.0 LTS**, its bundled npm **11.20.0**, and Electron **45.2.1 stable**. The build-time Node.js version is separate from the Node.js runtime bundled inside Electron. Local scripts cache Node.js in a version-specific tooling directory.

`package-lock.json` and `core/Cargo.lock` pin the JavaScript and Rust dependencies.
Release builds use both lockfiles. See `TESTING-REPORT.md` for automated coverage,
checks and runtime limitations.

## Build directories and prerequisites

Project-specific tooling, caches and intermediates belong in `toolings/`,
`dependencies/`, `build/` and `node_modules/`; distributables belong in `release/`.
Game reference files and saved user projects must stay outside the source tree.
The source archive uses an explicit allowlist and excludes game files, caches,
binaries and private saved work.

## Bundled manual

`docs/manual/site` is the frozen offline manual for this application version.
Its matching editable source is in `docs/manual/source`. The normal UI build runs
`node scripts/check-manual.mjs` to verify version, content hashes, links and search;
it requires neither Python nor a manual download. Electron packages the generated
pages under `resources/manual` on both platforms.

To refresh the snapshot deliberately, use Python 3.12 or later with the included
`Markdown==3.8.1` requirement, then run:

```bash
node scripts/bundle-manual.mjs /path/to/EU5-Population-Editor-Manual
```

The source must declare the same version as the application. You can also pass
`docs/manual/source` to rebuild the included snapshot. Set `EU5_MANUAL_PYTHON`
to select a particular interpreter. Generation and validation happen in a
temporary copy before the verified snapshot replaces the existing one.
The bundler normalizes text to LF and the repository preserves those line endings
through checkout, so frozen hashes remain valid on Windows and Linux.

The separate manual source builds the hosted edition with `python scripts/build.py`;
`--offline` builds the application edition from the same chapter text and assets.

## Toolchain preparation

The scripts require an already installed compatible Rust/Cargo toolchain. They do
not install Rust targets, change the default toolchain, edit home-directory Cargo
configuration, or change persistent environment settings. npm, Cargo and Electron
caches are configured for the build process. Pinned Node 26.13.0 is downloaded to the
project and verified against the official checksum manifest when absent.

Allow several gigabytes for dependencies and build products. Source build scripts
are developer tooling; the portable applications contain no launcher scripts and
need no Node, Python or Rust installation on the destination machine.

## GNU/Linux x86-64

Prerequisites: Bash, curl, xz/tar, sha256sum, awk, a C compiler and linker,
`readelf` (binutils), `dpkg-deb`, Rust/Cargo and standard build utilities. The GUI
also needs the standard desktop libraries listed in the generated package
metadata and `RUNNING.txt`. No system packages are installed by the scripts.

```bash
bash scripts/check-linux.sh
bash scripts/run-linux.sh
```

Individual stages:

```bash
bash scripts/test-linux.sh
bash scripts/build-linux.sh
bash scripts/package-linux.sh
```

The complete pipeline runs preflight, dependency preparation, Rust and renderer
tests, production compilation, desktop tests when a display is available,
packaging, packaged-sidecar protocol checks, Debian layout checks, source
packaging and one SHA-256 manifest. A failed gate stops the pipeline.

Pushing a semantic version tag such as `v1.0.3` starts the **Release** workflow.
It checks the tag against `master` and the application version, runs the complete
Windows and Linux build and test pipeline, and creates a draft release containing
the verified packages and checksum manifest. Review the draft and its assets
before publishing it on GitHub.

The portable TAR.GZ has the real `eu5-population-editor` Electron executable at
its root. Extract all files together into an empty directory; its resources and
runtime libraries must remain beside it.

The Debian package installs exactly one regular native ELF executable in
`/usr/bin`: `eu5-population-editor`. Its small C entry point from
`scripts/linux-entry.c` uses `execv` to start Electron under
`/usr/lib/eu5-population-editor`, where the runtime and resources stay together.
It is neither a shell script nor a symlink. The desktop entry uses this binary.

The minimum glibc requirement is derived from the actual linked ELF symbol
requirements during packaging and recorded in the Debian dependencies and
portable `RUNNING.txt`. The Debian sandbox is root-owned with mode 4755.
Portable installations use unprivileged user namespaces; if the distribution
disables these, an administrator can place the entire extracted application in a
root-owned location that ordinary users cannot modify, then set `chrome-sandbox`
to owner `root:root` and mode `4755` on a filesystem that permits setuid execution.
Launch the application as an ordinary user. Do not disable the sandbox.

## Windows 10/11 x86-64

For the standard native build, install PowerShell 7 and an existing
`x86_64-pc-windows-msvc` Rust toolchain. Use an x64 MSVC developer PowerShell with
the Visual Studio linker and Windows SDK available.

```powershell
pwsh -NoProfile -File .\scripts\check-windows.ps1
pwsh -NoProfile -File .\scripts\run-windows.ps1
```

Individual stages are `test-windows.ps1`, `build-windows.ps1` and
`package-windows.ps1`. Use fresh child PowerShell processes so build environment
settings remain separate from the interactive session. The scripts do not
install Rust targets or change global toolchain configuration.

The portable ZIP has a real Windows `.exe` at its root and includes the Electron
runtime and `resources/core/eu5-population-core.exe`. Keep all accompanying
files together. No launcher scripts or developer tools are needed by end users.

The Rust core can also be cross-built using an existing
`x86_64-pc-windows-gnu` target and MinGW linker. A Linux cross-build must use the
official, checksum-verified Windows Electron distribution, the Windows core, and
the same compiled application resources. Cross-build structure checks do not
substitute for Windows runtime testing. `verify-release.mjs windows
--structure-only` explicitly reports that limitation; native Windows verification
runs the packaged core protocol.

## Frontend and desktop validation

After preparing dependencies:

```bash
npm run build:ui
npm run test:ui
npm run test:desktop
```

The desktop test drives the production Electron main/preload/renderer and Rust
core, supplying only native file-dialog answers. Linux needs an active display.
`EU5_QA_EXECUTABLE` selects an extracted packaged executable for the same test.
Synthetic fixtures include spaces, Unicode and a non-default Steam-library path.

Some root/container environments cannot enforce Chromium's sandbox. The
`EU5_QA_NO_SANDBOX=1` option is strictly a test-harness accommodation; the released
application does not set it. Any such limitation must be recorded in the testing
report. Distribution sandbox behavior should be checked as a normal desktop
user. Renderer-only browser tests use a mocked bridge and require a separately
prepared browser.

`node scripts/capture-screenshots.mjs` captures the built application with the
fictional fixture in `tests/helpers/demo-game.mjs`. It writes images only under
`build/screenshots` and removes its generated game/profile data. Review the
captures before copying them into the manual's canonical assets or the README
illustrations; then refresh the manual snapshot explicitly.

## Optional local installation validation

Use your own files outside the source tree:

```bash
EU5_TEST_GAME='/path/to/your/game' cargo test \
  --locked --manifest-path core/Cargo.toml \
  installation_compatibility -- --ignored --nocapture
```

Use the same Cargo environment as the build scripts. Repeat against each
available game generation. Never include private game data or map caches in the
source archive. User projects are not part of application source or binary packages.
