import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';
import './ui.css';

type DivProps = ComponentProps<'div'>;
type Slots = { title: ReactNode; description?: ReactNode; actions?: ReactNode };

export function PageHeader({
  title,
  description,
  leading,
  actions,
  meta,
  className,
  ...props
}: Omit<ComponentProps<'header'>, 'title'> & Slots & { leading?: ReactNode; meta?: ReactNode }) {
  return (
    <header
      {...props}
      data-slot="page-header"
      className={cn('flex flex-col gap-[var(--space-4)]', className)}
    >
      {leading && <div>{leading}</div>}
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-4)]">
        <div className="min-w-0">
          {title != null && title !== '' && <h1 className="text-[length:var(--type-display)] font-medium">{title}</h1>}
          {description && <p className="text-[var(--muted)]">{description}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </div>
      {meta && <div>{meta}</div>}
    </header>
  );
}

export function Section({
  title,
  count,
  actions,
  children,
  className,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> &
  Pick<Slots, 'title' | 'actions'> & { count?: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      {...props}
      data-slot="section"
      className={cn('flex flex-col gap-[var(--space-4)]', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
        <h2
          id={id}
          className="flex items-center gap-[var(--space-2)] text-[length:var(--type-lg)] font-medium"
        >
          {title}
          {count !== undefined && <Badge variant="secondary">{count}</Badge>}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Toolbar({
  left,
  center,
  right,
  className,
  ...props
}: DivProps & { left?: ReactNode; center?: ReactNode; right?: ReactNode }) {
  return (
    <div
      {...props}
      data-slot="toolbar"
      className={cn('flex flex-wrap items-center gap-[var(--space-3)]', className)}
    >
      {left && <div className="flex flex-wrap items-center gap-[var(--space-2)]">{left}</div>}
      {center && (
        <div className="flex flex-1 flex-wrap items-center justify-center gap-[var(--space-2)]">
          {center}
        </div>
      )}
      {right && (
        <div className="ms-auto flex flex-wrap items-center gap-[var(--space-2)]">{right}</div>
      )}
    </div>
  );
}

export function PageContainer({
  as: Component = 'div', className, ...props
}: ComponentProps<'div'> & { as?: 'div' | 'main' }) {
  return (
    <Component
      {...props}
      data-slot="page-container"
      className={cn(
        'ui-page-container mx-auto flex w-full flex-col gap-[var(--space-8)] p-[var(--space-8)]',
        className,
      )}
    />
  );
}
