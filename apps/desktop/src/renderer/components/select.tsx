import { Children, isValidElement, type ReactNode } from 'react';
import { Select as Root, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select';
export function Select({ children, value, onChange, disabled, ...props }: { children: ReactNode; value?: string; onChange: (event: { target: { value: string } }) => void; disabled?: boolean; 'aria-label'?: string }) {
 const options = Children.toArray(children).flatMap(child => isValidElement<{value:string;children:ReactNode}>(child) ? [{value:child.props.value,label:child.props.children}] : []);
 const encode=(value:string)=>value || '__vstudy_empty__';
 return <Root value={encode(value??'')} disabled={disabled??false} onValueChange={next=>onChange({target:{value:next==='__vstudy_empty__'?'':next}})}><SelectTrigger className="app-select" data-value={value} {...props}><SelectValue/></SelectTrigger><SelectContent>{options.map(option=><SelectItem key={option.value} value={encode(option.value)}>{option.label}</SelectItem>)}</SelectContent></Root>;
}
