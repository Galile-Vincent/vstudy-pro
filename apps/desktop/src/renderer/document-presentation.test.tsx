// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it } from 'vitest';
import DocumentPresentation from './document-presentation';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('renders a vendor generative table with escaped text cells',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(<DocumentPresentation presentation={{title:'Comparison',columns:['Topic','Fact'],rows:[['Study','<img src=x onerror=alert(1)>']]}}/>));
 expect(host.querySelector('table')?.textContent).toContain('TopicFactStudy<img src=x onerror=alert(1)>');
 expect(host.querySelector('img')).toBeNull();
 await act(async()=>root.unmount());host.remove();
});
