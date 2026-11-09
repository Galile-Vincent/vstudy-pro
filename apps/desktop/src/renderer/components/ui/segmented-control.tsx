import { RadioGroup } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import './ui.css';

export function SegmentedControl({ options, ...props }: ComponentProps<typeof RadioGroup.Root> & {
  options: readonly { value: string; label: ReactNode }[];
}) {
  return (
    <RadioGroup.Root {...props} data-slot="segmented-control" orientation="horizontal">
      {options.map(option => (
        <RadioGroup.Item key={option.value} value={option.value}>
          {option.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
