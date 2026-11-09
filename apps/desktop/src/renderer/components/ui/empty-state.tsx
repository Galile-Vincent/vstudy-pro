import { type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function EmptyState({ icon, title, description, action, headingLevel = 3, className, ...props }: Omit<ComponentProps<'div'>, 'title'> & { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; headingLevel?: 2 | 3 | 4 | 5 | 6 }) {
  const Heading = `h${headingLevel}` as const;
  return <div {...props} data-slot="empty-state" className={cn('flex flex-col items-center gap-[var(--space-3)] p-[var(--space-8)] text-center', className)}>{icon && <div aria-hidden="true">{icon}</div>}<Heading className="text-[length:var(--type-lg)] font-medium">{title}</Heading>{description && <p className="text-[var(--muted)]">{description}</p>}{action}</div>;
}
