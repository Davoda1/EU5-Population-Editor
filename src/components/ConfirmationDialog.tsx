import { useEffect, useRef, useState } from "react";
import type { ConfirmationAction, ConfirmationPrompt } from "../types/api";
import { Dialog } from "./Dialog";

export function ConfirmationDialog({ prompt }: { prompt: ConfirmationPrompt }) {
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState("");
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, [prompt.token]);
  const verb = prompt.reason === "exit" ? "exit" : prompt.reason === "restart" ? "restart" : "continue";
  const respond = async (action: ConfirmationAction) => {
    if (responding) return;
    setResponding(true);
    setError("");
    try { await window.eu5.respondConfirmation(prompt.token, action); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setResponding(false); }
  };
  return (
    <Dialog title={prompt.reason === "exit" ? "Unsaved work — exit editor?" : prompt.reason === "restart" ? "Unsaved work — restart editor?" : "Replace current work?"}
      onClose={() => { if (!responding) void respond("cancel"); }} closeDisabled={responding}>
      <p>Your current session contains unsaved work.</p>
      {prompt.unavailable
        ? <p>The editor cannot read the current project state. Saving is unavailable. Cancel keeps the window open; discard proceeds without saving.</p>
        : <p>Save Working writes the confirmed project changes to your project file before you {verb}.</p>}
      {prompt.hasDrafts && <p><strong>Pending Draft edits are not saved.</strong> They will be discarded if you continue. Choose Cancel to review and Apply them first.</p>}
      <p>Discard proceeds without saving your current work.</p>
      {(prompt.error || error) && <p role="alert">{prompt.error || error}</p>}
      <div className="dialog-actions">
        <button ref={cancel} disabled={responding} onClick={() => void respond("cancel")}>Cancel</button>
        <button disabled={responding} onClick={() => void respond("discard")}>Discard and {verb}</button>
        {prompt.canSave && <button className="primary" disabled={responding} onClick={() => void respond("save")}>{responding ? "Saving…" : `Save Working and ${verb}`}</button>}
      </div>
    </Dialog>
  );
}
