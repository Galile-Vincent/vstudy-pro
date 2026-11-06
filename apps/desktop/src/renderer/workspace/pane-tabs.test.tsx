// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Panel, PanelGroup } from 'react-resizable-panels';
import { expect, it } from 'vitest';
import { PaneTabs } from './pane-tabs';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('links workspace tabs to persistent panels and provides roving keyboard focus',async()=>{
  function Workspace(){const [pane,setPane]=useState('reading');return <><PaneTabs value={pane} onChange={setPane}/><PanelGroup direction="horizontal">{['reading','chat'].map(p=><Panel key={p} id={p} role="tabpanel" aria-labelledby={`workspace-tab-${p}`}>Retained {p}</Panel>)}</PanelGroup></>;}
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  try {
    await act(async()=>root.render(<Workspace/>));
    const tabs=[...host.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    for(const tab of tabs){const panel=document.getElementById(tab.getAttribute('aria-controls')!);expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);expect(panel?.getAttribute('role')).toBe('tabpanel');}
    await act(async()=>tabs[0]!.focus());
    for(const [key,index] of [['ArrowRight',1],['ArrowRight',0],['End',1],['Home',0],['ArrowLeft',1]] as const){
      await act(async()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));
      expect(document.activeElement).toBe(tabs[index]);expect(tabs[index]!.getAttribute('aria-selected')).toBe('true');expect(tabs.filter(t=>t.tabIndex===0)).toHaveLength(1);
    }
  } finally {await act(async()=>root.unmount());host.remove();}
});
