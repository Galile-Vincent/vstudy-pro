import { tr } from '../../shared/i18n';

export function PaneTabs({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const panes = ['reading', 'chat'];
  return <div className="workspace-tabs" role="tablist" aria-label={tr('common:your_workspace')}>
    {panes.map((pane, index) => <button key={pane} type="button" role="tab"
      id={`workspace-tab-${pane}`} aria-controls={pane} aria-selected={value === pane}
      tabIndex={value === pane ? 0 : -1} onFocus={() => onChange(pane)} onClick={() => onChange(pane)}
      onKeyDown={event => {
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? panes.length - 1 : event.key === 'ArrowRight' ? (index + 1) % panes.length : event.key === 'ArrowLeft' ? (index + panes.length - 1) % panes.length : -1;
        if (next < 0) return;
        event.preventDefault();
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
      }}>{tr(pane === 'reading' ? 'common:document' : 'common:chat')}</button>)}
  </div>;
}
