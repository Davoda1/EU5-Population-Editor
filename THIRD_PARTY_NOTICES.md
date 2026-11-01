# Third-party notices

Project code: Copyright © 2026 davoda1. AGPL-3.0-only; see LICENSE.txt.
The license above applies to original project code, not to third-party components.

## Runtime components

| Component | Version | Declared license |
|---|---|---|
| React / React DOM | 19.1.1 | MIT |
| Electron | 45.2.1 | MIT; embedded Chromium components have their own notices |
| anyhow | 1.0.100 | MIT OR Apache-2.0 |
| serde | 1.0.228 | MIT OR Apache-2.0 |
| serde_json | 1.0.145 | MIT OR Apache-2.0 |
| sha2 | 0.10.9 | MIT OR Apache-2.0 |
| num-bigint | 0.4.6 | MIT OR Apache-2.0 |
| num-rational | 0.4.2 | MIT OR Apache-2.0 |
| num-traits | 0.2.19 | MIT OR Apache-2.0 |
| walkdir | 2.5.0 | MIT OR Unlicense |
| image | 0.25.6 | MIT OR Apache-2.0 |
| base64 | 0.22.1 | MIT OR Apache-2.0 |
| tempfile | 3.23.0 | MIT OR Apache-2.0 |
| zip | 2.4.2 | MIT |

Verbatim notices for all 71 external crates in Cargo.lock are retained under
`third-party/rust/`, including target-specific and build dependencies. The
resolved graph and license expressions are listed in
`third-party/RUST-LICENSE-INVENTORY.md`. For alternative license expressions,
the permissive MIT/Apache/BSD option is used where offered; retaining another
available license text does not select that alternative. r-efi's combined AUTHORS
file includes its MIT permission text. Zlib-licensed code retains its notices.

The statically linked Rust standard library's complete upstream attribution is
retained under `third-party/rust-standard-library/`, including its license texts.
`scripts/collect-notices.mjs` refreshes these notices from the installed toolchain
and locked downloaded crates during production builds.

Packaged applications include these notices in `resources/third-party/`.
Electron's LICENSE.electron.txt and LICENSES.chromium.html are retained in the
application directory. React and React DOM MIT notices accompany their bundled
renderer code. All fonts are supplied by the operating system; there are no CDN
fonts or runtime asset downloads.

## Windows native runtime

Native Windows CI builds use the MSVC Rust toolchain and Windows SDK.
For optional MinGW-w64/GCC cross-builds, toolchain attribution and the applicable
GCC runtime exception are retained under `third-party/windows-toolchain/`.
These notices do not imply that the native Windows build links MinGW components.

## Build and test dependencies

TypeScript, Vite, esbuild, electron-builder, Vitest, jsdom, Testing Library,
Playwright and archiver serve build/test purposes. Their resolved versions and
declared licenses are listed in `third-party/NPM-LICENSE-INVENTORY.md` and
package-lock.json. Source archives exclude node_modules, downloaded toolchains,
QA browsers, caches and compilation output. Advisory results, when checked, are
recorded in the release testing report and are only a point-in-time observation.

## Game content and screenshots

No EU5 game data files, original map rasters or saved user projects are included.
Synthetic fixtures are newly authored test data. The version 1.0.3 screenshots in
`docs/extras/workspace-*.png`, `docs/extras/edit-review.png` and the bundled manual
show the actual editor using fictional demonstration populations and an
illustrative, generated map. They do not include shipped EU5 game data or map
rasters. The project's AGPL license does not grant rights over third-party game
content that users load separately.

Europa Universalis V and associated marks/content belong to their owners. This
tool is not affiliated with or endorsed by Paradox Interactive.
