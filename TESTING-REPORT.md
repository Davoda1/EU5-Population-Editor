# Testing

The [CI workflow](https://github.com/Davoda1/EU5-Population-Editor/actions/workflows/ci.yml) builds and tests the editor on Windows and Linux. Each run records results for its source commit. Successful builds retain package artifacts; failed runs upload available diagnostics.

## Automated coverage

- **Rust core:** parsing, game-data discovery, active bookmarks, confined includes, exact arithmetic, ratios, persistence, migration, source-preserving export, map indexing and geography-based editing restrictions.
- **Frontend and controllers:** country sorting and search, Draft/Working separation, confirmation decisions, settings persistence, renderer isolation and fixed external-link destinations.
- **Browser workflows:** editing, theme preview and cancellation, confirmation dialogs, settings keyboard navigation, and a non-scrolling welcome screen across supported window sizes.
- **Native desktop workflows:** the real Electron main process, preload bridge, renderer and Rust core; loading, editing, saving, export, migration, map indexing and hit testing, canceled or failed saves and saved exit; settings validation, per-installation versions, saved-installation loading, folder history, window placement and relaunch behavior.
- **Packaged applications:** desktop workflows repeated against the built applications, executable icons, archive contents, Debian layout, checksums and source inclusion.
- **Repository checks:** version and license consistency, source hygiene, locked dependencies and production compilation.

CI uses synthetic fixtures and does not require proprietary game files. The optional installation test can run against a local game directory; see [Building](BUILDING.md) for the test commands.

## Scope and limits

Compatibility with **EU5 v1.4.5** has been confirmed through maintainer verification. This is separate from the automated checks: CI does not launch the game or its launcher, and export validation checks the generated mod's structure and data.

The initial v1.4.5 preference records that confirmed game version. Exporting with 1.4.5 selected requires no unverified-version acknowledgment; selecting another game version requires that acknowledgment. The preference does not detect the installed version or override source-fingerprint checks. Later game versions and interactions with other mods require their own verification. Unsupported structures and ambiguous mappings are reported for review.

Map geography distinguishes water and lakes from corridors and impassable land. Classified regions are not editable population locations, while ordinary land is not blocked merely because it is unowned or has no current population. Water takes precedence where classifications overlap; navigation and visible location borders remain available.

Window restoration tests cover normal bounds, reset, disabled remembering and disconnected-display recovery. Native maximized-state restoration is checked on Windows; headless Linux test displays without a window manager cannot verify maximization.

Linux container desktop tests may use the test-only `EU5_QA_NO_SANDBOX` option. Distributed applications retain the Chromium sandbox and should be launched as an ordinary user.
