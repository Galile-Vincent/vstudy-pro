import { Checkbox as Control } from './ui/checkbox';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<typeof Control>, 'onCheckedChange' | 'onChange'> & { onChange?: (event:{target:{checked:boolean}})=>void };

export function Checkbox({ className, onChange, ...props }: Props) {
  return (
    <Control
      className={cn(
        "rounded-[var(--r-xs)] border-0 bg-[color-mix(in_oklab,var(--ink)_12%,var(--surface))] transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_16%,var(--surface))] data-[state=checked]:bg-[var(--ink)] data-[state=checked]:text-[var(--surface)]",
        className
      )}
      {...props}
      onCheckedChange={checked => onChange?.({ target: { checked: checked === true } })}
    />
  );
}
