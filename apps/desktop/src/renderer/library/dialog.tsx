import { useEffect, useRef, type ReactNode } from "react";
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
