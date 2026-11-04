// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {MessageUsage} from './chip';
const state=vi.hoisted(()=>({message:{status:{type:'incomplete',reason:'cancelled'},metadata:{custom:{} as Record<string,unknown>}}}));
vi.mock('@assistant-ui/react',()=>({useAuiState:(selector:(value:typeof state)=>unknown)=>selector(state)}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('never labels an undefined live model as the first API row and resolves a real aborted model',async()=>{
 const host=document.createElement('div');const root=createRoot(host);
 const props={subscription:false,models:[{id:'api',name:'Disabled API'},{id:'cli',resolvedId:'real',name:'Real CLI'}],fallbackUsage:{inputTokens:1,outputTokens:2,costSource:'unknown' as const}};
 await act(async()=>root.render(<MessageUsage {...props}/>));
 expect(host.textContent).toBe('in 1 · out 2 · price unknown · aborted');
 state.message.metadata.custom={modelId:'real'};
 await act(async()=>root.render(<MessageUsage {...props}/>));
 expect(host.textContent).toBe('Real CLIin 1 · out 2 · price unknown · aborted');
 await act(async()=>root.unmount());
});
