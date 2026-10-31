import { useState } from "react";
import type { Location } from "../types/api";
import { comparison, summary, percent } from "../state/comparison";
export function Demographics({
  location,
  onEdit,
}: {
  location: Location;
  onEdit: (tuple: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [changed, setChanged] = useState(false),
    [culture, setCulture] = useState(""),
    [religion, setReligion] = useState(""),
    [type, setType] = useState("");
  const rows = comparison(location);
  const shown = rows.filter(
    (r) =>
      (!changed || r.delta !== "0") &&
      (!culture || r.row.culture === culture) &&
      (!religion || r.row.religion === religion) &&
      (!type || r.row.type === type) &&
      r.key.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="section-head">
        <h2>Demographics</h2>
        <span>{rows.length} combinations · EU5 size units</span>
      </div>
      <div className="filters">
        <input
          aria-label="Search demographic rows"
          placeholder="Search demographics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {(
          [
            ["culture", culture, setCulture],
            ["religion", religion, setReligion],
            ["type", type, setType],
          ] as const
        ).map(([axis, value, set]) => (
          <select
            aria-label={`Filter ${axis}`}
            key={axis}
            value={value}
            onChange={(e) => set(e.target.value)}
          >
            <option value="">All {axis}</option>
            {[...new Set(rows.map((r) => r.row[axis]))].sort().map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={changed}
            onChange={(e) => setChanged(e.target.checked)}
          />
          Changed only
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Culture</th>
              <th>Religion</th>
              <th className="num">Original</th>
              <th className="num">Working</th>
              <th className="num">Draft</th>
              <th className="num">Δ vs original</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className={r.delta !== "0" ? "changed" : ""}>
                <td>{r.row.type}</td>
                <td>{r.row.culture}</td>
                <td>{r.row.religion}</td>
                <td className="num">{r.original}</td>
                <td className="num">{r.working}</td>
                <td className="num draft-value">{r.draft ?? "—"}</td>
                <td className="num">{r.delta}</td>
                <td>
                  <button
                    disabled={!location.working[r.key]}
                    onClick={() => onEdit(r.key)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <p className="empty">No matching demographic rows.</p>
        )}
      </div>
      <div className="summaries">
        {(["culture", "religion", "type"] as const).map((axis) => {
          const o = summary(location.original, axis),
            w = summary(location.working, axis),
            d = location.draft ? summary(location.draft, axis) : {};
          return (
            <details key={axis}>
              <summary>
                {axis[0].toUpperCase() + axis.slice(1)} distribution
              </summary>
              <table>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Original</th>
                    <th>Working</th>
                    <th>Draft</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...new Set([
                      ...Object.keys(o),
                      ...Object.keys(w),
                      ...Object.keys(d),
                    ]),
                  ]
                    .sort()
                    .map((k) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td>{o[k] || "0"}</td>
                        <td>
                          {w[k] || "0"}{" "}
                          <small>
                            {percent(w[k] || "0", location.working_total)}
                          </small>
                        </td>
                        <td>{location.draft ? d[k] || "0" : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          );
        })}
      </div>
    </>
  );
}
