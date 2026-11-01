Start with one location and a small change. Review its original, working and draft values before exporting a mod.

## Load your game data

1. Choose **Game Data** or **Select EU5 game data** on the opening screen.
2. Browse to your Europa Universalis V installation directory or its `game` subdirectory.
3. Wait for loading to finish and read any reported issues.

The editor checks the selected folder's contents. A folder name alone does not establish compatibility. Steam library suggestions help locate the game, but you can browse to another installation, including a path containing spaces or non-ASCII characters.

You can also open the gear beside **About**, choose **Game**, and type or paste the installation path. Save its manual version, then choose **Load saved installation**. The editor remembers the installation for the next start by default. See [Settings](settings.html#game-installation-and-version) to change startup behavior.

<figure class="theme-screenshot">
<img class="screenshot-light" src="assets/welcome-light.png" alt="EU5 Population Editor 1.0.3 welcome screen with the Settings gear beside About." loading="lazy">
<img class="screenshot-dark" src="assets/welcome-dark.png" alt="EU5 Population Editor 1.0.3 welcome screen with the Settings gear beside About." loading="lazy">
<figcaption>The 1.0.3 welcome screen fits the window without scrolling. <a class="fullsize-light" href="assets/welcome-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark" href="assets/welcome-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

## Select a location

Choose a country from the alphabetically ordered list, or search by its name or tag. Select a location from the list. The population table shows the demographic groups and the **Original**, **Working** and **Draft** comparisons.

You can use **All countries / unowned** to remove the country filter. The optional map is another way to navigate; it is not required for editing.

## Make a reviewed edit

1. Choose **Edit** beside a population group.
2. Select a calculation, such as **Increase / decrease percent**, and enter `10` for a ten-percent increase.
3. Choose **Review draft**.
4. Inspect the proposed size, the location total and the differences from Working.
5. Choose **Apply** to confirm, or **Discard** to abandon the proposal.

Changing a draft input invalidates its previous review. Review it again before applying. A draft is not included in saved projects or exported mods.

## Save your project

Choose **Save As** and select a location for a `.eu5popproj` file outside the game installation. Save again after later changes. There is no autosave or crash-recovery feature in this version.

## Export when ready

Choose **Validate** to review any issues. Then choose **Export Mod**, complete its fields and select a separate output directory. See [Export a mod](export.html) before using the result with your game.

Exporting produces a separate mod; it does not install or enable the mod in the launcher and does not modify the game's original files.
