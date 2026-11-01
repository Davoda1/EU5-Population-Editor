Use the country and location panels to find a population record. The map provides a visual alternative when compatible map data is available.

## Countries and locations

Countries are sorted by displayed name, with tags retained for identification. Search accepts either a name or a tag. When a readable country name is unavailable, the game identifier remains available.

The location list can be searched by name or key. Its filters help focus on modified or problematic records; pagination keeps large worlds manageable. Changing the selection does not apply a draft. Typed forms remain associated with their own location during navigation.

## Population comparisons

The comparison table joins groups from the available states, including groups added or removed by an edit. Review the location total as well as individual rows. Demographic filters change what you inspect; they do not themselves modify the population.

Original is the currently loaded source baseline. Working reflects confirmed changes. Draft shows a reviewed pending proposal when one exists.

## Index the map

Choose **Index map** when compatible map files are present. The first pass reads the location raster and builds a cache. Progress appears while indexing runs. Later selections reuse the index instead of scanning the whole world again.

The map supports dragging, scrolling, zoom buttons, arrow-key navigation when focused, and **Center**. Clicking an editable location selects its record. The selected location is highlighted.

## Map colors and editable locations

| Region | Appearance | Population editing |
| --- | --- | --- |
| Ordinary land | Country color; selected location highlighted | Available where the location data supports it |
| Water, including seas and lakes | Blue | Not editable |
| Corridors and impassable land | Dark grey | Not editable |

These classifications come from the loaded game definitions. Water takes precedence if a region also carries a corridor or impassable classification.

You can still drag and zoom over noneditable regions, and their location borders remain visible. Clicking water, a corridor or impassable land does not select it as a population-editing target.

An ordinary land location is not blocked just because it is unowned or has no current population. The geographic classification determines these restrictions, rather than the absence of an owner or a zero population total.


<figure class="theme-screenshot">
<img class="screenshot-light" src="assets/map-light.png" alt="EU5 Population Editor 1.0.3 displaying an indexed illustrative map with a fictional location selected." loading="lazy">
<img class="screenshot-dark" src="assets/map-dark.png" alt="EU5 Population Editor 1.0.3 displaying an indexed illustrative map with a fictional location selected." loading="lazy">
<figcaption>The actual editor's map panel using synthetic demonstration data and an illustrative map. The selected fictional location is highlighted. <a class="fullsize-light" href="assets/map-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark" href="assets/map-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

<figure class="theme-screenshot">
<img class="screenshot-light" src="assets/map-secondary-light.png" alt="A second fictional location selected on the editor's illustrative demonstration map." loading="lazy">
<img class="screenshot-dark" src="assets/map-secondary-dark.png" alt="A second fictional location selected on the editor's illustrative demonstration map." loading="lazy">
<figcaption>A second selection in the same synthetic demonstration world. These screenshots illustrate navigation and highlighting; your installed game provides the real geography during normal use. <a class="fullsize-light" href="assets/map-secondary-light.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a><a class="fullsize-dark" href="assets/map-secondary-dark.png" target="_blank" rel="noopener">Open full-size screenshot ↗</a></figcaption>
</figure>

## Map limitations

Missing or unsupported map resources can disable the map without preventing population editing. Shared or ambiguous RGB identifiers are reported rather than resolved by guesswork. Country colors can use deterministic fallback colors where reliable game colors are unavailable.

The cache is stored in the editor's user-data directory and is keyed to the map and definitions. Game files are not modified. See [Settings and shortcuts](settings.html) for the directory path.
