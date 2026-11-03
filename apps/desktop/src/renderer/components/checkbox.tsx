import { Checkbox as Control } from './ui/checkbox';
import type { ComponentProps } from 'react';
type Props = Omit<ComponentProps<typeof Control>, 'onCheckedChange' | 'onChange'> & { onChange?: (event:{target:{checked:boolean}})=>void };
export function Checkbox({onChange,...props}:Props) { return <Control {...props} onCheckedChange={checked=>onChange?.({target:{checked:checked===true}})}/>; }
