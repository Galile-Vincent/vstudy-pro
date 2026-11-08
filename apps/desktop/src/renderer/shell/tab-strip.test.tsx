// @vitest-environment jsdom
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {TabStrip} from './tab-strip';
const fixture=vi.hoisted(()=>({navigation:{} as Record<string,unknown>,invoke:vi.fn()}));
vi.mock('./index',()=>({useNavigate:()=>fixture.navigation}));
vi.mock('../bridge',()=>({desktop:{invoke:fixture.invoke}}));
afterEach(()=>{cleanup();vi.useRealTimers();});
it('does not send a stale destructive chat sync after awaiting Moodle',async()=>{
 vi.useFakeTimers();let release!:(value:unknown)=>void;
 const pending=new Promise(resolve=>{release=resolve;});
 const tab=(id:string)=>({id,title:id,icon:'Home',history:{entries:[{view:'home'}],index:0}});
 fixture.navigation={tabs:{activeId:'first',tabs:[tab('first')]},openTab:vi.fn(),activateTab:vi.fn(),closeTab:vi.fn(),reorderTabs:vi.fn()};
 fixture.invoke.mockImplementation((channel:string)=>channel==='moodle:webview-sync'?pending:Promise.resolve({tabs:[]}));
 const view=render(<TabStrip/>);
 fixture.navigation={...fixture.navigation,tabs:{activeId:'second',tabs:[tab('first'),tab('second')]}};
 view.rerender(<TabStrip/>);
 await act(async()=>{release({tabs:[]});await pending;});
 const calls=fixture.invoke.mock.calls.filter(([channel])=>channel==='web-chat:sync');
 expect(calls).toHaveLength(1);expect(calls[0]![1]).toEqual({tabIds:['first','second']});
});
it('shows the existing limit message for attempts outside the picker',async()=>{
 fixture.navigation={tabs:{activeId:'0',tabs:Array.from({length:30},(_,i)=>({id:String(i),title:String(i),icon:'Home',history:{entries:[{view:'home'}],index:0}}))},openTab:vi.fn(),activateTab:vi.fn(),closeTab:vi.fn(),reorderTabs:vi.fn()};
 fixture.invoke.mockResolvedValue({tabs:[]});
 const view=render(<TabStrip/>);await act(async()=>{window.dispatchEvent(new Event('vstudy:tab-limit'));});
 expect(view.baseElement.textContent).toContain('30');expect(view.baseElement.querySelector('.app-tabs-menu')).not.toBeNull();
});
it('syncs hosted chats even when Moodle sync fails',async()=>{
 fixture.navigation={tabs:{activeId:'first',tabs:[{id:'first',title:'Home',icon:'Home',history:{entries:[{view:'home'}],index:0}}]},openTab:vi.fn(),activateTab:vi.fn(),closeTab:vi.fn(),reorderTabs:vi.fn()};
 fixture.invoke.mockClear();fixture.invoke.mockImplementation((channel:string)=>channel==='moodle:webview-sync'?Promise.reject(Error('offline')):Promise.resolve({tabs:[]}));
 render(<TabStrip/>);await act(async()=>{});
 expect(fixture.invoke).toHaveBeenCalledWith('web-chat:sync',{tabIds:['first']});
});
