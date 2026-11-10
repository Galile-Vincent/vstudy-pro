import { useId, type MouseEvent, type ReactNode } from 'react';
import { Field } from '@astryxdesign/core';
import './ui.css';

export function SettingRow({ label, description, htmlFor, children, stack = false }: {
  label: string;
  description?: string | undefined;
  htmlFor?: string | undefined;
  children: ReactNode;
  stack?: boolean;
}) {
  const id = useId();
  const labelID = `${id}-label`;
  // Astryx controls own their input id, so a label that points at nothing still toggles the control it names.
  const forwardLabelClick = (event: MouseEvent<HTMLDivElement>) => {
    const own = (event.target as HTMLElement).closest('label');
    if (!own || own.id !== labelID || (own as HTMLLabelElement).control) return;
    event.currentTarget.querySelector<HTMLInputElement>('input[type=checkbox]')?.click();
  };
  return (
    <Field data-slot="setting-row" {...(stack ? { 'data-layout': 'stack' } : {})}
      label={label} {...(description ? { description } : {})} inputID={htmlFor ?? id} labelID={labelID}
      isGroupLabel={!htmlFor} {...(htmlFor ? {} : { role: 'group', 'aria-labelledby': labelID })} onClick={forwardLabelClick}>
      {children}
    </Field>
  );
}
