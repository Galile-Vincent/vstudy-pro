// @vitest-environment jsdom
/** Approved navigation opens the isolated pane using only the target supplied by main. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentNavigation } from './agents-navigation';
const fixture=vi.hoisted(()=>({invoke:vi.fn(),navigate:vi.fn()}));
vi.mock('../bridge',()=>({desktop:{invoke:fixture.invoke}}));
vi.mock('../shell',()=>({useNavigate:()=>({navigate:fixture.navigate})}));
vi.mock('../courses/webview-pane',()=>({MoodleWebviewPane:({accountId,target,onClose}:{accountId:string;target:{url:string};onClose:()=>void})=><button data-account={accountId} onClick={onClose}>{target.url}</button>}));
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const host=document.createElement('div');document.body.append(host);
const root=createRoot(host);
afterEach(async()=>{await act(()=>root.render(null));fixture.invoke.mockReset();fixture.navigate.mockReset();});
it('consumes approved navigation once and keeps credentials out of the request',async()=>{
  fixture.invoke.mockResolvedValueOnce({accountId:'11111111-1111-4111-a111-111111111111',courseId:'22222222-2222-4222-a222-222222222222',moduleId:'33333333-3333-4333-a333-333333333333',url:'https://school.example/mod/page/view.php?id=4'});
  await act(()=>root.render(<AgentNavigation/>));
  expect(fixture.invoke).toHaveBeenCalledWith('mcp:take-navigation',{});
  expect(fixture.navigate).toHaveBeenCalledWith({view:'courses',courseId:'22222222-2222-4222-a222-222222222222'});
  expect(host.querySelector('button')?.dataset.account).toBe('11111111-1111-4111-a111-111111111111');
  expect(host.textContent).toBe('https://school.example/mod/page/view.php?id=4');
  await act(()=>host.querySelector('button')!.click());expect(host.textContent).toBe('');
});
it('does not navigate or render an empty queue',async()=>{
  fixture.invoke.mockResolvedValue(null);
  await act(()=>root.render(<AgentNavigation/>));
  expect(fixture.navigate).not.toHaveBeenCalled();expect(host.textContent).toBe('');
});
