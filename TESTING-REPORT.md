# Testing

The [CI workflow](https://github.com/Davoda1/EU5-Population-Editor/actions/workflows/build.yml) builds and tests the editor on Windows and Linux. Each run records results for its source commit. Successful builds retain package artifacts; failed runs upload available diagnostics.

## Local verification: 1.0.3

The checks below were run locally on Linux on 2026-11-01. CI records verification
results separately for each source commit.

| Check | Observed result |
| --- | --- |
| Rust tests, locked dependencies, Rust 1.99.1 | 71 passed; 1 installation-dependent test intentionally ignored |
| Frontend/controller tests | 87 passed across 13 test files |
| Browser workflows | All 7 passed, including minimum-size layouts and Draft separation |
| Production renderer/main/preload build | TypeScript, Vite and Electron compilation passed using Node 26.13.0 and npm 11.20.0 |
| Native Linux application | Editing, saving, export, migration, confirmations and settings workflows passed with Electron 45.2.1 and the real Rust sidecar |
| Unpacked Linux package | Built with the pinned tooling; all four desktop suites also passed against its packaged executable |
| Linux distribution packages | Portable TAR.GZ and Debian package built; packaged core protocol, icon consistency, runtime placement and the single regular ELF executable in /usr/bin verified |
| Offline manual window | All 15 chapters and 18 screenshot assets loaded; search, application theme synchronization, full-size images, Copy code, denied clipboard reads, renderer/IPC isolation, blocked networking, concurrent-open reuse and close/reopen lifecycle passed |
| Application-controlled manual theme | Saved initial theme, live Settings previews, Cancel, Save, System color changes, chapter navigation, reload/reopen and scroll retention verified; old manual theme storage ignored and no offline theme selector exposed. Hosted preference remains independent |
| Appearance illustration | System, Light and Dark preferences verified with both OS color schemes in hosted and offline HTML; live OS changes, full-size links, reload persistence and print checked. Updated native manual suite also passed in the packaged Linux application |
| Manual generation | Hosted and offline builds, link/search checks, chapter parity, reproducibility and simulated Windows newline translation passed |
| Windows checkout simulation | Frozen manual hashes remained valid after a Git checkout with core.autocrlf=true; CRLF and LF source copies generated identical bundled manifests |

### Corrections found during source review

- Applying whole-person normalization could silently discard the correction when
  duplicate demographic rows kept the same combined total. Regression coverage
  now follows that correction through Apply, undo/redo, project save/load, export,
  legacy/mod import and migration, while preserving untouched source fractions.
- Pending requests could overwrite newer UI state. Edit controls are locked
  during mutations, stale navigation replies are ignored, and migration review
  cannot be closed or altered while its operation completes.
- Restoring a saved location could persist the previous country selection.
  Restoration now uses the saved location's country explicitly.
- Valid game identifiers such as `constructor` and `__proto__` could collide with
  JavaScript object properties. Summaries, ratio weights and pending forms now
  handle those identifiers correctly.
- The bundled manual's Copy code buttons were blocked by the blanket permission
  policy. Only sanitized writes from the focused manual main frame are allowed;
  clipboard reads remain denied.
- Windows newline conversion could invalidate the frozen manual's hashes.
  Generation and bundle staging now use canonical LF text, with matching Git
  attributes and a regression test for Windows text-mode writes.
- Manual instructions now distinguish adding one exact population tuple from
  the profile allocation performed by Rebalance ratios.

New regression coverage rejects half-person absolute edits in both UI and core,
checks deterministic whole-person allocation and half-up target rounding,
restores zero-sized demographic groups without dropping their retained fields,
and blocks migration while an unreviewed form is present. It also verifies that
legacy fractional values survive project save/load, unaffected export and
migration, including fractions hidden inside duplicate demographic rows.

The browser-only suite used the existing `EU5_QA_CHROMIUM` override with the
previously prepared official Chrome for Testing 156.0.8078.80. Locked dependencies
and pinned toolchains were reused without changing project or CI pins. Desktop
checks used an isolated virtual display and the test-only `EU5_QA_NO_SANDBOX=1` setting;
they do not establish operating-system sandbox behavior on an ordinary desktop.

Native Windows execution and an in-game EU5 test were not included in this local
verification run. The installation-dependent Rust test was therefore not run.
The existing 1.4.5 compatibility baseline below does not represent a new in-game
compatibility test for 1.0.3.

## Automated coverage

- **Rust core:** parsing, game-data discovery, active bookmarks, confined includes, exact arithmetic, ratios, persistence, migration, source-preserving export, map indexing and geography-based editing restrictions.
- **Frontend and controllers:** country sorting and search, exact people conversion and input validation, Draft/Working separation, confirmation decisions, settings persistence, renderer isolation and fixed external-link destinations.
- **Browser workflows:** editing, theme preview and cancellation, confirmation dialogs, settings keyboard navigation, and a non-scrolling welcome screen across supported window sizes.
- **Native desktop workflows:** the real Electron main process, preload bridge, renderer and Rust core; loading, editing, saving, export, migration, map indexing and hit testing, canceled or failed saves and saved exit; settings validation, per-installation versions, saved-installation loading, folder history, window placement and relaunch behavior; the isolated offline manual's content, navigation, networking policy and lifecycle.
- **Packaged applications:** desktop workflows repeated against the built applications, executable icons, archive contents, Debian layout, checksums and source inclusion.
- **Repository checks:** version and license consistency, source hygiene, locked dependencies and production compilation.

CI uses synthetic fixtures and does not require proprietary game files. The optional installation test can run against a local game directory; see [Building](BUILDING.md) for the test commands.

## Scope and limits

Compatibility with **EU5 v1.4.5** has been confirmed through maintainer verification. This is separate from the automated checks: CI does not launch the game or its launcher, and export validation checks the generated mod's structure and data.

The initial v1.4.5 preference records that confirmed game version. Exporting with 1.4.5 selected requires no unverified-version acknowledgment; selecting another game version requires that acknowledgment. The preference does not detect the installed version or override source-fingerprint checks. Later game versions and interactions with other mods require their own verification. Unsupported structures and ambiguous mappings are reported for review.

Map geography distinguishes water and lakes from corridors and impassable land. Classified regions are not editable population locations, while ordinary land is not blocked merely because it is unowned or has no current population. Water takes precedence where classifications overlap; navigation and visible location borders remain available.

Window restoration tests cover normal bounds, reset, disabled remembering and disconnected-display recovery. Native maximized-state restoration is checked on Windows; headless Linux test displays without a window manager cannot verify maximization.

Linux container desktop tests may use the test-only `EU5_QA_NO_SANDBOX` option. Distributed applications retain the Chromium sandbox and should be launched as an ordinary user.
