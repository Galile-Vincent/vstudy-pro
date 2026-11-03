import { useEffect, useRef, useState, type ReactNode } from "react";
import { tr } from "../../shared/i18n";
export function LibraryDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="settings-dialog library-dialog"
      aria-label={title}
      onCancel={onClose}
    >
      <div className="dialog-title">
        <h2>{title}</h2>
        <button aria-label={tr("library:close")} onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function useLibraryPrompt() {
  const [request, setRequest] = useState<{
    title: string;
    value: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const ask = (title: string, value = "") =>
    new Promise<string | null>((resolve) =>
      setRequest({ title, value, resolve }),
    );
  const close = (value: string | null) => {
    request?.resolve(value);
    setRequest(null);
  };
  const dialog = request ? (
    <LibraryDialog title={request.title} onClose={() => close(null)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          close(request.value.trim() || null);
        }}
      >
        <label>
          {request.title}
          <input
            autoFocus
            required
            maxLength={200}
            value={request.value}
            onChange={(e) => setRequest({ ...request, value: e.target.value })}
          />
        </label>
        <button>{tr("library:save")}</button>
      </form>
    </LibraryDialog>
  ) : null;
  return [ask, dialog] as const;
}
