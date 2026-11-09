import { type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import './ui.css';

export type ListRowProps = Omit<ComponentProps<'div'>, 'title' | 'onClick'> & {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  selected?: boolean;
  divider?: boolean;
  onClick?: ComponentProps<'button'>['onClick'];
  href?: string;
  disabled?: boolean;
};

export function ListRow({
  title,
  subtitle,
  leading,
  meta,
  actions,
  selected = false,
  divider = false,
  onClick,
  href,
  disabled,
  className,
  ...props
}: ListRowProps) {
  const content = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {subtitle && <span className="block text-[var(--muted)]">{subtitle}</span>}
      </span>
      {meta && <span className="shrink-0 text-[var(--muted)]">{meta}</span>}
    </>
  );
  const classes =
    'ui-row-target flex min-w-0 flex-1 items-center gap-[var(--space-3)] rounded-[var(--r-sm)] p-[var(--space-3)] text-start';
  return (
    <div
      {...props}
      data-slot="list-row"
      data-selected={selected}
      data-divider={divider}
      className={cn('flex items-center gap-[var(--space-2)] rounded-[var(--r-sm)]', className)}
    >
      {href ? (
        <a
          className={classes}
          href={disabled ? undefined : href}
          aria-disabled={disabled || undefined}
          aria-current={selected ? 'page' : undefined}
          tabIndex={disabled ? -1 : undefined}
        >
          {content}
        </a>
      ) : onClick ? (
        <button
          type="button"
          className={classes}
          disabled={disabled}
          onClick={onClick}
          aria-pressed={selected}
        >
          {content}
        </button>
      ) : (
        <div className={classes}>{content}</div>
      )}
      {actions && <div className="shrink-0 pe-[var(--space-3)]">{actions}</div>}
    </div>
  );
}
