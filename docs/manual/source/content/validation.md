Validation checks the project's data and compatibility before export. Reports help you inspect confirmed changes and migration decisions outside the editor.

## Validate the project

Choose **Validate** to see the current state and listed issues. Each issue identifies the affected source or location, describes the problem and provides a suggested resolution.

A source fingerprint mismatch indicates that the loaded game data differs from the project baseline. Use migration instead of changing a version label to bypass the mismatch. Invalid demographic identifiers must be resolved against the loaded definitions.

Optional localization and map problems can disable those features while leaving population editing available. Read the affected-feature details rather than assuming every warning has the same effect.

## Change reports

Open **Export Mod** and choose **CSV report**, **JSON report** or **Markdown report**. These reports describe confirmed Working changes. They do not turn pending drafts into confirmed edits.

CSV is convenient for tables; JSON retains structured data; Markdown is useful for a readable change record. Save reports outside the game installation.

CSV and Markdown population values are labelled as people. JSON retains the raw source-unit values and provides separate person-count fields. A game-file source value of `1` represents `1,000` people; do not treat the two report fields as interchangeable. Existing fractional precision remains visible where present.

## Migration reports

Within a migration plan, export JSON or Markdown before committing. The report records the old baseline, modified and new rows, totals, scaling ratio, proposal and explicit resolutions.

A report is not a saved project or an exportable mod. Keep the native project if you intend to continue editing.

## Limits of a successful check

Compatibility with EU5 v1.4.5 is confirmed separately from the editor's automated validation. Validation checks the loaded data, and export additionally reparses and verifies generated population sources. These automated checks do not run the game. Later game versions and interactions with other mods require separate verification.
