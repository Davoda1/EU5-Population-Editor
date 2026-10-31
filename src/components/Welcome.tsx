import { useLayoutEffect, useRef } from "react";
import type { AppSettings } from "../types/api";

export function Welcome({ settings, busy, onLoad, onSettings }: {
  settings: AppSettings | null;
  busy: boolean;
  onLoad: () => void;
  onSettings: () => void;
}) {
  const viewport = useRef<HTMLElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = viewport.current!;
    const content = inner.current!;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const height = Math.max(1, container.clientHeight);
      const width = Math.max(1, container.clientWidth);
      content.style.setProperty("--space", String(Math.min(1, Math.max(.54, (height - 180) / 480))));
      content.style.setProperty("--welcome-py", `${Math.max(12, Math.min(65, (height - 350) * .19))}px`);
      content.style.setProperty("--welcome-px", `${Math.max(18, Math.min(55, width * .045))}px`);
      content.style.setProperty("--welcome-title-size", `${Math.max(34, Math.min(52, 32 + (height - 280) * .052))}px`);
      content.style.setProperty("--welcome-scale", "1");
      const scale = Math.min(1, Math.max(.01, (height - 2) / Math.max(1, content.scrollHeight)));
      content.style.setProperty("--welcome-scale", String(scale));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(container);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    void document.fonts?.ready.then(schedule);
    fit();
    return () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [settings?.gameDir, settings?.gameVersion]);
  const configured = !!settings?.gameDir;
  const folder = settings?.gameDir.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
  return <main className="welcome-viewport" ref={viewport}>
    <div className="welcome" ref={inner}>
      <div className="eyebrow">OFFLINE · SOURCE-PRESERVING · EXACT VALUES</div>
      <h2>Shape a location.<br />Keep its history.</h2>
      <p>Compare vanilla populations with your confirmed changes. Review every edit before applying it, save projects independently, and migrate conservatively when the game changes.</p>
      <button className="primary large" disabled={busy} onClick={onLoad}>{configured ? "Load saved game data" : "Select EU5 game data"}</button>
      <p className="hint">{configured ? "Your saved installation is ready to load. Change its directory or version in Settings." : "Choose the installation root or its game folder. Steam locations are used as Browse starting points when detected."}</p>
      {configured && <div className="saved-installation">
        <div><small>SAVED INSTALLATION</small><span title={settings.gameDir}>{folder}</span></div>
        <span className="saved-installation-version">EU5 {settings.gameVersion}</span>
        <button onClick={onSettings} disabled={busy}>Settings</button>
      </div>}
      <div className="welcome-cards">
        <section><strong>01 / Inspect</strong><p>Country → location → demographic tuple.</p></section>
        <section><strong>02 / Review</strong><p>Original, Working and Draft side by side.</p></section>
        <section><strong>03 / Preserve</strong><p>Save confirmed edits. Export when ready.</p></section>
      </div>
      <p className="compatibility">Your installation stays read-only. Projects save confirmed changes; exports create a separate mod folder.</p>
    </div>
  </main>;
}
