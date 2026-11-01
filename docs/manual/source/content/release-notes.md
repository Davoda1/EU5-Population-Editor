Version 1.0.3 adds a bundled offline manual and shows population as people. It supports Windows and GNU/Linux x86-64 and retains project format 1 and the existing Draft, Apply, migration and export workflow.

## New in 1.0.3

- Open the application-matched manual in a separate local window, with offline chapters, screenshots, search and themes.
- Use the application's Appearance setting for the in-app manual, including previews and cancellation. The hosted manual retains its independent theme selector.
- Keep the hosted manual available as an explicit online option.
- Display and enter absolute population counts in people; percentage inputs, multipliers and ratio weights retain decimal support.
- Allocate new edits in one-person steps while preserving existing project/source values and their fractional precision when untouched.
- Report fractional legacy totals that cannot be rebalanced into whole people without an explicit total change.
- During standard rebalancing, use the positive location profile for a newly introduced demographic group, and restore retained zero-sized rows evenly without losing their additional fields.
- Require pending editing forms to be resolved before migration, including forms that have not yet been reviewed.
- Show people in human-readable reports while retaining source-unit values alongside labelled people fields in JSON reports.
- Include editable manual source, frozen generated pages and SHA-256 verification in the application source distribution.

## New in 1.0.2

- Update the desktop runtime to Electron 45.2.1 stable.
- Build with Node.js 26.13.0 LTS and its bundled npm.
- Refresh the application screenshots throughout this manual.

## New in 1.0.1

- Keep the welcome screen within the available window space without scrolling.
- Open Settings using the gear beside About, with Appearance, Game and Window sections.
- Preview System, Light or Dark appearance before saving; Cancel restores the saved theme.
- Type, paste or browse for an installation directory and save its manual EU5 version.
- Load the saved installation at startup, or turn automatic loading off.
- Restore normal window size, position and maximized state, with a reset option and recovery for changed display arrangements.
- Remember project and export folders separately, with an option to disable folder history.
- Show the loaded installation's saved game version in Export Mod and change it through Game settings.
- Refresh the manual's screenshots and add illustrated Settings and welcome-screen guidance.

## Features retained from 1.0.0

The first public release introduced the editing, migration and export capabilities below. They remain available in 1.0.3.

## Editing and review

- Browse countries alphabetically by name and search by country name or tag.
- Inspect population groups and Original, Working and Draft comparisons.
- Edit exact sizes, add or remove known groups, rebalance demographic proportions, and scale totals.
- Review and explicitly apply proposals; save and export use only confirmed Working state.
- Undo and redo confirmed changes after resolving pending drafts.

## Projects and game data

- Save checksummed `.eu5popproj` files with source fingerprints and migration baselines.
- Discover supported active setup layouts and follow confined setup includes.
- Review migration between old vanilla, modified and new vanilla data.
- Propose conversion of supported legacy JSON and mod population sources.
- Index compatible maps once and reuse the local cache.
- Render water and lakes blue, and corridors and impassable land dark grey, while retaining map navigation and location borders.
- Restrict population editing by geographic classification, with water precedence; ordinary unowned or empty land remains eligible.
- Remember the manually entered game version per installation, initially `1.4.5`.

## Export and packaging

- Export source-preserving population mods with metadata, reports and an optional ZIP.
- Use confirmed EU5 v1.4.5 compatibility; exporting for another selected game version requires an explicit unverified-version acknowledgment.
- Export change reports in CSV, JSON or Markdown and migration reports in JSON or Markdown.
- Provide Windows portable ZIP, Linux portable TAR.GZ and Debian packages with native entry executables.
- License original application and manual work under AGPL-3.0-only.

## Current limits

There is no autosave, save-game editing, automatic game-version detection or in-game mod activation. Confirmed v1.4.5 compatibility does not automatically extend to later game versions or combinations with other mods. Map and localization availability depend on the selected game data.

See the application repository's testing report for the verification performed for a particular build. Download availability and completed CI status are shown on the [application repository](https://github.com/Davoda1/EU5-Population-Editor).
