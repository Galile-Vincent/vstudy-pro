import { type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function EmptyState({ icon, title, description, action, className, ...props }: Omit<ComponentProps<'div'>, 'title'> & { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <div {...props} data-slot="empty-state" className={cn('flex flex-col items-center gap-[var(--space-3)] p-[var(--space-8)] text-center', className)}>{icon && <div aria-hidden="true">{icon}</div>}<h3 className="text-[length:var(--type-lg)] font-medium">{title}</h3>{description && <p className="text-[var(--muted)]">{description}</p>}{action}</div>;
}
