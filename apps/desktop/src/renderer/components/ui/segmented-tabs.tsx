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

export function SegmentedControl({ className, onKeyDownCapture, ...props }: ComponentProps<typeof Control.Root>) {
  return <Control.Root {...props} onKeyDownCapture={event => {
    onKeyDownCapture?.(event);
    if (event.defaultPrevented || props.type !== 'single' || event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = props.dir ?? getComputedStyle(event.currentTarget).direction;
    const horizontal = props.orientation !== 'vertical';
    const previous = horizontal ? (direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft') : 'ArrowUp';
    const next = horizontal ? (direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight') : 'ArrowDown';
    if (![previous, next, 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-slot=segmented-control-item]:not(:disabled)'));
    const index = items.indexOf(event.target as HTMLButtonElement);
    if (index < 0 || !items.length) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.key === previous ? -1 : 1;
    let target = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + step;
    target = props.loop === false ? Math.max(0, Math.min(items.length - 1, target)) : (target + items.length) % items.length;
    const item = items[target];
    if (!item) return;
    item.focus();
    if (item.getAttribute('aria-checked') !== 'true') item.click();
  }} data-slot="segmented-control" className={cn('flex w-fit max-w-full flex-wrap gap-[var(--space-1)] rounded-[var(--r-md)] p-[var(--space-1)]', className)} />;
}
export function SegmentedControlItem({ className, ...props }: ComponentProps<typeof Control.Item>) {
  return <Control.Item {...props} data-slot="segmented-control-item" className={cn('inline-flex items-center gap-[var(--space-2)] rounded-[var(--r-sm)] px-[var(--space-3)] py-[var(--space-2)] font-medium text-[var(--muted)] disabled:opacity-[var(--opacity-disabled)]', className)} />;
}
