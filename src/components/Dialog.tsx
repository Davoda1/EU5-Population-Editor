import { useEffect, useRef, useId, ReactNode } from "react";
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={wide ? "wide" : ""}
      onCancel={(e) => {
        e.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button onClick={onClose} disabled={closeDisabled} aria-label="Close dialog">
          ×
        </button>
      </header>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
