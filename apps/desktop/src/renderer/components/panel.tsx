import { Card, Divider, Heading } from '@astryxdesign/core';
import { useId, type ReactNode } from 'react';
import './panel.css';

/** The app's grouped section: a bordered Card with a header row (title, optional count badge and actions), a divider, then content on one inner edge. */
export function Panel({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <Card padding={0}><section aria-labelledby={id}>
    <div className="ui-panel-heading"><Heading level={2} id={id}>{title}</Heading>{actions}</div>
    <Divider />
    <div className="ui-panel-body">{children}</div>
  </section></Card>;
}
