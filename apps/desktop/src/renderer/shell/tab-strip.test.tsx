// @vitest-environment jsdom
import {act,cleanup,render,fireEvent} from '@testing-library/react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {TabStrip} from './tab-strip';
const fixture=vi.hoisted(()=>({navigation:{} as Record<string,unknown>,invoke:vi.fn()}));
vi.mock('./index',()=>({useNavigate:()=>fixture.navigation}));
vi.mock('../bridge',()=>({desktop:{invoke:fixture.invoke}}));
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }));
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
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

it('keeps one tab stop and supports navigation, reordering and Delete', async () => {
 const tab = (id: string) => ({ id, title: id, icon: 'Home', history: { entries: [{ view: 'home' }], index: 0 } });
 const activateTab = vi.fn(), closeTab = vi.fn(), reorderTabs = vi.fn();
 fixture.navigation = { tabs: { activeId: 'first', tabs: [tab('first'), tab('second')] }, activateTab, closeTab, reorderTabs, openTab: vi.fn() };
 fixture.invoke.mockResolvedValue({ tabs: [] });
 const view = render(<TabStrip />);
 const tabs = view.getAllByRole('tab');
 expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1]);
 expect([...view.container.querySelectorAll<HTMLButtonElement>('.app-tab-close')].map(button => button.tabIndex)).toEqual([-1, -1]);
 for (const key of ['ArrowRight', 'End']) {
   fireEvent.keyDown(tabs[0]!, { key });
   expect(activateTab).toHaveBeenLastCalledWith('second');
 }
 fireEvent.keyDown(tabs[1]!, { key: 'Home' });
 expect(activateTab).toHaveBeenLastCalledWith('first');
 fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight', shiftKey: true });
 expect(reorderTabs).toHaveBeenCalledWith(['second', 'first']);
 expect(view.getByRole('status').textContent).not.toBe('');
 fireEvent.keyDown(tabs[0]!, { key: 'Delete' });
 expect(closeTab).toHaveBeenCalledWith('first');
 await act(async () => {});
});

it('ignores held, modified and composing Delete presses', async () => {
 const tab = (id: string) => ({ id, title: id, icon: 'Home', history: { entries: [{ view: 'home' }], index: 0 } });
 const closeTab = vi.fn();
 fixture.navigation = { tabs: { activeId: 'first', tabs: [tab('first'), tab('second')] },
   closeTab, activateTab: vi.fn(), reorderTabs: vi.fn(), openTab: vi.fn() };
 fixture.invoke.mockResolvedValue({ tabs: [] });
 const view = render(<TabStrip />);
 const first = view.getAllByRole('tab')[0]!;
 for (const flag of ['repeat', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing']) {
   fireEvent.keyDown(first, { key: 'Delete', [flag]: true });
 }
 expect(closeTab).not.toHaveBeenCalled();
 fireEvent.keyDown(first, { key: 'Delete' });
 for (let i = 0; i < 10; i++) fireEvent.keyDown(first, { key: 'Delete', repeat: true });
 expect(closeTab).toHaveBeenCalledTimes(1);
 await act(async () => {});
});
