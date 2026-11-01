EU5 Population Editor is an offline desktop tool for inspecting and editing Europa Universalis V population data. Browse countries and editable locations, review exact changes, and export a separate mod.

<div class="workflow-cards"><div><strong>Inspect</strong><span>Compare the original game data with your confirmed work.</span></div><div><strong>Review</strong><span>Preview a draft before changing your project.</span></div><div><strong>Apply</strong><span>Confirm the proposal, save the project, then export a mod.</span></div></div>


<figure class="theme-screenshot">
<img class="screenshot-light" src="assets/workspace-light.png" alt="EU5 Population Editor 1.0.3 showing population groups for the fictional location Alpha, with counts in people." loading="lazy">
<img class="screenshot-dark" src="assets/workspace-dark.png" alt="EU5 Population Editor 1.0.3 showing population groups for the fictional location Alpha, with counts in people." loading="lazy">
<figcaption>The 1.0.3 editor shows Alpha's population of 123,450 people using synthetic demonstration data. The image follows the manual theme. <a class="fullsize-light" href="assets/workspace-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark" href="assets/workspace-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

Screenshots in this edition show the actual application with synthetic demonstration data: fictional countries and locations, and an illustrative map. They do not contain shipped EU5 game assets. Your installed game supplies the data and geography when you use the editor.

## Start here

<ul class="chapter-list"><li><a href="installation.html">Install the editor</a><span>Choose the Windows portable, Linux portable or Debian package.</span></li><li><a href="first-project.html">Create your first project</a><span>Load your game, select a location and make a reviewed edit.</span></li><li><a href="migration.html">Update an existing project</a><span>Compare old and new game data before carrying changes forward.</span></li></ul>

## What you can edit

Population groups are identified by population type, culture and religion. You can change a group's size, add or remove groups using the game's definitions, rebalance demographic proportions, and scale a location's total. The editor also provides location browsing, an optional interactive map, validation and change reports.

The editor changes population setup data through exported mods. It is not a save-game editor, ownership editor or full mod-development environment. Your installed game files remain read-only.

## Three states, one deliberate workflow

| State | Meaning | Saved and exported? |
| --- | --- | --- |
| Original | The loaded game data | Retained as the comparison baseline |
| Working | Your confirmed edits | Yes |
| Draft | A pending proposal | No; choose Apply first |

Population counts are displayed as **people**. For example, a game-file size of `1.25` is shown as `1,250` people. New absolute counts are entered as whole people; percentages, multipliers and ratio weights may use decimals. Existing fractional-person data is preserved and shown accurately rather than silently rounded. See [Draft and Apply](editing.html#population-units) for conversion and precision details.

## Offline manual

Choose **About → Manual** in the application to open the bundled manual in its own window. Chapters, screenshots, search and themes work without internet access. The bundled version matches the application that supplied it; an older installation therefore keeps its own instructions. **Online manual** in About and **Latest online manual** in the bundled manual's footer open the separately hosted site, which may describe a newer version.

## Compatibility

Compatibility with **EU5 v1.4.5** is confirmed. The initial supported-game-version setting is **1.4.5**, and can be changed for each installation. This manual setting does not automatically detect the game version or confirm compatibility with later versions. The editor validates the actual data and uses fingerprints to detect changes.

This manual covers application **1.0.3**. Europa Universalis V and its content belong to their respective owners. This is an unofficial tool, not affiliated with or endorsed by Paradox Interactive.
