"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

export default function WorkspaceModal({ title, close, children, icon: Icon, busy = false }: { title: string; close: () => void; children: ReactNode; icon?: LucideIcon; busy?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (document.activeElement === document.body && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  function dismiss() {
    if (busy) return;
    ref.current?.close();
    close();
  }

  return <dialog ref={ref} className="modal live-modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); dismiss(); }}>
    <div className="modal-heading">
      <h2 id={titleId} className={Icon ? "workspace-icon-label" : undefined}>{Icon && <Icon size={20} aria-hidden="true" />}{title}</h2>
      <button type="button" className="button secondary compact workspace-modal-close" aria-label="Tutup" disabled={busy} onClick={dismiss}><X size={18} aria-hidden="true" /></button>
    </div>
    {children}
  </dialog>;
}
