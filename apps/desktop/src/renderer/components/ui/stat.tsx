import { type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
export function Stat({ label, value, unit, delta, className, ...props }: ComponentProps<'div'> & { label: ReactNode; value: ReactNode; unit?: ReactNode; delta?: ReactNode }) {
  return <div {...props} data-slot="stat" className={cn('flex flex-col gap-[var(--space-2)]', className)}><span className="text-[var(--muted)]">{label}</span><span className="text-[length:var(--type-display)] font-medium">{value}{unit && <span className="ms-[var(--space-1)] text-[length:var(--type-base)]">{unit}</span>}</span>{delta && <span className="text-[var(--muted)]">{delta}</span>}</div>;
}
