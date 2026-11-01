import { useState } from "react";
import { Dialog } from "../components/Dialog";
import type { MigrationPlan, Method, Params, Row } from "../types/api";
import { formatPeople, gameToPeople, hasFractionalPeople } from "../state/population-units";
const sourceRows = (rows: Row[]) => rows.map((row) => ({ ...row, people: gameToPeople(row.size) }));
export function MigrationDialog({
  plan,
  onPlan,
  onCommit,
  onClose,
  call,
  hasPendingDrafts = false,
}: {
  plan: MigrationPlan;
  onPlan: (p: MigrationPlan) => void;
  onCommit: () => void;
  onClose: () => void;
  call: <T>(method: Method, p?: Params) => Promise<T>;
  hasPendingDrafts?: boolean;
}) {
  const [ack, setAck] = useState(plan.acknowledged_topology),
    [mappings, setMappings] = useState<Record<string, string>>(
      plan.confirmed_tag_mappings,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog title="Review game-version migration" onClose={onClose} closeDisabled={busy} wide>
      <p>
        Working remains unchanged until Commit migration. Inspect old vanilla,
        old modified and new vanilla before resolving a conflict.
      </p>
      <p className="hint">Population counts are shown in people. Fractional source values are displayed exactly.</p>
      {hasPendingDrafts && (
        <p role="alert" className="error">
          Apply or discard all pending Draft edits before committing a migration.
          Close this review to return to your drafts.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="migration-counts">
        <span>
          {plan.items.filter((i) => i.classification.startsWith("Safe")).length}{" "}
          safe proposals
        </span>
        <span>{plan.items.filter((i) => !i.proposal).length} unresolved</span>
        <span>{plan.new_locations.length} new locations</span>
        <span>{plan.removed_locations.length} removed</span>
        <span>
          {Object.keys(plan.ownership_changes).length} ownership changes
        </span>
      </div>
      {plan.items.map((item) => (
        <details key={item.location} className="migration-item">
          <summary>
            <strong>{item.location}</strong> · {item.classification}{" "}
            {item.resolution && ` · ${item.resolution}`}
          </summary>
          <p>
            Old total {formatPeople(item.old_total)} → new total {formatPeople(item.new_total)} people. Exact
            ratio: {item.ratio || "undefined"}.
          </p>
          <div className="three-columns">
            {(
              [
                ["Old vanilla", item.old_vanilla],
                ["Old modified", item.old_modified],
                ["New vanilla", item.new_vanilla],
              ] as const
            ).map(([label, rows]) => (
              <section key={label}>
                <h3>{label}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Tuple</th>
                      <th>People</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>
                          {r.type} / {r.culture} / {r.religion}
                        </td>
                        <td>{formatPeople(r.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.some((row) => hasFractionalPeople(row.size)) && <p className="hint">Includes fractional source rows; no display rounding is applied.</p>}
                <details>
                  <summary>Full source fields (size in game units)</summary>
                  <p className="hint">The people field shows the exact count. Source size uses thousands of people.</p>
                  <pre>{JSON.stringify(sourceRows(rows), null, 2)}</pre>
                </details>
              </section>
            ))}
          </div>
          <label>
            Explicit resolution
            <select
              value={item.resolution || ""}
              disabled={busy}
              onChange={(e) =>
                void run(async () =>
                  onPlan(
                    await call<MigrationPlan>("upgrade_resolve", {
                      key: item.location,
                      choice: e.target.value,
                    }),
                  ),
                )
              }
            >
              <option value="" disabled>
                Select resolution…
              </option>
              <option value="keep_new">
                Keep new vanilla / acknowledge removal
              </option>
              {!item.classification.includes("removed") && !item.classification.includes("restricted location") && (
                <>
                  <option value="apply_old">Apply old modification</option>
                  <option value="scaled_old">
                    Apply scaled old modification
                  </option>
                </>
              )}
            </select>
          </label>
          {item.proposal && (
            <details>
              <summary>Proposed rows (people and source size)</summary>
              <p className="hint">The people field shows the exact count. Source size uses thousands of people.</p>
              <pre>{JSON.stringify(sourceRows(item.proposal), null, 2)}</pre>
            </details>
          )}
        </details>
      ))}
      <details>
        <summary>New, removed and reassigned locations</summary>
        <pre>
          {JSON.stringify(
            {
              new: plan.new_locations,
              removed: plan.removed_locations,
              ownership: plan.ownership_changes,
            },
            null,
            2,
          )}
        </pre>
      </details>
      {plan.tag_candidates.map((c) => (
        <label key={c.old_tag}>
          Possible replacement for {c.old_tag} (
          {c.ambiguous
            ? "ambiguous; explicit choice required"
            : "candidate; confirmation required"}
          )
          <select
            value={mappings[c.old_tag] || ""}
            disabled={busy}
            onChange={(e) =>
              setMappings({ ...mappings, [c.old_tag]: e.target.value })
            }
          >
            <option value="">No mapping; acknowledge tag removal</option>
            {c.candidates.map(([tag, overlap, same]) => (
              <option key={tag} value={tag}>
                {tag} · {overlap} shared locations
                {same ? " · matching localized name" : ""}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="check">
        <input
          type="checkbox"
          checked={ack}
          disabled={busy}
          onChange={(e) => setAck(e.target.checked)}
        />
        I reviewed new/removed locations, ownership changes and tag candidates.
        New locations retain new vanilla data.
      </label>
      <div className="dialog-actions">
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await call("upgrade_report", { format: "json" });
            })
          }
        >
          Export JSON report
        </button>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await call("upgrade_report", { format: "md" });
            })
          }
        >
          Export Markdown report
        </button>
        <button
          className="primary"
          disabled={busy || hasPendingDrafts || !ack || plan.items.some((i) => !i.proposal)}
          onClick={() =>
            void run(async () => {
              await call("upgrade_acknowledge", {
                acknowledge: ack,
                mappings: Object.fromEntries(
                  Object.entries(mappings).filter(([, v]) => v),
                ),
              });
              await call("upgrade_commit");
              onCommit();
            })
          }
        >
          Commit migration
        </button>
      </div>
    </Dialog>
  );
}
