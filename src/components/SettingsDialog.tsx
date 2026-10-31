import { useEffect, useId, useRef, useState } from "react";
import type { AppSettings, AppSettingsUpdate } from "../types/api";

type Tab = "appearance" | "game" | "window";
const tabs: [Tab, string][] = [["appearance", "Appearance"], ["game", "Game"], ["window", "Window"]];
const pathKey = (path: string) => {
  const value = path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[a-z]:\//i.test(value) || value.startsWith("//") ? value.toLowerCase() : value;
};
function validVersion(value: string) {
  const clean = value.trim().replace(/^v/i, "");
  const parts = clean.split(".").map(Number);
  return /^\d{1,5}\.\d{1,5}\.\d{1,5}(?:\.\d{1,5})?$/.test(clean) && parts.every(part => part <= 65535) && parts.some(part => part > 0);
}
function Icon({ name }: { name: Tab | "info" | "close" }) {
  return <svg className="settings-icon" viewBox="0 0 24 24" aria-hidden="true">{
    name === "appearance" ? <><path d="M12 3a9 9 0 1 0 9 9c0-1.7-1.1-2.5-2.4-2.5h-1.8a1.8 1.8 0 0 1-1.4-2.9A2.2 2.2 0 0 0 13.7 3Z" /><circle cx="7.5" cy="10" r=".8" /><circle cx="11" cy="6.7" r=".8" /><circle cx="7.5" cy="15" r=".8" /></> :
    name === "game" ? <path d="M3 7V5h6l2 2h10v13H3Z" /> :
    name === "window" ? <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /></> :
    name === "close" ? <path d="m6 6 12 12M18 6 6 18" /> : <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>
  }</svg>;
}

export function SettingsDialog({ settings, initialTab = "appearance", onPreviewTheme, onSaved, onClose, onLoad }: {
  settings: AppSettings;
  initialTab?: Tab;
  onPreviewTheme: (theme: AppSettings["theme"]) => void;
  onSaved: (settings: AppSettings) => Promise<void>;
  onClose: () => void;
  onLoad: () => void;
}) {
  const [draft, setDraft] = useState<AppSettingsUpdate>({
    theme: settings.theme, gameDir: settings.gameDir, gameVersion: settings.gameVersion,
    autoLoad: settings.autoLoad, rememberWindow: settings.rememberWindow, rememberFolders: settings.rememberFolders,
  });
  const [tab, setTab] = useState<Tab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [error, setError] = useState("");
  const [resetWindow, setResetWindow] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const lookup = useRef(0);
  const versions = useRef(new Map([[pathKey(settings.gameDir), settings.gameVersion]]));
  const latestDraft = useRef(draft);
  latestDraft.current = draft;
  useEffect(() => {
    const node = ref.current!;
    const priorFocus = document.activeElement as HTMLElement | null;
    node.showModal();
    return () => {
      ++lookup.current;
      node.close();
      priorFocus?.focus();
    };
  }, []);
  const close = () => {
    if (saving || browsing) return;
    onPreviewTheme(settings.theme);
    onClose();
  };
  const changeDirectory = (gameDir: string) => {
    const current = latestDraft.current;
    versions.current.set(pathKey(current.gameDir), current.gameVersion);
    const key = pathKey(gameDir);
    const remembered = versions.current.get(key);
    setDraft(old => ({ ...old, gameDir, gameVersion: remembered || "1.4.5" }));
    setError("");
    const ticket = ++lookup.current;
    setLookingUp(!remembered && !!gameDir.trim());
    if (remembered || !gameDir.trim()) return;
    void window.eu5.installationVersion(gameDir.trim()).then(preference => {
      if (ticket !== lookup.current) return;
      versions.current.set(key, preference.version);
      setDraft(old => ({ ...old, gameVersion: preference.version }));
    }).catch(() => {
      // Full installation validation is performed when the settings are saved.
    }).finally(() => { if (ticket === lookup.current) setLookingUp(false); });
  };
  const selectTab = (next: Tab, focus = false) => {
    setTab(next);
    if (contentRef.current) contentRef.current.scrollTop = 0;
    if (focus) ref.current?.querySelector<HTMLButtonElement>(`[data-settings-tab="${next}"]`)?.focus();
  };
  const invalidVersion = !!draft.gameDir.trim() && !validVersion(draft.gameVersion);
  const invalidPath = draft.gameDir.length > 4096 || /[\u0000-\u001f]/.test(draft.gameDir);
  const changedGame = draft.gameDir.trim() !== settings.gameDir || draft.gameVersion.trim() !== settings.gameVersion;
  const save = async () => {
    if (saving || browsing || lookingUp || invalidVersion || invalidPath) return;
    setSaving(true);
    setError("");
    try {
      const updated = await window.eu5.settings({ ...draft, gameDir: draft.gameDir.trim(), resetWindow });
      onPreviewTheme(updated.theme);
      await onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };
  return <dialog ref={ref} className="settings-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <header className="settings-header"><div><h2 id={titleId}>Settings</h2><p>Appearance, game data and startup.</p></div><button type="button" className="settings-close" onClick={close} disabled={saving || browsing} aria-label="Cancel and close settings"><Icon name="close" /></button></header>
      <div className="settings-layout">
        <nav className="settings-nav" role="tablist" aria-label="Settings sections" aria-orientation="vertical" onKeyDown={event => {
          const index = tabs.findIndex(([name]) => name === tab);
          let next = index;
          if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % tabs.length;
          else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault(); selectTab(tabs[next][0], true);
        }}>
          {tabs.map(([name, label]) => <button type="button" key={name} data-settings-tab={name} id={`${titleId}-${name}-tab`} role="tab" aria-selected={tab === name} aria-controls={`${titleId}-${name}-panel`} tabIndex={tab === name ? 0 : -1} className="settings-tab" onClick={() => selectTab(name)}><Icon name={name} />{label}</button>)}
          <div className="settings-nav-note"><span>YOUR PREFERENCES</span>Saved on this device.</div>
        </nav>
        <div className="settings-content" ref={contentRef}>
          <fieldset disabled={saving || browsing}>
            <section role="tabpanel" id={`${titleId}-appearance-panel`} aria-labelledby={`${titleId}-appearance-tab`} hidden={tab !== "appearance"}>
              <h3>Make yourself at home.</h3><p className="section-description">Choose the appearance that suits your workspace.</p>
              <div className="theme-choices" role="radiogroup" aria-label="Theme">
                {([["auto", "System"], ["light", "Light"], ["dark", "Dark"]] as const).map(([value, label]) => <label className="theme-option" key={value}>
                  <input type="radio" name="theme" value={value} checked={draft.theme === value} aria-label={`${label} theme`} onChange={() => { setDraft(old => ({ ...old, theme: value })); onPreviewTheme(value); }} />
                  <span className={`theme-sample sample-${value}`} aria-hidden="true"><i className="sample-bottom" /></span><span className="theme-name">{label}<span className="theme-check" aria-hidden="true" /></span>
                </label>)}
              </div>
              <p className="theme-caption">System follows your operating system’s light or dark appearance.</p>
              <div className="subtle-note"><Icon name="info" /><span>The preview updates immediately. Save settings to keep your choice, or Cancel to return to the previous appearance.</span></div>
            </section>
            <section role="tabpanel" id={`${titleId}-game-panel`} aria-labelledby={`${titleId}-game-tab`} hidden={tab !== "game"}>
              <h3>Your EU5 installation</h3><p className="section-description">Keep your game folder and its version together.</p>
              <label className="field-label" htmlFor={`${titleId}-directory`}>Installation directory</label>
              <div className="path-entry"><input id={`${titleId}-directory`} type="text" value={draft.gameDir} onChange={event => changeDirectory(event.target.value)} placeholder="Paste or type your EU5 installation path" spellCheck={false} autoComplete="off" aria-invalid={invalidPath} aria-describedby={`${titleId}-path-help`} /><button type="button" onClick={() => {
                setBrowsing(true); setError("");
                void window.eu5.browseGameDirectory().then(path => { if (path) changeDirectory(path); }).catch(e => setError(String(e))).finally(() => setBrowsing(false));
              }}><Icon name="game" />Browse…</button></div>
              <p className={`field-help ${invalidPath ? "error" : ""}`} id={`${titleId}-path-help`}>{invalidPath ? "Enter a valid directory path on a single line." : "Use the installation root or its game subfolder. The directory is checked when saved."}</p>
              <div className="version-row"><div><label className="field-label" htmlFor={`${titleId}-version`}>Manual EU5 version</label><input id={`${titleId}-version`} type="text" value={draft.gameVersion} disabled={!draft.gameDir.trim()} onChange={event => { ++lookup.current; setLookingUp(false); setDraft(old => ({ ...old, gameVersion: event.target.value })); }} placeholder="1.4.5" spellCheck={false} autoComplete="off" inputMode="decimal" aria-invalid={invalidVersion} aria-describedby={`${titleId}-version-help`} /><p className={`field-help ${invalidVersion ? "error" : ""}`} id={`${titleId}-version-help`}>{invalidVersion ? "Enter a numeric game version such as 1.4.5." : "Saved for this installation."}</p></div><p className="version-description">Enter the version shown by the game. Export Mod uses the saved version of the loaded installation.</p></div>
              <label className="switch-row"><span><strong>Load saved game data on startup</strong><small>Start with your saved installation ready.</small></span><input className="switch" type="checkbox" role="switch" checked={draft.autoLoad} onChange={event => setDraft(old => ({ ...old, autoLoad: event.target.checked }))} /></label>
              <label className="switch-row"><span><strong>Remember project and export folders</strong><small>Keep the last folder for each action separately.</small></span><input className="switch" type="checkbox" role="switch" checked={draft.rememberFolders} onChange={event => setDraft(old => ({ ...old, rememberFolders: event.target.checked }))} /></label>
              <div className="game-actions"><button type="button" disabled={!settings.gameDir || changedGame} title={changedGame ? "Save the installation directory and version first." : "Load the saved game data."} onClick={() => { onPreviewTheme(settings.theme); onLoad(); }}>Load saved installation <span aria-hidden="true">→</span></button></div>
              <p className="field-help">Saving preferences keeps the current project open. Load the saved installation to switch game data.</p>
            </section>
            <section role="tabpanel" id={`${titleId}-window-panel`} aria-labelledby={`${titleId}-window-tab`} hidden={tab !== "window"}>
              <h3>Pick up where you left off.</h3><p className="section-description">Let the editor remember how you arrange your workspace.</p>
              <label className="switch-row window-switch"><span><strong>Remember window size and position</strong><small>Restore your placement and maximized state at startup.</small></span><input className="switch" type="checkbox" role="switch" checked={draft.rememberWindow} onChange={event => setDraft(old => ({ ...old, rememberWindow: event.target.checked }))} /></label>
              <div className="window-illustration"><div className="window-drawing" aria-hidden="true" /><div><p>{draft.rememberWindow ? "Your window will open where you left it." : "Start at the default size and centred position."}</p><small>Includes its normal size and maximized state.</small><small>{resetWindow ? "The window will reset when you save." : settings.geometry ? `Saved normal size: ${settings.geometry.width} × ${settings.geometry.height} px${settings.geometry.maximized ? " · Maximized" : ""}.` : "No saved window layout."}</small></div></div>
              <div className="reset-row"><p>Return to the default size and centre the editor.</p><button type="button" onClick={() => setResetWindow(true)}>Reset window layout</button></div>
              <div className="subtle-note"><Icon name="info" /><span>Turning this off clears the saved layout. The editor checks your available displays before restoring a window.</span></div>
            </section>
          </fieldset>
        </div>
      </div>
      <footer className="settings-footer"><p className={error ? "settings-feedback error" : "settings-feedback"} role={error ? "alert" : "status"}>{error || (saving ? "Saving settings…" : browsing ? "Choose an installation directory…" : lookingUp ? "Checking the installation’s saved version…" : "Changes apply when saved.")}</p><button type="button" onClick={close} disabled={saving || browsing}>Cancel</button><button type="submit" className="primary" disabled={saving || browsing || lookingUp || invalidVersion || invalidPath}>Save settings</button></footer>
    </form>
  </dialog>;
}
