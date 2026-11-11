import type { ReactNode } from 'react';
import { Section as AstryxSection, Heading, Badge, List, ListItem } from '@astryxdesign/core';
import type { ListRowProps } from '../components/ui/list-row';

export function Section({title, count, actions, children}: {title: ReactNode; count?: number; actions?: ReactNode; children?: ReactNode}) {
  return <AstryxSection><div className="stock-section"><div className="stock-heading"><Heading level={2}>{title}</Heading>{count !== undefined && <Badge label={String(count)} />}<div className="stock-actions">{actions}</div></div>{children}</div></AstryxSection>;
}
export function ListRow({title, subtitle, leading, meta, actions, onClick}: ListRowProps) {
  return <List edge="flush"><ListItem label={title} description={subtitle} startContent={leading} endContent={<div className="stock-row-actions">{meta}{actions}</div>} {...(onClick ? {onClick: onClick as (event: React.MouseEvent) => void} : {})} /></List>;
}
