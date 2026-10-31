import type { Location, Status, Params } from "../types/api";
import { percent, add, difference } from "../state/comparison";
export interface DraftForm {
  kind: "exact" | "scale" | "add" | "remove" | "rebalance";
  tuple: string;
  mode: string;
  value: string;
  type: string;
  culture: string;
  religion: string;
  axis: "culture" | "religion" | "type";
  weights: string;
  advanced: boolean;
  reviewed: boolean;
}
export const defaultForm = (loc: Location, status: Status): DraftForm => ({
  kind: "scale",
  tuple: Object.keys(loc.working)[0] || "",
  mode: "multiply",
  value: "1",
  type: status.definitions.type[0] || "",
  culture: status.definitions.culture[0] || "",
  religion: status.definitions.religion[0] || "",
  axis: "culture",
  weights: Object.entries(loc.working)
    .map(([, r]) => r.culture)
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((v) => `${v} = 1`)
    .join("\n"),
  advanced: false,
  reviewed: false,
});
export function operation(f: DraftForm): Params {
  switch (f.kind) {
    case "exact":
      return { kind: f.kind, tuple: f.tuple, mode: f.mode, value: f.value };
    case "remove":
      return { kind: f.kind, tuple: f.tuple };
    case "scale":
      return { kind: f.kind, mode: f.mode, value: f.value };
    case "add":
      return {
        kind: f.kind,
        type: f.type,
        culture: f.culture,
        religion: f.religion,
        size: f.value,
      };
    case "rebalance": {
      const weights: Record<string, string> = {};
      for (const line of f.weights.split("\n").filter((l) => l.trim())) {
        const m = line
          .trim()
          .match(/^([A-Za-z0-9_]+)\s*[=:]\s*(\d+(?:\.\d+)?)$/);
        if (!m)
          throw new Error(`Use identifier = weight on each line: ${line}`);
        if (m[1] in weights) throw new Error(`Duplicate group ${m[1]}`);
        weights[m[1]] = m[2];
      }
      return { kind: f.kind, axis: f.axis, weights, advanced: f.advanced };
    }
  }
}
export function DraftEditor({
  location,
  status,
  form,
  onChange,
  onReview,
  onApply,
  onDiscard,
  busy,
}: {
  location: Location;
  status: Status;
  form: DraftForm;
  onChange: (f: DraftForm) => void;
  onReview: () => void;
  onApply: () => void;
  onDiscard: () => void;
  busy: boolean;
}) {
  const change = (f: Partial<DraftForm>) =>
    onChange({ ...form, ...f, reviewed: false });
  let ratios: Record<string, string> = {};
  try {
    if (form.kind === "rebalance")
      ratios = operation(form).weights as Record<string, string>;
  } catch {
    /* invalid input remains visible */
  }
  const total = Object.values(ratios).reduce(add, "0");
  return (
    <section className="draft-editor">
      <fieldset disabled={busy}>
        <div className="section-head">
          <h2>Draft edit</h2>
          <span className="badge amber">
            {form.reviewed ? "Proposal ready" : "Not applied"}
          </span>
        </div>
        <p className="hint">
          Changes stay pending until Apply. Save and Export use confirmed
          Working values.
        </p>
        <label>
          Operation
          <select
            value={form.kind}
            onChange={(e) =>
              change({ kind: e.target.value as DraftForm["kind"] })
            }
          >
            <option value="exact">Exact demographic tuple</option>
            <option value="rebalance">Rebalance proportions</option>
            <option value="scale">Scale population total</option>
            <option value="add">Add population group</option>
            <option value="remove">Remove population group</option>
          </select>
        </label>
        {(form.kind === "exact" || form.kind === "remove") && (
          <label>
            Demographic tuple
            <select
              value={form.tuple}
              onChange={(e) => change({ tuple: e.target.value })}
            >
              {Object.entries(location.working).map(([k, r]) => (
                <option key={k} value={k}>
                  {r.religion} · {r.culture} · {r.type} ({r.size})
                </option>
              ))}
            </select>
          </label>
        )}
        {(form.kind === "exact" || form.kind === "scale") && (
          <>
            <label>
              Calculation
              <select
                value={form.mode}
                onChange={(e) => change({ mode: e.target.value })}
              >
                <option value="set">Set exact value / target</option>
                <option value="add">Add / subtract absolute value</option>
                <option value="percent">Increase / decrease percent</option>
                <option value="multiply">Multiply by factor</option>
              </select>
            </label>
            <label>
              {form.mode === "percent"
                ? "Percent (negative decreases)"
                : form.mode === "multiply"
                  ? "Multiplier"
                  : "Value"}
              <input
                aria-label="Draft value"
                inputMode="decimal"
                value={form.value}
                onChange={(e) => change({ value: e.target.value })}
              />
            </label>
          </>
        )}
        {form.kind === "add" && (
          <>
            {(["type", "culture", "religion"] as const).map((axis) => (
              <label key={axis}>
                {axis}
                <input
                  aria-label={`New ${axis}`}
                  list={`known-${axis}`}
                  value={form[axis]}
                  onChange={(e) => change({ [axis]: e.target.value })}
                />
                <datalist id={`known-${axis}`}>
                  {status.definitions[axis].map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </label>
            ))}
            <label>
              Size
              <input
                inputMode="decimal"
                value={form.value}
                onChange={(e) => change({ value: e.target.value })}
              />
            </label>
          </>
        )}
        {form.kind === "rebalance" && (
          <>
            <label>
              Redistribute by
              <select
                value={form.axis}
                onChange={(e) =>
                  change({ axis: e.target.value as DraftForm["axis"] })
                }
              >
                <option>culture</option>
                <option>religion</option>
                <option value="type">population type</option>
              </select>
            </label>
            <label>
              Weights or percentages
              <textarea
                rows={6}
                value={form.weights}
                onChange={(e) => change({ weights: e.target.value })}
                placeholder={"identifier_one = 7\nidentifier_two = 3"}
              />
            </label>
            <p className="hint">
              One identifier = weight per line. Omitted groups receive zero. New
              identifiers must exist in the loaded definitions.
            </p>
            <div className="normalized">
              {Object.entries(ratios).map(([k, v]) => (
                <span key={k}>
                  {k}: <strong>{percent(v, total)}</strong>
                </span>
              ))}
            </div>
            <details>
              <summary>Advanced preservation</summary>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.advanced}
                  onChange={(e) => change({ advanced: e.target.checked })}
                />
                Preserve each location-level complementary demographic bucket
              </label>
              <p className="hint">
                Default: preserve each group's internal structure. Advanced:
                redistribute each complementary bucket independently; rounding
                can slightly change the requested group percentages.
              </p>
            </details>
          </>
        )}
        {location.draft && (
          <div className="draft-preview" aria-live="polite">
            <div>
              Original <strong>{location.original_total}</strong>
            </div>
            <div>
              Working <strong>{location.working_total}</strong>
            </div>
            <div>
              Draft total <strong>{location.draft_total}</strong>
            </div>
            <div>
              Δ vs Working{" "}
              <strong>
                {difference(location.draft_total!, location.working_total)}
              </strong>
            </div>
            {!form.reviewed && (
              <p>Inputs changed. Review again before applying.</p>
            )}
          </div>
        )}
        <div className="draft-actions">
          <button onClick={onDiscard} disabled={busy}>
            Discard
          </button>
          <button onClick={onReview} disabled={busy}>
            Review draft
          </button>
          <button
            className="primary"
            onClick={onApply}
            disabled={busy || !form.reviewed || location.draft_token === null}
          >
            Apply
          </button>
        </div>
      </fieldset>
    </section>
  );
}
