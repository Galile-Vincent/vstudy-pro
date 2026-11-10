import { Children, isValidElement, useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { Tabs as Primitive } from 'radix-ui';
import { SegmentedControl as Control, SegmentedControlItem as Item } from '@astryxdesign/core';
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

type ControlProps = {
  type?: 'single';
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
};

export function SegmentedControl({ value, defaultValue = '', onValueChange, disabled, className, children, 'aria-label': label = '' }: ControlProps) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  return <Control label={label} value={current} isDisabled={disabled ?? false} className={cn('ui-segmented', className)}
    onChange={next => { if (value === undefined) setInner(next); onValueChange?.(next); }}>{children}</Control>;
}

const textOf = (node: ReactNode): string => Children.toArray(node).map(child =>
  typeof child === 'string' || typeof child === 'number' ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '').join('');

export function SegmentedControlItem({ value, disabled, id, children }: {
  value: string;
  disabled?: boolean;
  id?: string;
  children?: ReactNode;
}) {
  const nodes = Children.toArray(children);
  const icon = nodes.find((node): node is ReactElement => isValidElement(node) && !textOf(node));
  return <Item value={value} label={textOf(nodes)} isDisabled={disabled ?? false} {...(icon ? { icon } : {})} {...(id ? { id } : {})} />;
}
