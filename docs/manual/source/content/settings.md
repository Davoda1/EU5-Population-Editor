Open **Settings** using the gear immediately to the right of **About**. Its three sections bring appearance, game data and window preferences together. Settings are stored locally, outside the application directory.

## Appearance

Choose **System**, **Light** or **Dark**. System follows your operating system's appearance and is the default. The preview changes immediately; choose **Save settings** to keep it, or **Cancel** to return to the saved appearance.

<figure class="theme-screenshot appearance-screenshot">
<img class="screenshot-light fixed-theme" src="assets/settings-appearance-light.png" alt="Appearance settings with Light selected." loading="lazy">
<img class="screenshot-dark fixed-theme" src="assets/settings-appearance-dark.png" alt="Appearance settings with Dark selected." loading="lazy">
<img class="screenshot-light system-theme" src="assets/settings-appearance-system-light.png" alt="Appearance settings with System selected, following a light operating-system theme." loading="lazy">
<img class="screenshot-dark system-theme" src="assets/settings-appearance-system-dark.png" alt="Appearance settings with System selected, following a dark operating-system theme." loading="lazy">
<figcaption>The Appearance section previews the selected theme before saving. <a class="fullsize-light fixed-theme" href="assets/settings-appearance-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark fixed-theme" href="assets/settings-appearance-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-light system-theme" href="assets/settings-appearance-system-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark system-theme" href="assets/settings-appearance-system-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

The in-app manual follows **Settings → Appearance**, including live previews and cancellation. It has no separate theme selector. The hosted manual has its own theme button, which cycles through system, light and dark independently of the application.

## Game installation and version

In **Game**, type or paste the **Installation directory**, or use **Browse…** to choose it with the operating system's folder picker. Select the Europa Universalis V installation root or its `game` subdirectory. Both refer to the same installation preference.

Enter the **Manual EU5 version** shown by the game, then choose **Save settings**. The initial value is `1.4.5`. Versions are remembered separately for each installation; a leading `v` is accepted and normalized when saved. The editor does not detect the version automatically.

<figure class="theme-screenshot">
<img class="screenshot-light" src="assets/settings-game-light.png" alt="Game settings with an installation directory, manual EU5 version and startup and folder preferences." loading="lazy">
<img class="screenshot-dark" src="assets/settings-game-dark.png" alt="Game settings with an installation directory, manual EU5 version and startup and folder preferences." loading="lazy">
<figcaption>Keep an installation and its manual version together. <a class="fullsize-light" href="assets/settings-game-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark" href="assets/settings-game-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

Use **Load saved installation** to load the saved data. Replacing an active session still asks you to resolve unsaved work. Saving settings alone does not replace the current project.

**Load saved game data on startup** is enabled by default. Disable it to open the welcome screen without loading an installation. The welcome screen offers **Load saved game data** when a directory has been saved. Startup loading prepares game data; it does not reopen a project file automatically. If the saved installation cannot be loaded, the editor reports the problem and leaves the welcome screen available so you can correct the directory in Settings.

**Remember project and export folders** is enabled by default. The editor remembers the last project folder and export destination separately, so choosing an export destination does not change the next project dialog's starting folder. Turn the option off to stop remembering these locations.

Export uses the saved manual version for the loaded installation. Compatibility with **EU5 v1.4.5** is confirmed; changing a version label does not confirm compatibility with another release. If the actual game data changes, use [project migration](migration.html) rather than changing the version to bypass a fingerprint mismatch.

## Window placement

In **Window**, **Remember window size and position** is enabled by default. It restores the normal window size and position, as well as whether the editor was maximized. Turn it off and save to clear the recorded placement and use the default centered window at the next start.

<figure class="theme-screenshot">
<img class="screenshot-light" src="assets/settings-window-light.png" alt="Window settings with remembered size and position enabled and a Reset window layout button." loading="lazy">
<img class="screenshot-dark" src="assets/settings-window-dark.png" alt="Window settings with remembered size and position enabled and a Reset window layout button." loading="lazy">
<figcaption>Window restoration can be disabled or reset independently of game data. <a class="fullsize-light" href="assets/settings-window-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark" href="assets/settings-window-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

Choose **Reset window layout**, then **Save settings**, to return to the default size and center the editor. If the display arrangement has changed, saved placement is adjusted to keep the window on an available display. The welcome screen fits the available space without scrolling; working panels and Settings can scroll within their own areas when needed.

## User-data locations

| Operating system | Default application directory |
| --- | --- |
| Windows | `%AppData%\eu5-population-editor` |
| GNU/Linux | `~/.config/eu5-population-editor` |

The application stores preferences, remembered game versions and its map cache here. On Linux, a custom XDG configuration directory can change the base location.

Your `.eu5popproj` files and exported mods are stored in the locations you explicitly choose. Back them up separately. Close the application before manually moving or removing its settings/cache directory.

## Application shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+S` | Save confirmed Working changes |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+O` | Open a project |
| Arrow keys while the map is focused | Pan the map |

Resolve pending drafts before undoing or redoing confirmed changes. The toolbar shows whether actions are available for the current state.

## Manual shortcuts

**About → Manual** opens the edition bundled with your installed application. Its search and illustrations run locally, and its appearance follows the application. Close its window to return to the editor; closing the manual does not change the current project. **Online manual** in About and **Latest online manual** in the bundled manual's footer open the hosted site separately.

The manual window menu provides Home (`Alt+Home`), Back (`Alt+Left`), Forward (`Alt+Right`) and zoom controls. Opening a full-size screenshot stays in the manual window; use Back to return to its chapter. Opening Manual again focuses the existing window. Closing the editor also closes its manual window.

Press `/` or `Ctrl+K` to open manual search. Use the arrow keys to move through results, Enter to follow a result and Escape to close the dialog. Search runs locally in your browser, including when the built manual is opened from disk.
