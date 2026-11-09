import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
export type FieldControlProps = { id: string; 'aria-describedby'?: string | undefined; 'aria-invalid'?: true | undefined };
export type FormFieldProps = Omit<ComponentProps<'div'>, 'children'> & {
  label: ReactNode; description?: ReactNode; error?: ReactNode; controlId?: string;
  describedBy?: string; children: (props: FieldControlProps) => ReactNode;
};
export function FormField({ label, description, error, controlId, describedBy, children, className, ...props }: FormFieldProps) {
  const generated = useId();
  const id = controlId ?? generated;
  const hasError = error !== undefined && error !== null && error !== false;
  const hasDescription = description !== undefined && description !== null;
  const ids = [describedBy, hasDescription && `${id}-description`, hasError && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return <div {...props} data-slot="form-field" className={cn('flex flex-col gap-[var(--space-2)]', className)}><label htmlFor={id} className="font-medium">{label}</label>{hasDescription && <p id={`${id}-description`} className="text-[var(--muted)]">{description}</p>}{children({ id, 'aria-describedby': ids, 'aria-invalid': hasError || undefined })}{hasError && <p id={`${id}-error`} role="alert" className="text-[var(--danger)]">{error}</p>}</div>;
}
