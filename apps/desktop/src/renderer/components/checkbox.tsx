import type { ComponentProps } from 'react';
import { CheckboxInput } from '@astryxdesign/core';

type Inherited = Pick<ComponentProps<typeof CheckboxInput>, 'id' | 'aria-describedby' | 'aria-invalid' | 'style'>;

export function Checkbox({ checked, disabled, onChange, 'aria-label': label = '', ...props }: Inherited & {
  checked?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  onChange?: (event: { target: { checked: boolean } }) => void;
}) {
  return <CheckboxInput {...props} label={label} isLabelHidden value={checked === true}
    isDisabled={disabled ?? false} onChange={next => onChange?.({ target: { checked: next } })} />;
}
