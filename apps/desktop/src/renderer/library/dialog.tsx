import { useEffect, useRef, useState, type ReactNode } from "react";
import { tr } from "../../shared/i18n";
export function LibraryDialog({
  title,
  children,
  onClose, menu = false, anchor,
}: {
  menu?: boolean; anchor?: HTMLElement | null;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    if (menu) {
      const node = ref.current!;
      node.showPopover();
      const rect = anchor?.getBoundingClientRect();
      node.style.left = `${Math.max(8, Math.min(window.innerWidth - 240, rect?.right ?? 240) - 224)}px`;
      node.style.top = `${Math.min(window.innerHeight - node.offsetHeight - 8, rect?.bottom ?? 160)}px`;
      const buttons = node.querySelectorAll('button');
      buttons.forEach(button => button.setAttribute('role', 'menuitem'));
      buttons[0]?.focus();
    } else {
      ref.current?.showModal();
      ref.current?.querySelector<HTMLInputElement>("input[autofocus], input, textarea")?.focus();
    }
    const outside = (event: PointerEvent) => { if (menu && event.target instanceof Node && !ref.current?.contains(event.target) && !anchor?.contains(event.target)) onClose(); };
    document.addEventListener('pointerdown',outside);
    return () => {
      document.removeEventListener('pointerdown',outside);
      if (menu && anchor?.isConnected) anchor.focus(); else if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      else (document.querySelector<HTMLElement>(".library-document[tabindex=\"0\"]") ?? document.getElementById("shell-content"))?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      popover={menu ? 'manual' : undefined}
      role={menu ? 'menu' : undefined}
      onToggle={e => { if (menu && e.newState === 'closed') onClose(); }}
      onKeyDown={e => {
        if (!menu) return;
        const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {
          e.preventDefault(); buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      }}
      className={`settings-dialog library-dialog ${menu ? 'anchored-menu' : ''}`}
      aria-label={title}
      onCancel={onClose}
    >
      {!menu && <div className="dialog-title">
        <h2>{title}</h2>
        <button aria-label={tr("library:close")} onClick={onClose}>
          ×
        </button>
      </div>}
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
