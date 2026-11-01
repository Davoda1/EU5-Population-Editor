import appIcon from "../../assets/icon.svg";
import settingsGear from "../../assets/settings-gear.svg";
import { version } from "../../package.json";
import { useState, useEffect, useRef, useCallback } from "react";
import type {
  Status,
  Location,
  LocationList,
  Issue,
  MigrationPlan,
  Method,
  Params,
  ConfirmationPrompt,
  AppSettings,
} from "../types/api";
import { Dialog } from "../components/Dialog";
import { SettingsDialog } from "../components/SettingsDialog";
import { Welcome } from "../components/Welcome";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { Demographics } from "../features/Demographics";
import {
  DraftEditor,
  DraftForm,
  defaultForm,
  operation,
} from "../features/DraftEditor";
import { MapPanel } from "../features/MapPanel";
import { MigrationDialog } from "../features/MigrationDialog";
import { difference, percent } from "../state/comparison";
import { formatPeople, gameToPeople } from "../state/population-units";
export function App() {
  const [status, setStatus] = useState<Status | null>(null),
    [location, setLocation] = useState<Location | null>(null),
    [country, setCountry] = useState(""),
    [countrySearch, setCountrySearch] = useState(""),
    [search, setSearch] = useState(""),
    [mode, setMode] = useState("all"),
    [offset, setOffset] = useState(0),
    [list, setList] = useState<LocationList>({ total: 0, items: [] }),
    [forms, setForms] = useState<Record<string, DraftForm>>({}),
    [theme, setTheme] = useState<"auto" | "light" | "dark">("auto"),
    [settings, setSettings] = useState<AppSettings | null>(null),
    [settingsTab, setSettingsTab] = useState<"appearance" | "game" | "window">("appearance"),
    [busy, setBusy] = useState("Starting editor"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [modal, setModal] = useState(""),
    [confirmation, setConfirmation] = useState<ConfirmationPrompt | null>(null),
    [validation, setValidation] = useState<{
      state: string;
      issues: Issue[];
    } | null>(null),
    [plan, setPlan] = useState<MigrationPlan | null>(null),
    [legacy, setLegacy] = useState<{
      unresolved: Record<string, unknown>;
      warnings: string[];
      project: { changes: Record<string, unknown> };
    } | null>(null),
    [baseline, setBaseline] = useState(false),
    [savedGameVersion, setSavedGameVersion] = useState(""),
    [exportOpts, setExportOpts] = useState({
      name: "Population adjustments",
      id: "population-adjustments",
      version: "1.0.0",
      supported_game_version: "",
      zip: true,
      acknowledge_unverified_version: false,
    });
  const verifiedGameVersion = /^v?1\.4\.5$/i.test(exportOpts.supported_game_version.trim());
  const startupStarted = useRef(false);
  const locationTicket = useRef(0),
    listTicket = useRef(0);
  const call = useCallback(
    <T,>(m: Method, p: Params = {}) => window.eu5.request<T>(m, p),
    [],
  );
  const failed = useCallback(
    (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    [],
  );
  const refresh = useCallback(async () => {
    const s = await call<Status>("status");
    setStatus(s);
    return s;
  }, [call]);
  const syncGameVersion = async () => {
    const preference = await window.eu5.gameVersion();
    setSavedGameVersion(preference.version);
    setExportOpts((options) => ({
      ...options,
      supported_game_version: preference.version,
      acknowledge_unverified_version: false,
    }));
  };
  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    // An earlier navigation response must not replace a newer mutation result.
    ++locationTicket.current;
    setBusy(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      failed(e);
    } finally {
      setBusy("");
      setProgress(null);
    }
  };
  const select = async (key: string, selectedCountry = country) => {
    const ticket = ++locationTicket.current;
    try {
      const l = await call<Location>("location", { key });
      if (ticket !== locationTicket.current) return;
      setLocation(l);
      await call("select", { country: selectedCountry, location: key });
    } catch (e) {
      if (ticket === locationTicket.current) failed(e);
    }
  };
  const resetView = (s: Status) => {
    ++locationTicket.current;
    setStatus(s);
    setLocation(null);
    setForms({});
    setCountry(s.selected_country || "");
    setSearch("");
    setOffset(0);
    if (s.selected_location) void select(s.selected_location, s.selected_country || "");
  };
  useEffect(() => {
    const unsubscribe = window.eu5.onEvent((event) => {
      if (event.event === "confirmation") setConfirmation(event.data as unknown as ConfirmationPrompt);
      if (event.event === "confirmation-closed") setConfirmation((current) => current?.token === event.data.token ? null : current);
      if (event.event === "project-saved") setStatus(event.data.status as unknown as Status);
      if (event.event === "operation-error") setError(String(event.data.message));
      if (event.event === "progress") setProgress(Number(event.data.percent));
      if (event.event === "crash") {
        setError(String(event.data.message));
        setBusy("");
      }
    });
    if (!startupStarted.current) {
      startupStarted.current = true;
      void (async () => {
        try {
          const p = await window.eu5.settings();
          setSettings(p);
          setTheme(p.theme);
          if (p.autoLoad && p.gameDir) setBusy("Loading saved game data");
          const s = await window.eu5.startup();
          if (s) {
            resetView(s);
            await syncGameVersion();
            setValidation(await call("validate"));
            setNotice("Saved game data loaded. Select a country and location.");
          }
        } catch (e) {
          failed(e);
        } finally {
          setBusy("");
          setProgress(null);
        }
      })();
    }
    return unsubscribe;
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (!status) return;
    const id = ++listTicket.current;
    const timer = setTimeout(() => {
      void call<LocationList>("locations", {
        country,
        search,
        mode,
        offset,
        limit: 100,
      })
        .then((l) => {
          if (id === listTicket.current) setList(l);
        })
        .catch(failed);
    }, 100);
    return () => clearTimeout(timer);
  }, [
    country,
    search,
    mode,
    offset,
    status?.modified,
    status?.drafts,
    status?.fingerprint,
  ]);
  useEffect(() => {
    void call("draft_activity" as Method, {
      active: Object.keys(forms).length > 0,
    }).catch(() => {});
  }, [forms]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (modal || confirmation || plan || legacy) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (status)
          void run("Saving project", async () => {
            const s = await call<Status | null>("save", { saveAs: e.shiftKey });
            if (s) {
              setStatus(s);
              setNotice(
                "Project saved. Working changes only; Drafts remain pending.",
              );
            }
          });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (status) void open();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const load = (saved = false) =>
    run("Loading game data", async () => {
      const s = await call<Status | null>(saved ? "load_saved_game" : "load_game");
      if (s) {
        resetView(s);
        await syncGameVersion();
        setSettings(await window.eu5.settings());
        setValidation(await call("validate"));
        setNotice("Game data loaded. Select a country and location.");
      }
    });
  const open = () =>
    run("Opening project", async () => {
      const s = await call<Status | null>("open");
      if (s) {
        resetView(s);
        setValidation(await call("validate"));
      }
    });
  const formFor = (key: string) => Object.hasOwn(forms, key) ? forms[key] : undefined;
  const form = location ? formFor(location.key) : undefined;
  const setForm = (f: DraftForm) => {
    if (location) {
      // Notify main immediately, before a rapid native-window close can arrive.
      void call("draft_activity", { active: true }).catch(failed);
      setForms((old) => ({ ...old, [location.key]: f }));
    }
  };
  const clearForm = (key: string) =>
    setForms((old) => {
      const copy = { ...old };
      delete copy[key];
      return copy;
    });
  const edit = (tuple?: string, kind?: DraftForm["kind"]) => {
    if (location && status?.compatible && !busy) {
      const f = formFor(location.key) || defaultForm(location, status);
      setForm({
        ...f,
        kind: kind || "exact",
        tuple: tuple || f.tuple,
        mode: tuple ? "set" : f.mode,
        value: tuple ? gameToPeople(location.working[tuple].size) : f.value,
        reviewed: false,
      });
    }
  };
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <img className="brand-mark" src={appIcon} alt="" width="44" height="44" />
          <div>
            <h1>Population &amp; Demographics</h1>
            <span>EUROPA UNIVERSALIS V · EDITOR {version}</span>
          </div>
        </div>
        <div className="header-status">
          <span
            className={`status-dot ${status?.compatible === false ? "bad" : ""}`}
          />
          {status
            ? status.compatible
              ? `${status.modified} modified · ${status.dirty ? "Unsaved changes" : "Saved"}`
              : "Source mismatch"
            : "No game data"}
        </div>
      </header>
      <nav className="toolbar" aria-label="Project toolbar">
        <button
          disabled={!status || !!busy}
          onClick={() =>
            void run("New project", async () => {
              const s = await call<Status | null>("new_project");
              if (s) resetView(s);
            })
          }
        >
          New Project
        </button>
        <button disabled={!status || !!busy} onClick={() => void open()}>
          Open
        </button>
        <button
          disabled={!status || !!busy}
          onClick={() =>
            void run("Saving project", async () => {
              const s = await call<Status | null>("save");
              if (s) {
                setStatus(s);
                setNotice(
                  "Saved confirmed Working state. Draft edits remain pending.",
                );
              }
            })
          }
        >
          Save
        </button>
        <button
          disabled={!status || !!busy}
          onClick={() =>
            void run("Saving project as", async () => {
              const s = await call<Status | null>("save", { saveAs: true });
              if (s) setStatus(s);
            })
          }
        >
          Save As
        </button>
        <span className="separator" />
        <button disabled={!!busy} onClick={() => void load()}>
          Game Data
        </button>
        <button
          disabled={!status || !!busy}
          onClick={() => setModal("upgrade")}
        >
          Upgrade Project / Mod
        </button>
        <button
          disabled={!status || !!busy}
          onClick={() =>
            void run("Validating", async () => {
              setValidation(await call("validate"));
              setModal("validation");
            })
          }
        >
          Validate
        </button>
        <button
          disabled={!status?.compatible || !!busy}
          className="primary"
          onClick={() => setModal("export")}
        >
          Export Mod
        </button>
        <span className="separator" />
        <button
          disabled={
            !status?.undo ||
            !!busy ||
            !!status?.drafts ||
            Object.keys(forms).length > 0
          }
          onClick={() =>
            void run("Undo", async () => {
              await call("undo");
              await refresh();
              if (location) await select(location.key);
            })
          }
        >
          Undo
        </button>
        <button
          disabled={
            !status?.redo ||
            !!busy ||
            !!status?.drafts ||
            Object.keys(forms).length > 0
          }
          onClick={() =>
            void run("Redo", async () => {
              await call("redo");
              await refresh();
              if (location) await select(location.key);
            })
          }
        >
          Redo
        </button>
        <div className="toolbar-end">
          <button onClick={() => setModal("help")}>About</button>
          <button className="gear-button" title="Settings" aria-label="Settings" disabled={!!busy || !settings} onClick={() => { setSettingsTab("appearance"); setModal("settings"); }}><img src={settingsGear} alt="" width="21" height="21" /></button>
        </div>
      </nav>
      {error && (
        <div className="error banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
          <button
            onClick={() =>
              void run("Restarting core", async () => {
                if (!(await window.eu5.restart())) return;
                setStatus(null);
                setLocation(null);
                setForms({});
              })
            }
          >
            Restart core
          </button>
        </div>
      )}
      {busy && (
        <div className="busy banner" role="status">
          {busy}
          {progress !== null ? ` · ${progress}%` : ""}
          <progress max={100} value={progress ?? undefined} />
        </div>
      )}
      {!status ? (
        <Welcome settings={settings} busy={!!busy} onLoad={() => void load(!!settings?.gameDir)} onSettings={() => { setSettingsTab("game"); setModal("settings"); }} />
      ) : (
        <main className="workspace">
          <aside className="navigation">
            <h2>Browse world</h2>
            <label>
              Country search
              <input
                placeholder="Tag or localized name…"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All countries / unowned</option>
              {status.countries
                .filter((c) =>
                  (c.tag + " " + c.name)
                    .toLowerCase()
                    .includes(countrySearch.toLowerCase()),
                )
                .sort((a, b) =>
                  a.name.localeCompare(b.name, "en", { sensitivity: "base" }) ||
                  a.tag.localeCompare(b.tag, "en"),
                )
                .map((c) => (
                  <option key={c.tag} value={c.tag}>
                    {c.name} ({c.tag})
                  </option>
                ))}
            </select>
            <div className="section-head">
              <h3>Locations</h3>
              <small>{list.total}</small>
            </div>
            <input
              aria-label="Search locations"
              placeholder="Name or location key…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
            <div className="segmented">
              {[
                ["all", "All"],
                ["modified", "Modified"],
                ["warnings", "Warnings"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={mode === value}
                  onClick={() => {
                    setMode(value);
                    setOffset(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="location-list" aria-label="Locations">
              {list.items.map((l) => (
                <button
                  disabled={!!busy}
                  key={l.key}
                  aria-current={
                    location?.key === l.key ? "location" : undefined
                  }
                  onClick={() => void select(l.key)}
                >
                  <span>{l.name}</span>
                  <small>{l.key}</small>
                  <i>
                    {l.draft || formFor(l.key)
                      ? "Draft"
                      : l.modified
                        ? "Edited"
                        : ""}
                  </i>
                </button>
              ))}
            </div>
            <div className="pagination">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                Previous
              </button>
              <span>
                {list.total ? offset + 1 : 0}–
                {Math.min(offset + 100, list.total)}
              </span>
              <button
                disabled={offset + 100 >= list.total}
                onClick={() => setOffset(offset + 100)}
              >
                Next
              </button>
            </div>
            <button
              disabled={!!busy}
              onClick={() =>
                void run("Reading legacy project", async () => {
                  const p = await call<typeof legacy>("legacy_plan");
                  if (p) {
                    setLegacy(p);
                    setBaseline(false);
                  }
                })
              }
            >
              Import legacy project
            </button>
          </aside>
          <div className="location-workspace">
            {location ? (
              <>
                <section className="location-heading">
                  <div>
                    <span className="eyebrow">
                      {location.owners?.join(" · ") || "NO OWNER"}
                    </span>
                    <h2>{location.name}</h2>
                    <code>{location.key}</code>
                  </div>
                  <div className="location-tools">
                    <button
                      disabled={!status.map_available || !!busy}
                      onClick={() =>
                        void run("Indexing map", async () => {
                          await call("map_index");
                          await refresh();
                          await select(location.key);
                        })
                      }
                    >
                      {status.map_indexed ? "Refresh map index" : "Index map"}
                    </button>
                    <button
                      disabled={!status.compatible || !!busy}
                      onClick={() => edit(undefined, "add")}
                    >
                      Add Population Group
                    </button>
                  </div>
                </section>
                <div className="totals">
                  <div>
                    <span>Original vanilla · people</span>
                    <strong>{formatPeople(location.original_total)}</strong>
                  </div>
                  <div>
                    <span>Confirmed Working · people</span>
                    <strong>{formatPeople(location.working_total)}</strong>
                  </div>
                  <div className="draft-total">
                    <span>Pending Draft · people</span>
                    <strong>{location.draft_total === null ? "—" : formatPeople(location.draft_total)}</strong>
                  </div>
                  <div>
                    <span>Working Δ / %</span>
                    <strong>
                      {formatPeople(difference(
                        location.working_total,
                        location.original_total,
                      ))}{" "}
                      <small>
                        {percent(
                          difference(
                            location.working_total,
                            location.original_total,
                          ),
                          location.original_total,
                        )}
                      </small>
                    </strong>
                  </div>
                </div>
                <div className="edit-buttons">
                  <button
                    disabled={!status.compatible || !!busy}
                    onClick={() => edit(undefined, "rebalance")}
                  >
                    Rebalance ratios
                  </button>
                  <button
                    disabled={!status.compatible || !!busy}
                    onClick={() => edit(undefined, "scale")}
                  >
                    Scale Population
                  </button>
                  <button
                    disabled={!status.compatible || !!busy}
                    onClick={() => edit(undefined, "remove")}
                  >
                    Remove group
                  </button>
                  <span>
                    Drafts stay with their location when you navigate.
                  </span>
                </div>
                <div className="content-columns">
                  <section className="demographics-card">
                    <Demographics
                      location={location}
                      editDisabled={!status.compatible || !!busy}
                      onEdit={(tuple) => edit(tuple)}
                    />
                  </section>
                  {form && (
                    <DraftEditor
                      location={location}
                      status={status}
                      form={form}
                      onChange={setForm}
                      busy={!!busy}
                      onReview={() =>
                        void run("Calculating draft", async () => {
                          const key = location.key;
                          const l = await call<Location>("preview", {
                            key,
                            operation: operation(form),
                          });
                          setLocation(l);
                          setForms((old) => ({
                            ...old,
                            [key]: { ...form, reviewed: true },
                          }));
                          await refresh();
                        })
                      }
                      onApply={() =>
                        void run("Applying confirmed edit", async () => {
                          const key = location.key;
                          const l = await call<Location>("apply", {
                            key,
                            token: location.draft_token,
                          });
                          setLocation(l);
                          clearForm(key);
                          await refresh();
                          setNotice(
                            "Edit applied to Working. Save to preserve your project.",
                          );
                        })
                      }
                      onDiscard={() =>
                        void run("Discarding draft", async () => {
                          const key = location.key;
                          setLocation(await call("discard", { key }));
                          clearForm(key);
                          await refresh();
                        })
                      }
                    />
                  )}
                </div>
                <MapPanel
                  location={location}
                  onSelect={(key) => {
                    if (!busy) void select(key);
                  }}
                  onError={failed}
                />
              </>
            ) : (
              <div className="empty location-empty">
                <h2>Select a location</h2>
                <p>
                  Choose a country, search its locations and inspect the
                  original demographics.
                </p>
                {!status.compatible && (
                  <p className="error">
                    This project uses another source fingerprint. Use Upgrade
                    Project before editing or exporting.
                  </p>
                )}
              </div>
            )}
          </div>
        </main>
      )}
      <footer>
        <span>
          {notice ||
            "Unofficial tool · Not affiliated with or endorsed by Paradox Interactive"}
        </span>
        <span>
          {validation?.state || "Not validated"}
          {status
            ? ` · Source ${status.fingerprint.slice(0, 12)} · ${Math.max(status.drafts, Object.keys(forms).length)} pending`
            : ""}
        </span>
      </footer>
      {modal === "settings" && settings && <SettingsDialog settings={settings} initialTab={settingsTab} onPreviewTheme={value => { setTheme(value); void window.eu5.previewTheme(value).catch(failed); }} onClose={() => setModal("")} onSaved={async updated => {
        setSettings(updated);
        setTheme(updated.theme);
        if (status) await syncGameVersion();
        setNotice("Settings saved on this device.");
        setModal("");
      }} onLoad={() => { setModal(""); void load(true); }} />}
      {modal === "upgrade" && (
        <Dialog title="Upgrade Project / Mod" onClose={() => setModal("")}>
          <p>
            For an existing project, select the new vanilla game installation to
            build a reviewable migration plan.
          </p>
          <button
            disabled={!!busy}
            onClick={() =>
              void run("Preparing migration", async () => {
                const p = await call<MigrationPlan | null>("upgrade_plan");
                if (p) {
                  setModal("");
                  setPlan(p);
                }
              })
            }
          >
            Select new vanilla for this project
          </button>
          <h3>Import an old mod first</h3>
          <p>
            Load the OLD vanilla game snapshot through Game Data, then select
            the mod's replacement population file. Conversion requires explicit
            baseline confirmation and preserves unresolved data for review.
          </p>
          <button
            disabled={!!busy}
            onClick={() =>
              void run("Reading existing mod", async () => {
                const p = await call<typeof legacy>("import_mod_plan");
                if (p) {
                  setLegacy(p);
                  setBaseline(false);
                  setModal("");
                }
              })
            }
          >
            Import mod population source
          </button>
        </Dialog>
      )}
      {modal === "validation" && validation && (
        <Dialog title={validation.state} onClose={() => setModal("")} wide>
          {validation.issues.map((i, n) => (
            <article className="validation-issue" key={n}>
              <strong>
                {i.location ? `${i.location}: ` : ""}
                {i.message}
              </strong>
              <p>
                <code>{i.file}</code> · Affects: {i.feature}
              </p>
              <p>{i.resolution}</p>
            </article>
          ))}
        </Dialog>
      )}
      {confirmation && <ConfirmationDialog key={confirmation.token} prompt={confirmation} />}
      {modal === "help" && (
        <Dialog
          title="EU5 Population & Demographics Editor"
          onClose={() => setModal("")}
        >
          <p>Version {version} · Copyright © 2026 davoda1</p>
          <p>Maintained by davoda1.</p>
          <p>
            Licensed under the GNU Affero General Public License version 3 only.
            Third-party components retain their own licenses; notices are included
            with the source and packages.
          </p>
          <p>
            Unofficial third-party tool for Europa Universalis V. Not affiliated
            with or endorsed by Paradox Interactive.
          </p>
          <h3>Workflow</h3>
          <p>
            Country → Location → Inspect → Draft Edit → Review → Apply. Save and
            Export use only confirmed Working values. Ratios preserve the total;
            scaling changes it separately.
          </p>
          <p>
            Ctrl+S saves. Ctrl+Shift+S opens Save As. Ctrl+O opens a project.
            Population counts use people. Enter whole people for absolute edits;
            the editor converts exactly to EU5 source units when exporting a mod.
            Existing fractional source values remain visible without rounding.
          </p>
          <div className="dialog-actions">
            <button onClick={() => void window.eu5.openLink("manual").catch(failed)}>Manual</button>
            <button onClick={() => void window.eu5.openLink("online-manual").catch(failed)}>Online manual</button>
            <button onClick={() => void window.eu5.openLink("repository").catch(failed)}>Source code</button>
            <button onClick={() => void window.eu5.openLink("issues").catch(failed)}>Report an issue</button>
          </div>
        </Dialog>
      )}
      {modal === "export" && (
        <Dialog
          title="Export confirmed Working changes"
          onClose={() => setModal("")}
        >
          <p>
            {status?.modified || 0} modified locations. All pending Draft values
            are excluded.
          </p>
          {(["name", "id", "version"] as const).map(
            (k) => (
              <label key={k}>
                {
                  {
                    name: "Mod name",
                    id: "Stable folder-safe ID",
                    version: "Mod version",
                    supported_game_version: "Supported EU5 version",
                  }[k]
                }
                <input
                  value={exportOpts[k]}
                  onChange={(e) =>
                    setExportOpts({
                      ...exportOpts, [k]: e.target.value,
                    })
                  }
                />
              </label>
            ),
          )}
          <label>Supported EU5 version<input value={savedGameVersion} readOnly /></label>
          <p>Uses the saved manual version of the loaded installation.</p>
          <button disabled={!!busy} onClick={() => { setSettingsTab("game"); setModal("settings"); }}>Game settings</button>
          <label className="check">
            <input
              type="checkbox"
              checked={exportOpts.zip}
              onChange={(e) =>
                setExportOpts({ ...exportOpts, zip: e.target.checked })
              }
            />
            Include ZIP
          </label>
          {verifiedGameVersion ? <p>Compatibility verified with EU5 v1.4.5.</p> : <label className="check">
            <input
              type="checkbox"
              checked={exportOpts.acknowledge_unverified_version}
              onChange={(e) =>
                setExportOpts({
                  ...exportOpts,
                  acknowledge_unverified_version: e.target.checked,
                })
              }
            />
            I understand that this game version has not been verified and will test the exported mod in-game.
          </label>}
          <div className="dialog-actions">
            <button
              disabled={!!busy}
              onClick={() =>
                void run("Writing change report", async () => {
                  await call("change_report", { format: "csv" });
                })
              }
            >
              CSV report
            </button>
            <button
              disabled={!!busy}
              onClick={() =>
                void run("Writing change report", async () => {
                  await call("change_report", { format: "json" });
                })
              }
            >
              JSON report
            </button>
            <button
              disabled={!!busy}
              onClick={() =>
                void run("Writing change report", async () => {
                  await call("change_report", { format: "md" });
                })
              }
            >
              Markdown report
            </button>
            <button
              className="primary"
              disabled={
                !!busy ||
                (!verifiedGameVersion && !exportOpts.acknowledge_unverified_version) ||
                !exportOpts.supported_game_version.trim() ||
                !status?.modified
              }
              onClick={() =>
                void run("Exporting mod", async () => {
                  const supported_game_version = (await window.eu5.gameVersion()).version;
                  const r = await call<{ path: string } | null>("export", {
                    options: { ...exportOpts, supported_game_version },
                  });
                  if (r) {
                    setNotice(`Verified export written to ${r.path}`);
                    setModal("");
                  }
                })
              }
            >
              Choose output and export
            </button>
          </div>
        </Dialog>
      )}
      {plan && (
        <MigrationDialog
          plan={plan}
          hasPendingDrafts={Object.keys(forms).length > 0 || !!status?.drafts}
          onPlan={setPlan}
          onClose={() => setPlan(null)}
          call={call}
          onCommit={() => {
            setPlan(null);
            void run("Loading migrated project", async () => {
              resetView(await refresh());
              await syncGameVersion();
              setSettings(await window.eu5.settings());
              setValidation(await call("validate"));
            });
          }}
        />
      )}
      {legacy && (
        <Dialog
          title="Review project / mod conversion"
          onClose={() => setLegacy(null)}
        >
          <p>
            {Object.keys(legacy.project.changes).length} transferable locations;{" "}
            {Object.keys(legacy.unresolved).length} unresolved.
          </p>
          {legacy.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {Object.keys(legacy.unresolved).length > 0 && (
            <details>
              <summary>Unresolved source data (retained)</summary>
              <p className="hint">Raw size fields below use EU5 game units: 1 source unit equals 1,000 people.</p>
              <pre>{JSON.stringify(legacy.unresolved, null, 2)}</pre>
            </details>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={baseline}
              onChange={(e) => setBaseline(e.target.checked)}
            />
            The loaded game data is the old vanilla snapshot used by this legacy
            project.
          </label>
          <button
            className="primary"
            disabled={
              !baseline || Object.keys(legacy.unresolved).length > 0 || !!busy
            }
            onClick={() =>
              void run("Importing project", async () => {
                const s = await call<Status | null>("legacy_commit", {
                  confirm_baseline: true,
                });
                if (s) {
                  resetView(s);
                  setLegacy(null);
                }
              })
            }
          >
            Confirm conversion
          </button>
        </Dialog>
      )}
    </div>
  );
}
