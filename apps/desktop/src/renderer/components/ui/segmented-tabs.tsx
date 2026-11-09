import { type ComponentProps } from 'react';
import { Tabs as Primitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import './ui.css';
export { Tabs, TabsContent } from './tabs';
export function SegmentedTabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      {...props}
      data-slot="segmented-tabs-list"
      className={cn(
        'flex w-fit max-w-full flex-wrap gap-[var(--space-1)] rounded-[var(--r-md)] p-[var(--space-1)]',
        className,
      )}
    />
  );
}
export function SegmentedTabsTrigger({
  className,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      {...props}
      data-slot="segmented-tabs-trigger"
      className={cn(
        'rounded-[var(--r-sm)] px-[var(--space-3)] py-[var(--space-2)] font-medium text-[var(--muted)] disabled:opacity-[var(--opacity-disabled)]',
        className,
      )}
    />
  );
}
