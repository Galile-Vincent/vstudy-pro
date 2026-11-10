import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react';
export function SettingsGroup({title,children,danger=false}:{title?:string;children:ReactNode;danger?:boolean}) {
 return <section className="settings-group">{title && <h3>{title}</h3>}<div className="settings-card" data-danger={danger}>{children}</div></section>;
}
export function SettingsRow({label,description,children,stack=false}:{label:string;description?:string|undefined;children:ReactNode;stack?:boolean}) {
 const id=useId();
 const [group,setGroup]=useState(false);
 const control=useRef<HTMLDivElement>(null);
 const title=useRef<HTMLLabelElement>(null);
 useLayoutEffect(()=>{
  const field=control.current?.querySelector<HTMLElement>('input:not([type=hidden]),select,textarea,button[role=switch],button[role=checkbox]');
  setGroup(!field);
  if (!field || !title.current) return;
  if (!field.id) field.id=id;
  title.current.htmlFor=field.id;
  if (field.getAttribute('aria-label')===label) field.removeAttribute('aria-label');
 });
 return <div role={group ? 'group' : undefined} aria-labelledby={group ? id+'-label' : undefined} className="settings-row" data-layout={stack?'stack':undefined}><div className="settings-label"><label id={id+'-label'} ref={title}>{label}</label>{description && <p className="muted">{description}</p>}</div><div ref={control} className="settings-control">{children}</div></div>;
}
