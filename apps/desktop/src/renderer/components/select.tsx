import { Children, isValidElement, useRef, useState, type ReactNode } from 'react';
import { Select as Primitive } from '@base-ui/react/select';
import { ChevronDown, Check } from 'lucide-react';
/** Shared select keeps option labels and keyboard navigation consistent across surfaces. */
export function Select({ children, value, onChange, disabled, ...props }: { children: ReactNode; value?: string; onChange: (event: { target: { value: string } }) => void; disabled?: boolean; 'aria-label'?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container,setContainer] = useState<HTMLElement | null>(null);
  const options = Children.toArray(children).flatMap(child => isValidElement<{value:string;children:ReactNode}>(child) ? [{value:child.props.value,label:child.props.children}] : []);
  return <Primitive.Root onOpenChange={() => setContainer(trigger.current?.closest("dialog") ?? null)} value={value ?? ''} disabled={disabled} onValueChange={v => onChange({target:{value:v ?? ''}})} items={options}>
    <Primitive.Trigger ref={trigger} className="app-select" data-value={value} {...props}><Primitive.Value/><Primitive.Icon><ChevronDown size={14}/></Primitive.Icon></Primitive.Trigger>
    <Primitive.Portal container={container ?? undefined}><Primitive.Positioner sideOffset={4} className="select-positioner"><Primitive.Popup className="select-popup">{options.map(option => <Primitive.Item className="select-item" key={option.value} value={option.value}><Primitive.ItemText>{option.label}</Primitive.ItemText><Primitive.ItemIndicator><Check size={14}/></Primitive.ItemIndicator></Primitive.Item>)}</Primitive.Popup></Primitive.Positioner></Primitive.Portal>
  </Primitive.Root>;
}
