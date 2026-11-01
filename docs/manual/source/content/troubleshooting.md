Start with the message shown in the editor. Keep a backup of your project, and do not modify the vanilla installation while diagnosing a problem.

## The application does not start

For portable builds, confirm that you extracted the whole archive and retained its runtime files. Use the package for your operating system and x86-64 architecture. On Linux, review `RUNNING.txt` and the package manager's dependency messages. Launch as an ordinary desktop user.

If the downloaded file's SHA-256 does not match the release manifest, download it again. Do not mix files from two application versions.

## Game Data is rejected

Select the actual installation or `game` directory, not a saved project or exported mod. Confirm that the expected setup and definitions are present and readable. Steam Browse can help locate the installation.

The editor follows active setup bookmarks and safe nested includes. Multiple active start dates select the earliest with a warning; ambiguous equal-date selections and conflicting included sources are rejected. Unusual or changed data layouts may require an editor update.

## The saved installation does not load at startup

Open **Settings → Game** and check the installation directory. A moved installation, disconnected drive or missing files can prevent startup loading. Correct the path, save it and choose **Load saved installation**. Leave **Load saved game data on startup** enabled to try that installation automatically next time, or disable it to start at the welcome screen.

Saving a different installation in Settings does not replace the currently loaded data. Load the saved installation when you are ready to switch; the normal unsaved-work confirmation still applies.

## Window placement or appearance is unexpected

Use **Settings → Window → Reset window layout**, then **Save settings**, to restore the default centered layout. Turn off **Remember window size and position** if each launch should use that default. Restored windows are fitted to an available display when the monitor arrangement changes.

Use **Settings → Appearance** for **System**, **Light** or **Dark**. A theme preview is kept only after **Save settings**; **Cancel** restores the saved theme. The in-app manual follows these changes. The hosted manual's theme button is independent of the application.

## Country names or the map are missing

Population editing can continue when optional English localization or map data is unavailable. Identifiers remain usable. Load matching map files and choose **Index map** if the control is available. Ambiguous shared map colors are reported rather than guessed.

## A map region cannot be selected for editing

Blue water and lakes, and dark-grey corridors or impassable land, are not editable population locations. Dragging, zooming and location borders remain available over those regions. Ordinary unowned or empty land is not blocked solely because of ownership or population totals.

## Apply is disabled

Choose **Review draft** after the most recent input change. Resolve any invalid value or unknown identifier. A proposal must match the current inputs before Apply becomes available.

## Saved changes appear to be missing

Save and export include only confirmed Working values. Pending drafts are excluded. Verify that you applied the proposal and saved the intended project file. There is no autosave in 1.0.3.

## A legacy population total is not a whole number

Existing source data can represent a fraction of a person. The editor displays and preserves it. A rebalance cannot preserve a fractional total using only whole-person allocations; advanced preservation also checks each complementary bucket. Choose **Scale Population → Set exact value / target** to explicitly set a whole-person total, review and apply the result, then retry. See [Population units](editing.html#population-units).

## The online manual describes a different version

Use **Manual** in the installed application to read its bundled edition. The online site can describe a newer release. Offline chapters, search and images are included with the application and do not need Python or a local server. If bundled files are missing or fail their version check, extract the complete application archive into a clean directory instead of mixing resources from different releases.

## Source mismatch after a game update

Use **Upgrade Project / Mod** and select the new vanilla data. Changing Supported EU5 version affects metadata only and does not make the recorded source fingerprint match.

## Migration cannot be committed

Resolve every item without a proposal and acknowledge review of new/removed locations, ownership changes and country-tag candidates. Inspect errors for invalid choices or changed source files. Removed modified locations require explicit removal acknowledgment.

## Export is blocked

Check validation, the export fields and the supported game-version value. For a selected version other than 1.4.5, also acknowledge that compatibility with that version has not been verified. Choose a writable output directory outside the game installation. The editor will not recursively overwrite an existing export directory.

## Report a reproducible issue

Use the [application issue tracker](https://github.com/Davoda1/EU5-Population-Editor/issues). Include the application version, operating system, game version, action taken and exact error. Remove personal paths and details from reports or screenshots. Do not upload proprietary game files; use a minimal synthetic example where possible.

For incorrect instructions or a broken manual page, use the [manual issue tracker](https://github.com/Davoda1/EU5-Population-Editor-Manual/issues).
