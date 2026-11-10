// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { AssistantRuntimeProvider, ComposerPrimitive, useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react';
import { ChatAnnouncement, announcementExcerpt } from './chat-accessibility';
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
 expect(texts).toHaveLength(2);expect(region.textContent).toBe('Answer complete: ' + ('word '.repeat(48)).trim() + '…');
 observer.disconnect();await act(async()=>root.unmount());host.remove();
});
it('cuts the announced excerpt on code points so no lone surrogate precedes the ellipsis',()=>{
 const excerpt=announcementExcerpt('a'.repeat(239)+'😀'+'tail');
 expect(excerpt).toBe('a'.repeat(239)+'😀…');
 expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(excerpt)).toBe(false);
 expect(announcementExcerpt('短'.repeat(240))).toBe('短'.repeat(240));
 expect(announcementExcerpt('短'.repeat(241))).toBe('短'.repeat(240)+'…');
});

const graphemes=(text:string)=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text),part=>part.segment);
it.each([
 ['a ZWJ family emoji at the boundary','👨‍👩‍👧','a'.repeat(239)],
 ['a flag at the boundary','🇹🇼','a'.repeat(239)],
 ['a base letter with a combining mark at the boundary','e\u0301','a'.repeat(239)],
])('keeps %s whole or drops it entirely',(_name,cluster,prefix)=>{
 const excerpt=announcementExcerpt(prefix+cluster+cluster+'tail');
 expect(excerpt.endsWith('…')).toBe(true);
 const body=graphemes(excerpt.slice(0,-1));
 expect(body.length).toBeLessThanOrEqual(240);
 expect(body.slice(239)).toEqual([cluster]);
 expect(excerpt).not.toMatch(/\u200D…$/);
});
it('does not leave a dangling joiner or half a flag when the cut falls inside a cluster',()=>{
 expect(announcementExcerpt('a'.repeat(239)+'👨‍👩‍👧tail')).toBe('a'.repeat(239)+'👨‍👩‍👧…');
 expect(announcementExcerpt('a'.repeat(239)+'🇹🇼tail')).toBe('a'.repeat(239)+'🇹🇼…');
 expect(announcementExcerpt('a'.repeat(239)+'e\u0301tail')).toBe('a'.repeat(239)+'e\u0301…');
});
it('leaves plain ASCII and 300 CJK characters cut at 240 with the ellipsis cue',()=>{
 expect(announcementExcerpt('word '.repeat(100))).toBe(('word '.repeat(48)).trim()+'…');
 expect(announcementExcerpt('short answer')).toBe('short answer');
 expect(announcementExcerpt('字'.repeat(300))).toBe('字'.repeat(240)+'…');
});

it('announces each tool transition once without token or timer chatter', async () => {
  const { render, screen, waitFor, cleanup, fireEvent } = await import('@testing-library/react');
  let finish!: () => void;
  let fail!: () => void;
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const failed = new Promise<void>(resolve => { fail = resolve; });
  const tool = {type: 'tool-call' as const, toolCallId: 'one', toolName: 'lookup', args: {}, argsText: '{}'};
  const adapter: ChatModelAdapter = {async *run() {
    yield {content: [tool]};
    await finished;
    yield {content: [{...tool, result: 'found'}]};
    await failed;
    yield {content: [{...tool, result: 'found'}, {...tool, toolCallId: 'two', isError: true, result: 'failed'}]};
  }};
  render(<Harness adapter={adapter}/>);
  fireEvent.change(screen.getByRole('textbox'), {target: {value: 'Question'}});
  fireEvent.submit(document.querySelector('form')!);
  await waitFor(() => expect(screen.getByTestId('tool-announcement').textContent).toContain('lookup started'));
  await act(async () => finish());
  await waitFor(() => expect(screen.getByTestId('tool-announcement').textContent).toContain('lookup finished'));
  await act(async () => fail());
  await waitFor(() => expect(screen.getByTestId('tool-announcement').textContent).toContain('lookup failed'));
  const log = screen.getByTestId('tool-announcement');
  expect(log.children).toHaveLength(3);
  cleanup();
});
