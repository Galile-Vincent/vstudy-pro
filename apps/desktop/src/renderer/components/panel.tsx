import { Card, Heading } from '@astryxdesign/core';
import { useId, type ReactNode } from 'react';
import './panel.css';

/** The app's grouped section: a heading row on the page (title, optional count badge and actions), then a Card holding the content on one inner edge. */
export function Panel({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <section className="ui-panel" aria-labelledby={id}>
    <div className="ui-panel-heading"><Heading level={2} id={id}>{title}</Heading>{actions}</div>
    <Card padding={0}><div className="ui-panel-body">{children}</div></Card>
  </section>;
}
