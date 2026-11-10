// @vitest-environment jsdom
/** Cancelled storage actions do not announce successful deletion. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { StorageSettings } from './storage';
vi.mock('../bridge',()=>({desktop:{invoke:async(channel:string)=>channel==='storage:usage'?{categories:[],cacheBytes:0,pendingRestore:false}:{cancelled:true}}}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it.each([0,1])('shows no completion message when cleanup %s is cancelled',async index=>{
  const host=document.createElement('div'),root=createRoot(host);document.body.append(host);
  try {
    await act(()=>root.render(<StorageSettings/>));
    await act(()=>host.querySelectorAll<HTMLButtonElement>('button')[index]!.click());
    expect(host.querySelector('p[role=status]')).toBeNull();
  }finally{await act(()=>root.unmount());host.remove();}
});
