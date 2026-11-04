import { type ReactNode, useId } from 'react';
export function SettingsGroup({title,children,danger=false}:{title?:string;children:ReactNode;danger?:boolean}) {
 return <section className="settings-group">{title && <h3>{title}</h3>}<div className="settings-card" data-danger={danger}>{children}</div></section>;
}
export function SettingsRow({label,description,children,stack=false}:{label:string;description?:string|undefined;children:ReactNode;stack?:boolean}) {
 const id=useId();
 return <div className="settings-row" data-layout={stack?'stack':undefined}><div className="settings-label" id={id}><div>{label}</div>{description && <p className="muted">{description}</p>}</div><div className="settings-control" role="group" aria-labelledby={id}>{children}</div></div>;
}
