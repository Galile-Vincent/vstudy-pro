// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { AssistantRuntimeProvider, ComposerPrimitive, useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react';
import { ChatAnnouncement } from './components/assistant-ui/elements/thread.aui';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT=true;
function Harness({adapter}:{adapter:ChatModelAdapter}) {
 const runtime=useLocalRuntime(adapter);
 return <AssistantRuntimeProvider runtime={runtime}><ChatAnnouncement/><ComposerPrimitive.Root><ComposerPrimitive.Input/><ComposerPrimitive.Send>Send</ComposerPrimitive.Send></ComposerPrimitive.Root></AssistantRuntimeProvider>;
}
it('announces a 5k-token answer once at completion and never announces token deltas',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let finish!:()=>void;const finished=new Promise<void>(resolve=>{finish=resolve;});
 const adapter:ChatModelAdapter={async *run(){
  for(let i=1;i<=100;i++){yield {content:[{type:'text',text:'word '.repeat(i*50)}]};await new Promise(resolve=>setTimeout(resolve,1));}
  finish();
 }};
 await act(async()=>root.render(<Harness adapter={adapter}/>));
 const region=host.querySelector('[role=status]')!,texts:string[]=[];
 const observer=new MutationObserver(()=>texts.push(region.textContent??''));observer.observe(region,{subtree:true,childList:true,characterData:true});
 const input=host.querySelector('textarea')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Question');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await act(async()=>{await finished;await new Promise(resolve=>setTimeout(resolve,20));});
 expect(texts.filter(t=>t.startsWith('Answer complete'))).toHaveLength(1);
 expect(texts.filter(t=>t==='Assistant is answering')).toHaveLength(1);
 expect(texts).toHaveLength(2);expect(region.textContent).toBe('Answer complete: ' + ('word '.repeat(48)).trim());
 observer.disconnect();await act(async()=>root.unmount());host.remove();
});
