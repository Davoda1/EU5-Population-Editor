# Conservative OV / M / NV migration

OV is each modified location's persisted old vanilla baseline. M is its confirmed
Working modification. NV is a freshly loaded new vanilla installation. Drafts
never participate. Planning does not mutate the Working project or active source.
A saved project can open for migration despite a source-fingerprint mismatch,
using its embedded old baseline. Normal editing and export remain blocked until
the mismatch is resolved. A remembered selection of a restricted location is
cleared.

## Canonical identity

Rows are keyed by `(type,culture,religion)` plus canonical unknown-field semantics.
Size values are exact rational numbers and aggregate over identical signatures.
Row ordering and insignificant whitespace/comments do not affect equivalence.
Bare lists, duplicate assignments and mixed unknown blocks retain their order
conservatively; only dictionaries with unique keys can ignore field ordering. Non-pop
location semantics are compared separately.

## Classifications

1. **Safe — unchanged vanilla:** canonical OV and NV equal and non-pop location
   semantics equal. Propose M unchanged.
2. **Safe — scaled to new vanilla:** the canonical identity/signature sets equal,
   non-pop semantics equal and OV total is nonzero. Compute exact NV total / OV
   total, multiply M total, round at the maximum relevant precision and apportion
   deterministically across M. Identity-set equality determines whether proportional migration is supported;
   it does not require every NV row to have the same individual scale factor.
3. **Conflict — manual review required:** changed identities, unknown fields,
   non-pop semantics, or a nontrivial scale from zero. No default overwrite.
4. **Conflict — removed location:** retain old data in the report; require explicit
   keep-new/removal acknowledgment. Removed locations are not recreated.
5. **Conflict — restricted location:** NV classifies a previously editable
   location as sea, lake, corridor or impassable land. Retain OV and M in the
   report and require explicit keep NV. Applying M or scaled M is rejected;
   planning never silently removes the old edits.

The report stores OV/M/NV rows, totals, exact rational ratio, proposal and explicit
resolution. Implemented resolutions for eligible locations: keep NV, apply M,
apply scaled M. Restricted locations allow only explicit keep NV. Directly
reapplying old ratios onto NV and opening a conflict as a temporary normal-editor
workspace are not implemented in version 1.0.1. Users can retain NV, commit a
reviewed plan and then edit the resulting location normally if it remains
ordinary land eligible for population editing.

## Locations, ownership and tags

Persisted world keys detect added/removed locations. Persisted ownership sets
detect location membership changes. All new locations are reported and retain
NV data; there are no invented population rules.

For disappeared tags, candidates use old/new location overlap and equal localized
country names. Candidates are ordered by overlap, matching name and tag. Even one
candidate requires explicit user selection; ambiguity never triggers an automatic
mapping. User-confirmed mappings update remembered country selection. Population
migration itself is keyed by location and does not guess a tag-dependent rewrite.

The UI requires topology review acknowledgment before committing changes involving
new/removed locations, ownership differences or tag candidates. An empty mapping
means no replacement was chosen, not an inferred replacement. Modified
locations that are removed or restricted require their own explicit keep-new
resolution.

## Commit

The old/new fingerprints must still match the plan. Every modified-location item
must have a proposal. Required topology review must be acknowledged. The core
constructs a new Project against NV and validates each proposed row before swapping
it into session state. Drafts must be resolved first. Undo history is cleared at a
source boundary. Save is a separate action after commit.

Plans export as JSON and Markdown without committing. Cancellation merely leaves
the old Working project active. A later plan replaces the previous proposal.

## Old mod input

Load OLD vanilla first, import the mod's replacement population file, compare it
against the corresponding vanilla source and review conversion. Non-pop changes,
missing locations and invalid identifiers remain unresolved and block conversion.
Confirm the baseline, then select NEW vanilla through the ordinary migration UI.
No separate updater is needed.
