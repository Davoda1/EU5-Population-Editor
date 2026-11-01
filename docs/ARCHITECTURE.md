# Architecture

## Process boundaries

Electron main owns native file pickers, preferences, window geometry, sidecar lifecycle,
trusted-sender checks and output-path capabilities. It launches the packaged Rust
executable directly with an argument array, shell:false and NDJSON pipes. Bundled
paths derive from process.resourcesPath; development paths derive from app root.

The sandboxed preload exposes request, preferences, game-version settings, restart,
event subscription and fixed external-link actions.
The shared Method union is allowlisted independently in preload and main. Main
removes renderer-supplied path/cache fields and inserts paths obtained through
native file pickers or its own fixed application cache directory. Renderer code has
no Node APIs. Permissions, remote requests, webviews, new windows and navigation
are rejected. About actions pass only fixed destination identifiers through trusted
IPC: Manual opens the bundled guide, while repository, issues and Online manual
open their fixed URLs in the system browser. Arbitrary URLs are refused. Local
CSP forbids renderer connections, objects and forms.

React owns pending input forms keyed by location. `Review draft` asks the native
core to calculate a proposal. Rust stores it separately and issues a monotonically
increasing token. Apply requires that token. Inputs changed after review disable
Apply. Working-only save/export cannot access renderer forms or Rust drafts.
Main is informed of unreviewed form activity so close/replacement prompts include
text not yet submitted for a native preview. Migration commit is also blocked
while these forms or reviewed core Drafts are pending.

## Offline manual

`docs/manual/source/` contains the editable documentation snapshot;
`docs/manual/site/` contains its generated offline edition. A manifest pins the
application version and SHA-256 inventory of both. Ordinary builds validate this
snapshot without Python or network access. The explicit `bundle-manual.mjs`
maintainer command regenerates it from local source using Python and the manual's
pinned Markdown dependency, then replaces it only after validation succeeds.

Electron packages the generated edition at `resources/manual/` and serves it
through the private `eu5-manual://manual/` protocol in a separate window. The
protocol permits only manual resources, checks real paths, and supplies a local
content policy. There is no localhost server or listening port. Search, themes,
images and navigation work offline. This window has its own session, no preload,
no Node integration and no editor bridge; editor IPC also rejects its sender.
Network requests and downloads are blocked. Explicit links to the project's
GitHub repositories and hosted manual may open in the system browser.

The embedded manual follows the application's active Appearance setting,
including preview and cancellation. The protocol adds an allowlisted initial
theme value before page scripts run; a one-way event updates the open document
without navigation or loss of scroll position. The offline edition ignores
browser theme storage and has no independent theme selector. The hosted edition
retains its own local preference and theme button.

Repeated or concurrent opens reuse one manual window. Closing the guide leaves
editor forms and Working changes intact; closing the editor closes its guide.

## Core modules

- parser: UTF-8 token scanner, quoted-token distinction, nested AST and byte spans.
- model: game discovery, definitions, ownership, localization, population model.
- editing: rational arithmetic, decimal quantization, deterministic apportionment.
- project: confirmed deltas, baselines, checksummed atomic envelopes and converters.
- migration: immutable planning followed by explicit resolutions and commit.
- export: in-memory patches, reparsing, staged files, metadata/reports/ZIP.
- map: native raster pass, persistent RGB row cache, index, tiles and hit tests.
- ipc: long-lived session and commands, bounded requests, progress responses.

No Python or HTTP server is used at runtime. Core work runs outside the renderer.
The protocol is sequential within the native process: long indexing work emits
progress but queues other commands. Indexing cannot be canceled in version 1.0.3.
The renderer's event loop remains available while waiting.

## Parser and preservation

Nodes retain key/operator, atom/type prefix, children and original byte spans.
Comments and whitespace remain untouched in source strings. Pop templates retain
unknown nested fields. Rendering patches only the four known demographic field
values within each retained template. Modified location rendering retains
non-population nodes and surrounding trivia. Unrelated locations remain byte
identical. Population export reparses both in-memory and written outputs.

Unknown semantic fields form part of migration identity. Named assignments are
sorted for canonical comparison while bare list order remains conservative.
Identical demographic/unknown signatures aggregate sizes before comparison;
reordered rows do not create false conflicts. Quoted delimiters are not syntax.
Unsupported formats or duplicate authoritative locations are errors, not guesses.

## Exact mathematics

All IPC and project population numbers remain strings in EU5 thousand-person
units. The UI uses exact BigInt conversion to display people and convert whole
absolute inputs back to game units. Native arithmetic uses BigInt-backed
BigRational. Stored source decimals support at most 28 fractional places and
128 total characters; greater input precision fails explicitly.

New absolute population inputs must represent whole people (multiples of 0.001
game units). Decimal percentages, factors and ratio weights remain dimensionless.
New edited rows are allocated at three game-unit decimal places: one person.
Percentage/factor targets round to the nearest person, with halves upward for
nonnegative population. Floor plus descending fractional remainder distributes
the rounded target, breaking ties by stable index. Standard rebalancing preserves
the existing total; Advanced preserves every complementary bucket. Fractional
preserved totals are rejected with an explicit normalization instruction.

Existing fractional values are displayed exactly and flagged, including fractions
hidden in duplicate raw rows. Loading, saving, unchanged export and migration do
not normalize historical data. Generic scaling keeps caller-selected precision
for migration. Ratios and total scaling remain separate operations. Map geometry
may use ordinary coordinates; it does not affect population values.

Human-readable Markdown and CSV reports use exact people, including any preserved
legacy fractions. JSON reports retain existing raw game-unit objects and include
explicit unit metadata and additional people projections.

## Map cache

Raster bytes and named-location colors determine a SHA-256 cache identity. Index
schema version is checked. A full initial decode is bounded to 32768×16384 and
1 GiB decoder allocation. One raster pass builds bounds, pixel counts and sums
for centroids, and writes a flat RGB cache. Later viewport calls read selected rows
with file seeks and return a bounded PNG; clicks read one pixel. Selection never
scans the world again. Rendering uses deterministic owner colors and sampled
location borders. Water and lakes use blue; corridors and impassable land use
dark grey. Water classification takes precedence when definitions overlap.

Geography is determined from the loaded game definitions, independently of
ownership and population totals. Classified water, corridor and impassable
regions are not population-editing targets. Ordinary land remains eligible when
unowned or currently unpopulated. Pan and zoom remain usable over noneditable
regions, and location borders remain visible. Tiny features can disappear when
zoomed far out. Shared RGB assignments return multiple candidates, preventing
silent click selection.

## Persistence and failure boundaries

Projects store only confirmed modifications and required old baseline rows, not a
copy of the whole population source or game installation. Full location keys and
ownership memberships allow new/removed/topology review. A SHA-256 JSON envelope
detects accidental corruption; it is not an authenticity signature. Atomic saves
use a same-directory temporary file, sync and persist; Unix parent directory sync
is also requested. Output inside a canonicalized game root is refused.

Unsaved memory can be lost if the core crashes. Pending calls fail and the GUI can
restart the process, then reopen a saved project. Autosave/recovery is not
implemented. Working histories are in memory and bounded to 100 snapshots.
See TESTING-REPORT.md and the corresponding CI run for the test scope and
platform results.

## Application confirmations and icons

Unsaved-work decisions use themed renderer dialogs. Electron main owns each
request token and the pending operation; unissued, stale or duplicate responses
cannot authorize data loss. Cancel keeps the session open. Save Working performs
the normal project save before continuing, and does not apply pending Drafts.
Canceling the file picker or a save failure keeps the confirmation and session
open. Renderer interruption cancels a pending confirmation.

The shared map icon has an editable SVG master and multi-resolution PNG/ICO
exports. Windows packages edit executable resources without code signing; package
checks inspect the embedded icon frames. Linux packages install hicolor icons,
a matching desktop entry and a consistent application window class.
