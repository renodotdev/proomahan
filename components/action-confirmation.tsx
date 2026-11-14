"use client";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

type Confirmation = { title: string; description: string; confirmLabel: string };
type Confirm = (options: Confirmation) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("ConfirmationProvider is required");
  return confirm;
}

export default function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<Confirmation | null>(null);
  const resolve = useRef<((confirmed: boolean) => void) | null>(null);
  const confirm = useCallback<Confirm>(options => {
    if (resolve.current) return Promise.resolve(false);
    return new Promise<boolean>(done => {
      resolve.current = done;
      setOptions(options);
    });
  }, []);
  const finish = useCallback((confirmed: boolean) => {
    const done = resolve.current;
    resolve.current = null;
    setOptions(null);
    done?.(confirmed);
  }, []);
  useEffect(() => () => { resolve.current?.(false); }, []);
  return <ConfirmationContext.Provider value={confirm}>{children}{options && <ConfirmationDialog {...options} onFinish={finish} />}</ConfirmationContext.Provider>;
}

function ConfirmationDialog({ title, description, confirmLabel, onFinish }: Confirmation & { onFinish: (confirmed: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    dialog.current?.showModal();
    cancel.current?.focus();
  }, []);
  function finish(confirmed: boolean) {
    dialog.current?.close();
    onFinish(confirmed);
  }
  return <dialog ref={dialog} className="modal live-modal" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event => { event.preventDefault(); finish(false); }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="button secondary compact" aria-label="Tutup konfirmasi" onClick={() => finish(false)}><X size={18} /></button></div>
    <div className="form-body live-form"><p id={descriptionId}>{description}</p></div>
    <div className="form-footer"><button ref={cancel} type="button" className="button secondary" onClick={() => finish(false)}>Batal</button><button type="button" className="button primary" onClick={() => finish(true)}>{confirmLabel}</button></div>
  </dialog>;
}
