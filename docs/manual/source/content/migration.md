When a game update changes the population source data, use Upgrade Project / Mod to review how your confirmed edits should carry forward. The editor does not silently replace incompatible data.

## Prepare

Save a backup of the project and resolve any pending drafts. Open the project, choose **Upgrade Project / Mod**, and select the new vanilla game installation. Planning compares the recorded old baseline with your modifications and the new source; it does not change Working until you commit.

Pending work includes a typed editing form that has not yet been reviewed, as well as a reviewed Draft. Apply or discard it before starting migration. A form from the old data is not carried into the new source generation.

A saved project can be opened for migration when its source fingerprint differs from the installed game, because it contains the old baseline. Normal editing and export remain blocked until the source difference is resolved. A remembered selection is cleared if the location is no longer editable.

## Understand the three versions

| Label | Meaning |
| --- | --- |
| Old vanilla (OV) | The saved baseline for the modified location |
| Old modified (M) | Your confirmed Working changes |
| New vanilla (NV) | The newly loaded game data |

Read the rows, totals, additional fields and proposed result for each item. Row reordering alone does not create a conflict.

## Classifications

| Classification | Proposed behavior |
| --- | --- |
| Safe — unchanged vanilla | Carry your confirmed changes forward unchanged |
| Safe — scaled to new vanilla | Scale the modified total by the new/old vanilla total ratio when the identity and other compatibility checks allow it |
| Conflict — manual review required | Require an explicit resolution for changed identities, unknown fields or incompatible source semantics |
| Conflict — removed location | Acknowledge removal; the editor does not recreate the missing location |
| Conflict — restricted location | Explicitly choose **Keep new vanilla** when the new game classifies the location as sea, lake, corridor or impassable land |

Scaling uses the whole-location total ratio when compatible identity sets match. It does not assume every new vanilla group changed by the same percentage.

## Resolve conflicts

The available resolutions include keeping new vanilla, applying the old modification, and applying the scaled old modification where valid. Inspect the proposed rows after resolving. Removed locations require their own explicit acknowledgment.

For a restricted location, **Keep new vanilla** is the only resolution. Old or scaled population edits cannot be applied to water, corridors or impassable land. The migration report retains the old edits for review; they are not silently discarded while planning.

Directly applying old ratios onto new vanilla and opening a conflict in a temporary normal editing workspace are not available in 1.0.3. You can keep new vanilla, commit the reviewed plan and then edit the location normally if it remains ordinary land eligible for population editing.

## Review world changes

Inspect added and removed locations, ownership changes and possible replacement country tags. New locations retain new vanilla data. Tag candidates are suggestions; even one candidate requires an explicit choice. No replacement is silently inferred.

Acknowledge that you reviewed the topology and tag changes before committing. A tag mapping updates remembered country selection; population migration remains keyed by location.

## Commit and save

Export the migration report as JSON or Markdown if you want a record before committing. **Commit migration** remains unavailable until required resolutions and review acknowledgments are complete.

Committing switches the project to the new source and clears undo history at that source boundary. Save the resulting project separately after commit. Closing the migration dialog without committing leaves the old Working project active.
