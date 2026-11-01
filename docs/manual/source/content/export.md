Export Mod creates a separate mod from confirmed Working changes. Exporting does not change the original installation or enable the mod in the game launcher.

## Before exporting

Apply all drafts you intend to include, save your project, and choose **Validate**. Read any issues and resolve problems that block compatibility or export. Select a destination outside the game installation.

## Export fields

| Field | What to enter |
| --- | --- |
| Name | A readable title for your mod |
| ID | A stable lowercase, folder-safe identifier |
| Version | Your mod's own version, such as `1.0.0` |
| Supported EU5 version | The saved manual version for the loaded installation; change it through **Game settings** |
| Optional ZIP | Whether to also create a ZIP of the generated mod |

Compatibility with **EU5 v1.4.5** is confirmed, and the initial supported-game-version value is **1.4.5**. **Supported EU5 version** displays the saved value. Use **Game settings** to open Settings, select the loaded installation, edit **Manual EU5 version**, and choose **Save settings**. A leading `v` is accepted and normalized when saved. The setting is remembered per installation without requiring an export.

This field is manual metadata. Changing it does not make incompatible game files compatible and does not replace a migration after an actual data change.

## Write the mod

With **1.4.5** selected, no unverified-version acknowledgment is required. If you select another game version, acknowledge that compatibility with that selected version has not been verified before exporting.

Choose **Choose output and export** and select the destination. The editor stages the output, reparses the population data and verifies the result before completing the export.

When **Remember project and export folders** is enabled in Settings, the output picker starts in the last export destination. That location is remembered separately from project folders.

An existing export directory is not recursively overwritten. Choose a new destination or move an older export after verifying what it contains.

## What is produced

The output contains the changed population source files with unchanged location content retained, `.metadata/metadata.json`, change reports, and the optional ZIP. Source UTF-8 BOM and line endings are preserved where applicable. Legacy descriptor files are not generated.

Change reports can also be exported individually as CSV, JSON or Markdown from the dialog.

Human-readable population reports use person counts. JSON reports retain their raw source-unit values and include explicitly named person-count fields, so existing integrations can distinguish the two representations. The exported EU5 population files continue to use the game's thousand-person source units. Displaying people does not change the file format or round untouched source data.

## Use the exported mod

Follow the mod-loading process supported by your installed game and launcher. EU5 v1.4.5 compatibility is confirmed. Keep a backup of your project; later game versions, changes to launcher conventions and interactions with other enabled mods require their own verification.

Do not copy the generated population files over your vanilla installation. Keep exported output separate from the source files used for editing and migration.
