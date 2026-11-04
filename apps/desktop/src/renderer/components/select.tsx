import { Children, isValidElement, type ReactNode } from 'react';
import { Select as Root, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
import { cn } from '@/lib/utils';

export function Select({
  children,
  value,
  onChange,
  disabled,
  className,
  ...props
}: {
  children: ReactNode;
  value?: string;
  onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}) {
  const options = Children.toArray(children).flatMap(child =>
    isValidElement<{ value: string; children: ReactNode }>(child)
      ? [{ value: child.props.value, label: child.props.children }]
      : []
  );
  const encode = (value: string) => value || '__vstudy_empty__';
  return (
    <Root
      value={encode(value ?? '')}
      disabled={disabled ?? false}
      onValueChange={next => onChange({ target: { value: next === '__vstudy_empty__' ? '' : next } })}
    >
      <SelectTrigger
        className={cn(
          "app-select border-0 bg-[color-mix(in_oklab,var(--ink)_5%,var(--surface))] rounded-[var(--r-sm)] shadow-none transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_8%,var(--surface))] focus-visible:outline-2 focus-visible:outline-[var(--focus)] focus-visible:outline-offset-2",
          className
        )}
        data-value={value}
        {...props}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-0 rounded-[var(--r-md)] bg-[var(--surface)] shadow-[var(--elevation-floating)] p-[var(--space-1)]">
        {options.map(option => (
          <SelectItem
            key={option.value}
            value={encode(option.value)}
            className="rounded-[var(--r-xs)] transition-colors focus:bg-[var(--active)] focus:text-[var(--ink)]"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Root>
  );
}
