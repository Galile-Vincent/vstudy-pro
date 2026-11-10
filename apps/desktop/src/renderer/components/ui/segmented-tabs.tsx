import { type ComponentProps } from 'react';
import { Tabs as Primitive, ToggleGroup as Control } from 'radix-ui';
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

export function SegmentedControl({ className, ...props }: ComponentProps<typeof Control.Root>) {
  return <Control.Root {...props} data-slot="segmented-control" className={cn('flex w-fit max-w-full flex-wrap gap-[var(--space-1)] rounded-[var(--r-md)] p-[var(--space-1)]', className)} />;
}
export function SegmentedControlItem({ className, ...props }: ComponentProps<typeof Control.Item>) {
  return <Control.Item {...props} data-slot="segmented-control-item" className={cn('inline-flex items-center gap-[var(--space-2)] rounded-[var(--r-sm)] px-[var(--space-3)] py-[var(--space-2)] font-medium text-[var(--muted)] disabled:opacity-[var(--opacity-disabled)]', className)} />;
}
