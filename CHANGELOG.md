# Changelog

## 1.0.3

- Display population counts, totals and differences as people, with exact conversion to the existing EU5 source units.
- Require whole-person absolute inputs and allocate newly calculated edit results to indivisible people. Decimal percentages, multipliers and ratio weights retain their meanings.
- Preserve existing fractional-person source/project data exactly until explicitly edited, with visible precision notices and safe rebalance validation.
- Restore zero-sized groups through standard rebalancing while retaining their demographic identities and extra fields.
- Block migration commit while typed or reviewed Draft edits are pending.
- Bundle a matching offline manual with local search, theme support and a separate application window. Keep the hosted manual available as an explicit online action.
- Follow the application's Appearance setting in the embedded manual, including previews and cancellation; keep the hosted manual's independent theme selector.
- Add version/hash verification and editable documentation source to the frozen manual snapshot, with no Python or documentation download required for ordinary application builds.
- Use people in human-readable reports while retaining raw game-unit fields and adding exact people projections in JSON reports.
- Retain explicit whole-person normalization even when duplicate demographic rows keep the same combined total, including through saving, imports and migration.
- Prevent stale navigation replies and overlapping edits from replacing newer Draft results; keep migration review locked while an action completes.
- Preserve the selected country when restoring a saved location and support valid identifiers that match JavaScript object property names.
- Support the bundled manual's Copy code buttons without allowing clipboard reads, and preserve manual snapshot hashes across Windows and Linux checkouts.
- Clarify the distinct Add Population Group and Rebalance ratios workflows in the manual.
- Retain project format 1, Node.js 26.13.0, npm 11.20.0 and Electron 45.2.1.

## 1.0.2

- Updated the build toolchain to Node.js 26.13.0 LTS and the desktop runtime to Electron 45.2.1 stable.
- Refreshed application and manual screenshots for 1.0.2.
- Retained the existing editing, settings, project and export workflows.

## 1.0.1

- Added a Settings dialog with Appearance, Game and Window sections, accessible from the gear beside About.
- Moved appearance controls into Settings, with immediate preview and Save/Cancel behavior.
- Added editable installation paths, native folder browsing and manual game versions saved per installation.
- Added optional automatic loading of the saved installation at startup.
- Added optional window size, position and maximized-state restoration, with a layout reset.
- Remembered project and export folders separately, with a shared opt-out.
- Made the welcome screen fit the available window area without scrolling.
- Updated the illustrated manual and application screenshots.

## 1.0.0

Initial public edition.

- Offline population and demographics editing with exact arithmetic.
- Alphabetical country names with name/tag search and location navigation.
- Explicit Draft, Review, Apply and Discard; Working-only project saves and exports.
- Population scaling, group editing and culture/religion/type ratio tools.
- Source-preserving mod export, validation and change reports.
- Reviewed project/mod upgrades with source fingerprints and conflict handling.
- Active-bookmark setup discovery, confined includes and ownership validation.
- Indexed map browsing and system/light/dark themes.
- Blue water/lakes and dark-grey corridor/impassable regions, with water precedence and geography-based editing restrictions; pan, zoom and borders remain available.
- Confirmed EU5 v1.4.5 compatibility, with an unverified-version acknowledgment required only when exporting for another selected game version.
- Editable, persistent per-installation game version, initially v1.4.5.
- Dedicated eu5-population-editor settings directory and illustrated user manual.
- Consistent application icons for native windows, taskbars, Windows EXE resources and Linux desktop entries.
- Themed in-app confirmation dialogs; canceled or failed saves retain the current work.
- AGPLv3 licensing, Windows/Linux CI and verified package layout gates.
