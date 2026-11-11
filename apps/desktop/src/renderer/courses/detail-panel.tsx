import { Card, Divider, Heading } from '@astryxdesign/core';
import { useId, type ReactNode } from 'react';

export function DetailPanel({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return <Card padding={0}><section aria-labelledby={id}>
    <div className="course-panel-heading"><Heading level={2} id={id}>{title}</Heading>{actions}</div>
    <Divider />
    <div className="course-panel-body">{children}</div>
  </section></Card>;
}
