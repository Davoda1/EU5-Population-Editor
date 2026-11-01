# Source layout

- `.github/`: automatic Windows/Linux CI, release workflow and issue/PR templates.
- `core/`: Rust parser, discovery, exact arithmetic, project persistence, migration, export, map indexing and synthetic tests.
- `electron/`: native application lifecycle, sandboxed preload, settings, trusted IPC, isolated offline-manual window and fixed external-link destinations.
- `src/`: React interface, country navigation, editors, comparisons and styling.
- `tests/`: frontend, browser and native desktop tests using synthetic game data.
- `scripts/`: reproducible builds, notices, packaging, source hygiene and release checks.
- `assets/`: application icon masters and native icon formats.
- `docs/`: architecture, project format, migration algorithm, README artwork/screenshots in `extras/`, and the matching editable/generated manual snapshot in `manual/`.
- `third-party/`: retained dependency and toolchain licenses and inventories.
- `LICENSE.txt`, `NOTICE.txt`, `THIRD_PARTY_NOTICES.md`: application and dependency terms.
- `BUILDING.md`, `CONTRIBUTING.md`, `SECURITY.md`, `TESTING-REPORT.md`: contributor and verification guidance.

`package-lock.json` and `core/Cargo.lock` pin dependencies. The source archive
includes the source and CI files; caches, downloaded tools, game files, saved
projects and generated binaries are excluded.
