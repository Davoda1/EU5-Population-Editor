# Bundled manual 1.0.3

This frozen snapshot supplies the manual shipped with application 1.0.3.

- `source/` contains the editable chapter, asset and generator source.
- `site/` contains the matching generated offline edition. It is packaged as `resources/manual/`.
- `manifest.json` records the exact SHA-256 inventory for both trees.

Normal application builds verify the snapshot with `node scripts/check-manual.mjs`; they need no Python, local server or manual download.

To refresh it from the local manual repository, install its pinned build dependency, set `EU5_MANUAL_PYTHON` if necessary, and run `node scripts/bundle-manual.mjs /path/to/manual` from the application source root. To regenerate from this included source instead, pass `docs/manual/source`. The command validates the version, builds and checks a temporary copy, and replaces the snapshot only after verification succeeds. Do not edit generated pages or their hash inventory independently.

The hosted edition uses the same source with `python scripts/build.py`; the bundled edition uses `--offline`. Both have the same chapter text, illustrations and local search. Original documentation is AGPL-3.0-only; preserve the included third-party notices.
