import { useId, type ReactNode } from 'react';
import './ui.css';

export function SettingRow({ label, description, htmlFor, children, stack = false }: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  stack?: boolean;
}) {
  const id = useId();
  return (
    <div data-slot="setting-row" data-layout={stack ? 'stack' : undefined}
      role={htmlFor ? undefined : 'group'} aria-labelledby={htmlFor ? undefined : id}>
      <div>
        <label id={id} htmlFor={htmlFor}>{label}</label>
        {description && <p>{description}</p>}
      </div>
      <div data-slot="setting-control">{children}</div>
    </div>
  );
}
