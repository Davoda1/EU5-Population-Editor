A project records your confirmed population edits and the source information needed to detect incompatibilities. Saving a project is separate from exporting a mod.

## Save and Save As

**Save** writes the current project's confirmed Working state. **Save As** lets you choose another path and is useful for keeping checkpoints before larger edits.

The native file extension is `.eu5popproj`. The file includes source fingerprints, baselines for modified locations and the information used during migration. It does not bundle a complete game installation.

Pending drafts are excluded. Review and apply any draft you want to keep before saving. There is no autosave or crash-recovery system; save regularly.

## Reopen a project

Load the intended **Game Data** first, then choose **Open** and select the project. The editor verifies the project's structure and checksum. If the installed source data differs from the recorded baseline, editing and export are blocked until the difference is resolved through migration.

Do not manually edit the project JSON to bypass its checksum or source checks. Restore a known-good backup if the file is damaged.

## New projects and replacing work

**New Project** starts a clean project against the loaded game data. Loading another project or replacing current work can discard unsaved changes and drafts. The application prompts when current work needs attention; save a checkpoint before proceeding.

The editor uses a themed confirmation dialog when replacing unsaved work, exiting or restarting. **Cancel** keeps the current session open. **Discard** continues without saving. **Save Working** writes the confirmed changes before continuing; pending Draft edits are still excluded. If you want to keep a draft, cancel and Apply it first.

<figure class="theme-screenshot">
<img class="screenshot-light" src="assets/confirmation-light.png" alt="Themed unsaved-work dialog with Cancel, Discard and continue, and Save Working and continue buttons." loading="lazy">
<img class="screenshot-dark" src="assets/confirmation-dark.png" alt="Themed unsaved-work dialog with Cancel, Discard and continue, and Save Working and continue buttons." loading="lazy">
<figcaption>The 1.0.3 unsaved-work dialog, shown with synthetic demonstration data, distinguishes confirmed Working changes from pending Draft edits. <a class="fullsize-light" href="assets/confirmation-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark" href="assets/confirmation-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

## File compatibility

The public application's version number and the project format version are separate. Version 1.0.3 uses native project format 1. A project remains subject to schema, checksum and game-source checks regardless of the application version recorded in it. Project sizes remain in EU5 source units; the person-count interface does not reinterpret existing saved values or discard fractional precision.

See [Import existing population edits](import.html) for supported older JSON projects and mod population files. See [Migrate after a game update](migration.html) when the game data has changed.
