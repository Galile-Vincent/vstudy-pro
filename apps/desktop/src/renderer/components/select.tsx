import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { Selector } from '@astryxdesign/core';

type Inherited = Pick<ComponentProps<typeof Selector>, 'id' | 'aria-describedby' | 'aria-invalid' | 'width' | 'size' | 'variant'>;

const textOf = (node: ReactNode): string => Children.toArray(node).map(child =>
  typeof child === 'string' || typeof child === 'number' ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '').join('');

export function Select({
  children,
  value,
  onChange,
  disabled,
  className,
  'aria-label': label = '',
  ...props
}: Inherited & {
  children: ReactNode;
  value?: string;
  onChange: (event: { target: { value: string } }) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}) {
  const options = Children.toArray(children).flatMap(child =>
    isValidElement<{ value: string; children: ReactNode }>(child)
      ? [{ value: child.props.value, label: textOf(child.props.children) }]
      : []
  );
  return (
    <Selector
      {...props}
      label={label}
      isLabelHidden
      options={options}
      value={value ?? ''}
      data-value={value ?? ''}
      isDisabled={disabled ?? false}
      {...(className ? { containerClassName: className } : {})}
      onChange={next => onChange({ target: { value: next ?? '' } })}
    />
  );
}
