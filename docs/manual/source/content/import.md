The editor can propose conversion of supported older project JSON and existing mod population files. Correct baseline data is essential to distinguish your changes from the original game content.

## Import a mod population source

1. Load the **old vanilla game data** that the mod was based on.
2. Choose **Upgrade Project / Mod**, then **Import mod population source**.
3. Select the mod's replacement population source file.
4. Review the conversion proposal and unresolved records.
5. Confirm that the selected source is the correct baseline before committing the conversion.

Import compares the mod file against corresponding vanilla population data. It does not import every feature of an arbitrary mod. Non-population changes, missing locations and invalid identifiers remain unresolved and block conversion rather than being silently skipped.

## Import older project JSON

Supported legacy JSON uses the `eu5-pop-editor-project` format. Open the file against the matching old vanilla source, review the conversion proposal and confirm the baseline. Unsupported layouts or unresolved records must be addressed before conversion can be committed.

Keep the original file as a backup. Once conversion succeeds, use **Save As** to write a native `.eu5popproj` file.

## Move to newer game data

After conversion against the correct old baseline, use **Upgrade Project / Mod** to select the new vanilla game data. Review the separate migration plan using the normal [migration workflow](migration.html).

Do not start by loading new vanilla and treating it as the old mod's baseline. That can misrepresent game changes as your own modifications.
