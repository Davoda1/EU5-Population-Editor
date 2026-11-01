![EU5 Population Editor](docs/extras/banner.png)

# EU5 Population Editor

Explore and edit Europa Universalis V population data with an offline desktop editor for **Windows 10/11** and **GNU/Linux**. Compare demographics, review changes, and export a separate mod while keeping the game installation untouched.

[![CI](https://github.com/Davoda1/EU5-Population-Editor/actions/workflows/build.yml/badge.svg?branch=master)](https://github.com/Davoda1/EU5-Population-Editor/actions/workflows/build.yml)

**Version 1.0.3** · **[Published downloads](https://github.com/Davoda1/EU5-Population-Editor/releases)** · **[Online manual](https://davoda1.github.io/EU5-Population-Editor-Manual/)** · **[Report an issue](https://github.com/Davoda1/EU5-Population-Editor/issues)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/extras/workspace-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/extras/workspace-light.png">
  <img src="docs/extras/workspace-light.png" alt="EU5 Population Editor 1.0.3 showing the fictional location Alpha, population counts in people and an illustrative map" width="1600">
</picture>

*Explore population groups and their location on the map. The editor supports system, light and dark themes. This 1.0.3 capture shows Alpha's 123,450 people using synthetic demonstration data.*

Screenshots show the actual application with fictional countries and locations and an illustrative map. They do not contain shipped EU5 game assets; your installed game provides the real data and geography during normal use.

## A clear editing workflow

- **Find a location.** Browse countries alphabetically, search by name or tag, and navigate the map with pan, zoom and location selection. Water and lakes appear blue; corridors and impassable land appear dark grey. These regions cannot be population-edited.
- **Compare every change.** See Original, Working and Draft values side by side. Review a Draft, then choose Apply or Discard.
- **Shape demographics.** Read and enter population counts as people. Edit individual groups, scale totals, or rebalance culture, religion and population-type ratios with exact arithmetic and whole-person allocation.
- **Keep control of your work.** Save projects, undo or redo confirmed changes, and export only confirmed Working values.
- **Handle game updates.** Review project and mod migrations, resolve conflicts, and validate changes before export.
- **Read the matching instructions offline.** Open **About → Manual** for the bundled edition in its own window, including search and screenshots. Its appearance follows the application's theme setting. **Online manual** opens the hosted website separately.

![Reviewing a population change in EU5 Population Editor 1.0.3 with synthetic demonstration data](docs/extras/edit-review.png)

*Pending Drafts stay separate from confirmed Working values until you choose Apply.*

## Get started

1. Extract the release archive and run the executable. Keep all extracted files together. Linux users can also install the Debian package.
2. Select your EU5 installation directory or its `game` subdirectory. In **Settings → Game**, you can also type or paste the path and save its manual game version. Saved game data loads automatically at startup unless disabled. The editor requires your own game data.
3. Choose a country and location, make an edit, and review the Draft.
4. Choose **Apply**, then save your project. Save regularly; there is no autosave. Pending Drafts are excluded from saves and exports.
5. Choose **Validate**, then **Export Mod** to create a separate mod outside the game installation.

EU5 **v1.4.5** is the established compatibility baseline, and application **1.0.3** retains it as the initial supported-game-version setting. You can change and save that label for each installation. Later game versions require separate verification. After updating the game, use **Upgrade Project / Mod** to review changes to the source data; changing the version label does not perform that migration. Apply or discard pending edits before committing a migration.

Population values in the interface are **people**: `1` person corresponds to `0.001` in EU5 files. Enter whole counts without separators in absolute input fields; percentages, factors and ratio weights can contain decimals. Percentage/factor results round to the nearest person, with halves rounded upward, and allocations preserve the rounded total. Existing fractional-person data is shown exactly and is not silently rewritten. Project format 1 and exported game-file units are unchanged.

Open the gear beside **About** for **Appearance**, **Game**, and **Window** settings. Preview System, Light or Dark appearance, then save or cancel. The editor can remember window size, position and maximized state, as well as separate project and export folders. **Reset window layout** returns to the default size and centered position. The welcome screen fits the window without scrolling.

Settings and map caches are stored in `%AppData%\eu5-population-editor` on Windows and `~/.config/eu5-population-editor` on Linux, respecting `XDG_CONFIG_HOME` when set. Projects are saved wherever you choose. The editor works offline, with no telemetry or runtime downloads.

## Packages and development

Release builds provide a Windows x64 portable ZIP, Linux x86-64 portable TAR.GZ, Debian amd64 package, source TAR.GZ, and a `SHA256SUMS` checksum manifest. Applications are unsigned.

See [Building](BUILDING.md) for prerequisites and build commands, [Contributing](CONTRIBUTING.md) to propose a change, and [Testing](TESTING-REPORT.md) for automated coverage and its limits. CI builds and tests both desktop platforms on pushes and pull requests targeting `master`.

## License

Copyright © 2026 davoda1. Original project code and documentation are licensed under **AGPL-3.0-only**. See [LICENSE.txt](LICENSE.txt) and [third-party notices](THIRD_PARTY_NOTICES.md).

EU5 Population Editor is an unofficial tool and is not affiliated with or endorsed by Paradox Interactive. Europa Universalis V, its trademarks and game content belong to their respective owners. Game data files are not distributed with the application.
