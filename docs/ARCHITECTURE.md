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
are rejected. About links pass only fixed destination identifiers through trusted
IPC to the system browser; arbitrary URLs are refused. Local CSP forbids renderer connections, objects and forms.

React owns pending input forms keyed by location. `Review draft` asks the native
core to calculate a proposal. Rust stores it separately and issues a monotonically
increasing token. Apply requires that token. Inputs changed after review disable
Apply. Working-only save/export cannot access renderer forms or Rust drafts.
Main is informed of unreviewed form activity so close/replacement prompts include
text not yet submitted for a native preview.

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
progress but queues other commands. Indexing cannot be canceled in version 1.0.1.
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

All IPC and project numbers are strings. Native arithmetic uses BigInt-backed
BigRational. Decimal input supports at most 28 fractional places and 128 total
characters; greater input precision fails explicitly. There is no floating-point
population calculation. Operations use at least source precision (minimum three
fractional places for newly apportioned values). A rounded target is allocated
with floor plus descending fractional remainders, breaking ties by stable index.
Ratios and total scaling are separate operations. Map geometry may use ordinary
coordinates; it does not affect population values.

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
