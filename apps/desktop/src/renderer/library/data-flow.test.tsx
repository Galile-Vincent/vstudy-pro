// @vitest-environment jsdom
import { recovery } from './recovery';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { LibraryView } from './index';
import { TooltipProvider } from '../components/ui/tooltip';
import { i18n, tr } from '../../shared/i18n';
const state=vi.hoisted(()=>({invoke:vi.fn(),art:vi.fn(),route:{view:'library',query:{}}}));
vi.mock('../shell/document-art',()=>({DocumentArt:({id}:{id:string})=>{state.art(id);return <span/>;}}));
vi.mock('../bridge',()=>({desktop:{invoke:state.invoke}}));
vi.mock('../shell',()=>({useNavigate:()=>({route:state.route,navigate:vi.fn()})}));
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
const row=(id:string)=>({document:{id,title:id,sourceName:id+'.md',mime:'text/markdown',status:'ready',createdAt:'2026-11-01T00:00:00Z'},tags:[],folderId:null,sizeBytes:10,contentChars:null,pageCount:null,lastOpenedAt:null,pinnedAt:null,pinned:false});
function mount(){localStorage.setItem('library-mode','files');document.documentElement.lang='en';document.documentElement.style.fontSize='16px';document.documentElement.style.setProperty('--library-row-height','4');return render(<TooltipProvider><LibraryView/></TooltipProvider>);}
afterEach(()=>{state.route.query={};cleanup();vi.resetAllMocks();localStorage.clear();sessionStorage.clear();});
it('offers Undo for the first deletion when the next deletion fails',async()=>{
  let deleted=false;
  state.invoke.mockImplementation(async(channel,payload)=>{
    if(channel==='library:documents:list')return {items:deleted?[row('second')]:[row('first'),row('second')],nextCursor:null};
    if(channel==='library:documents:softDelete'){if(payload.documentId==='second')throw new Error('failed');deleted=true;return {ok:true};}
    if(channel==='library:documents:restore'){deleted=false;return {ok:true};}
    return [];
  });
  const {container}=mount();await screen.findByText('first');
  fireEvent.keyDown(container.querySelector('.library-results')!,{key:'a',ctrlKey:true});
  fireEvent.click(await screen.findByRole('button',{name:tr('library:delete')}));
  await waitFor(()=>expect(document.querySelector('.library-live')?.textContent)
    .toContain(tr('library:deletePartial',{
      succeeded:'1',total:'2',failed:'1',reasons:`second: ${tr('errors:generic')}`,
    })));
  fireEvent.click(await screen.findByRole('button',{name:/Undo/}));
  await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('library:documents:restore',{documentId:'first'}));
  expect(state.invoke).not.toHaveBeenCalledWith('library:documents:restore',{documentId:'second'});
});
it.each([false,true])('ignores a stale Select All page after the library refreshes (failure %s)',async fail=>{
  let resolvePage!:(value:unknown)=>void,rejectPage!:(error:Error)=>void,phase=0;
  state.invoke.mockImplementation(async(channel,payload)=>{
    if(channel!=='library:documents:list')return [];
    if(payload.cursor)return await new Promise((resolve,reject)=>{resolvePage=resolve;rejectPage=reject;});
    return phase?{items:[row('current')],nextCursor:null}:{items:[row('old'),...Array.from({length:19},(_,i)=>row('extra'+i))],nextCursor:{id:'old',sortValue:0}};
  });
  const {container}=mount();await screen.findByText('old');
  fireEvent.keyDown(container.querySelector('.library-results')!,{key:'a',ctrlKey:true});
  await waitFor(()=>expect(resolvePage).toBeTruthy());
  phase=1;act(()=>window.dispatchEvent(new Event('library-changed')));await screen.findByText('current');
  await act(async()=>{if(fail)rejectPage(new Error('old request failed'));else resolvePage({items:[row('stale')],nextCursor:null});});
  expect(screen.getByText('current')).toBeTruthy();expect(screen.queryByText('stale')).toBeNull();
  expect(screen.queryByRole('button',{name:tr('library:delete')})).toBeNull();
});
it('falls back to the default sort when stored JSON is corrupt',async()=>{
  localStorage.setItem('library-sort:all','{broken');
  state.invoke.mockImplementation(async channel=>channel==='library:documents:list'?{items:[row('Readable library')],nextCursor:null}:[]);
  mount();expect(await screen.findByText('Readable library')).toBeTruthy();
});

it('keeps both deletion recoveries across Library navigation',async()=>{
  const deleted=new Set<string>();
  state.invoke.mockImplementation(async(channel,payload)=>{
    if(channel==='library:documents:list')return {items:['first','second'].filter(id=>!deleted.has(id)).map(row),nextCursor:null};
    if(channel==='library:documents:softDelete')deleted.add(payload.documentId);
    if(channel==='library:documents:restore')deleted.delete(payload.documentId);
    return [];
  });
  let view=mount();
  for(const id of ['first','second']){
    fireEvent.click((await screen.findByText(id)).closest('.library-document')!);
    fireEvent.click(await screen.findByRole('button',{name:tr('library:delete')}));
    await waitFor(()=>expect(deleted.has(id)).toBe(true));
    await waitFor(()=>expect(screen.queryByText(id)).toBeNull());
  }
  view.unmount();view=mount();
  fireEvent.click(await screen.findByRole('button',{name:/Undo/}));
  await screen.findByText('second');
  fireEvent.click(await screen.findByRole('button',{name:/Undo/}));
  await screen.findByText('first');
});

it.each([false,true])('reports failed moves truthfully and keeps the picker open (partial %s)',async partial=>{
 state.invoke.mockImplementation(async(channel,payload)=>{
   if(channel==='library:documents:list')return {items:[row('first'),row('second'),row('third')],nextCursor:null};
   if(channel==='library:tree')return [{id:'destination',name:'Destination',parentId:null}];
   if(channel==='library:documents:move' && (!partial || payload.documentIds.includes('third')))throw new Error('VSTUDY_STATUS:'+JSON.stringify({code:'library.folder_missing',params:{}}));
   return [];
 });
 const {container}=mount();await screen.findByText('first');
 fireEvent.keyDown(container.querySelector('.library-results')!,{key:'a',ctrlKey:true});
 fireEvent.click(await screen.findByRole('button',{name:tr('library:move')}));
 const treeCalls=state.invoke.mock.calls.filter(([c])=>c==='library:tree').length;
 fireEvent.click(await screen.findByRole('button',{name:'Destination'}));
 await waitFor(()=>expect(state.invoke.mock.calls.filter(([c])=>c==='library:tree').length).toBeGreaterThan(treeCalls));
 await waitFor(()=>expect(document.querySelector('.library-live')?.textContent).toContain('Folder not found'));
 expect(screen.getByRole('dialog',{name:tr('library:move')}).textContent).toContain('Folder not found');
 expect(container.querySelector('.library-toast')?.textContent).not.toContain(tr('library:moved'));
 if(partial){
   fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:tr('library:close')}));
   expect(document.querySelector('.library-live')?.textContent).toContain('2 of 3 moved, 1 failed');
   fireEvent.click(screen.getByRole('button',{name:/Undo/}));
   await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('library:documents:move',{documentIds:['second'],folderId:null}));
   await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('library:documents:move',{documentIds:['first'],folderId:null}));
   expect(state.invoke).not.toHaveBeenCalledWith('library:documents:move',{documentIds:['third'],folderId:null});
 }else expect(screen.queryByRole('button',{name:/Undo/})).toBeNull();
});

it('groups a bulk delete as one titled recovery action',async()=>{
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:[row('first'),row('second')],nextCursor:null}:[]);
 const {container}=mount();await screen.findByText('first');
 fireEvent.keyDown(container.querySelector('.library-results')!,{key:'a',ctrlKey:true});
 fireEvent.click(screen.getByRole('button',{name:tr('library:delete')}));
 const undo=await screen.findByRole('button',{name:/Undo.*2 documents/});
 expect(undo.textContent).toBe('Undo');
 fireEvent.click(undo);
 await waitFor(()=>expect(state.invoke.mock.calls.filter(([c])=>c==='library:documents:restore')).toHaveLength(2));
});

it('clears a failed move notice when reopening the picker',async()=>{
 state.invoke.mockImplementation(async c=>{
  if(c==='library:documents:list')return {items:[row('first')],nextCursor:null};
  if(c==='library:tree')return [{id:'destination',name:'Destination',parentId:null}];
  if(c==='library:documents:move')throw new Error('failed');
  return [];
 });
 mount();fireEvent.click((await screen.findByText('first')).closest('.library-document')!);
 fireEvent.click(screen.getByRole('button',{name:tr('library:move')}));
 fireEvent.click(screen.getByRole('button',{name:'Destination'}));
 await waitFor(()=>expect(screen.getByRole('dialog').textContent).toContain('failed'));
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:tr('library:close')}));
 fireEvent.click(screen.getByText('first').closest('.library-document')!);
 fireEvent.click(screen.getByRole('button',{name:tr('library:move')}));
 expect(screen.getByRole('dialog').textContent).not.toContain('failed');
});

it.each(['delete','move'])('ignores a double click during %s',async action=>{
 let finish!:()=>void;
 const channel=action==='delete'?'library:documents:softDelete':'library:documents:move';
 state.invoke.mockImplementation(async c=>{
  if(c==='library:documents:list')return {items:[row('first')],nextCursor:null};
  if(c==='library:tree')return [{id:'destination',name:'Destination',parentId:null}];
  if(c===channel)await new Promise<void>(resolve=>{finish=resolve;});
  return [];
 });
 mount();fireEvent.click((await screen.findByText('first')).closest('.library-document')!);
 let button=screen.getByRole('button',{name:tr(`library:${action}`)});
 if(action==='move'){fireEvent.click(button);button=screen.getByRole('button',{name:'Destination'});}
 fireEvent.click(button);fireEvent.click(button);
 expect(state.invoke.mock.calls.filter(([c])=>c===channel)).toHaveLength(1);
 await act(async()=>finish());
});

it('keeps one persistent live region through the move dialog',async()=>{
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:[row('first')],nextCursor:null}:[]);
 mount();await screen.findByText('first');
 const live=document.querySelector('.library-live');
 fireEvent.click(screen.getByText('first').closest('.library-document')!);
 fireEvent.click(screen.getByRole('button',{name:tr('library:move')}));
 expect(document.querySelectorAll('.library-live')).toHaveLength(1);
 expect(document.querySelector('.library-live')).toBe(live);
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:tr('library:close')}));
 expect(document.querySelector('.library-live')).toBe(live);
 expect(document.querySelectorAll('.library-toast[role="status"]')).toHaveLength(0);
});

beforeEach(() => recovery.reset());

it('translates an existing recovery when the language changes',async()=>{
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:[row('first')],nextCursor:null}:[]);
 mount();fireEvent.click((await screen.findByText('first')).closest('.library-document')!);
 fireEvent.click(screen.getByRole('button',{name:tr('library:delete')}));
 await screen.findByRole('button',{name:/Undo.*first/});
 await act(async()=>{await i18n.changeLanguage('ja');});
 expect(document.querySelector('.library-toast')?.textContent).toContain('を削除しました');
 await act(async()=>{await i18n.changeLanguage('en');});
});


it.each([false, true])('keeps recovery outside optional metadata (grid %s)', async grid => {
 localStorage.setItem('library-grid', String(grid));
 document.documentElement.style.setProperty('--art-reader-card-height', '300');
 const failed = row('Broken notes'); failed.document.status = 'failed';
 state.invoke.mockImplementation(async c => c === 'library:documents:list'
  ? {items: [failed], nextCursor: null} : []);
 mount(); await screen.findByText('Broken notes', {selector: 'button'});
 const retry = screen.getByRole('button', {name: tr('library:retry')});
 expect(retry.closest('.document-status')).toBeTruthy();
 expect(retry.closest('.document-meta,.document-added')).toBeNull();
 const entry=retry.closest<HTMLElement>('.library-document')!;
 expect(entry.style.position).toBe('absolute');
 expect(parseFloat(entry.style.height)).toBeGreaterThan(grid ? 300 : 64);
 expect(entry.style.minHeight).toBe(entry.style.height);
});


it('retains existing selections across conversion polls and removes departed IDs', async () => {
 let rows = [row('selected'), row('departed'), row('converting')];
 rows[2]!.document.status = 'converting';
 state.invoke.mockImplementation(async c => c === 'library:documents:list'
  ? {items: rows, nextCursor: null} : []);
 mount(); await screen.findByText('selected', {selector: 'button'});
 fireEvent.click(screen.getByText('selected').closest('.library-document')!);
 fireEvent.click(screen.getByText('departed').closest('.library-document')!, {ctrlKey: true});
 const calls = state.invoke.mock.calls.length;
 await waitFor(() => expect(state.invoke.mock.calls.length).toBeGreaterThan(calls), {timeout: 2500});
 expect(document.querySelectorAll('[data-selected=true]')).toHaveLength(2);
 rows = rows.filter(r => r.document.id !== 'departed');
 act(() => window.dispatchEvent(new Event('library-changed')));
 await waitFor(() => expect(screen.queryByText('departed')).toBeNull());
 expect(document.querySelectorAll('[data-selected=true]')).toHaveLength(1);
 expect(screen.getByText('selected').closest('.library-document')?.getAttribute('data-selected')).toBe('true');
 expect(document.querySelector('.library-live')?.textContent).toContain(tr('library:selectedMissing',{count:1}));
});


it('keeps keyboard focus mounted and a rendered entry point after scrolling', async () => {
 state.invoke.mockImplementation(async c => c === 'library:documents:list'
  ? {items: Array.from({length:200}, (_, i) => row('doc' + i)), nextCursor:null} : []);
 const {container} = mount(); await screen.findByText('doc0');
 const first = container.querySelector<HTMLElement>('[data-index="0"]')!;
 act(() => first.focus());
 const viewport = container.querySelector('.library-results')!;
 fireEvent.scroll(viewport, {target:{scrollTop:6400}});
 expect(document.activeElement).toBe(first);
 expect(first.isConnected).toBe(true);
 expect(container.querySelectorAll('.library-document[tabindex="0"]')).toHaveLength(1);
});

it.each([['End',199], ['Home',0], ['PageDown',6], ['PageUp',0]] as const)(
 'scrolls and focuses the %s keyboard target', async (key, index) => {
 state.invoke.mockImplementation(async c => c === 'library:documents:list'
  ? {items: Array.from({length:200}, (_, i) => row('doc' + i)), nextCursor:null} : []);
 const {container} = mount(); await screen.findByText('doc0');
 const first = container.querySelector<HTMLElement>('[data-index="0"]')!;
 const viewport=container.querySelector<HTMLElement>('.library-results')!;
 Object.defineProperty(viewport,'clientHeight',{configurable:true,value:400});
 act(() => first.focus()); fireEvent.keyDown(first, {key});
 await waitFor(() => expect(document.activeElement?.getAttribute('data-index')).toBe(String(index)));
 expect(viewport.scrollTop).toBe(index*64);
});


it.each(['back', 'breadcrumb'])('restores the originating folder after %s navigation', async action => {
 state.invoke.mockImplementation(async c => c === 'library:documents:list'
  ? {items:[row('inside')], nextCursor:null} : []);
 mount(); await screen.findByText('inside');
 fireEvent.click(screen.getByRole('button', {name:tr('library:viewFolders')}));
 const folder = screen.getByRole('button', {name:tr('library:openFolder', {name:tr('library:unfiled')})});
 act(() => folder.focus()); fireEvent.click(folder);
 expect(document.activeElement).toBe(screen.getByRole('heading', {level:1, name:tr('library:unfiled')}));
 fireEvent.click(action === 'back'
  ? screen.getByRole('button', {name:tr('library:backToFolders')})
  : document.querySelector('.folder-crumb-root')!);
 expect(document.activeElement).toBe(screen.getByRole('button', {name:tr('library:openFolder', {name:tr('library:unfiled')})}));
});


it('exposes Space and range selection through labelled checkboxes', async () => {
 state.invoke.mockImplementation(async c => c === 'library:documents:list'
  ? {items:[row('first'),row('second')], nextCursor:null} : []);
 mount(); await screen.findByText('first');
 const first = screen.getByText('first').closest<HTMLElement>('.library-document')!;
 act(() => first.focus()); fireEvent.keyDown(first, {key:' '});
 expect(within(first).getByRole('checkbox', {checked:true})).toBeTruthy();
 fireEvent.keyDown(first, {key:'ArrowDown', shiftKey:true});
 expect(screen.getAllByRole('checkbox', {checked:true})).toHaveLength(2);
 expect(screen.getByRole('listitem', {name:/second.*Selected/})).toBeTruthy();
 fireEvent.click(within(first).getByRole('checkbox'));
 expect(within(first).getByRole('checkbox', {checked:false})).toBeTruthy();
});

it.each(['delete', 'move', 'query', 'refresh'])('bounds selection restoration after %s in 5000 rows', async action => {
 let departed = false;
 const rows = Array.from({length:5000}, (_, i) => row('doc' + i));
 state.invoke.mockImplementation(async (c, q) => {
  if(c === 'library:documents:softDelete' || c === 'library:documents:move') { departed = true; return {}; }
  if(c !== 'library:documents:list') return [];
  const filtered = rows.filter(r => !(departed || q.text) || r.document.id !== 'doc0');
  const offset = q.cursor?.sortValue ?? 0;
  return {items:filtered.slice(offset, offset+50), nextCursor:offset+50<filtered.length
   ? {id:'cursor',sortValue:offset+50}:null};
 });
 mount(); fireEvent.click((await screen.findByText('doc0')).closest('.library-document')!);
 const count = () => state.invoke.mock.calls.filter(([c]) => c === 'library:documents:list').length;
 const before = count();
 if(action === 'delete') fireEvent.click(screen.getByRole('button',{name:tr('library:delete')}));
 else if(action === 'move') {
  fireEvent.click(screen.getByRole('button',{name:tr('library:move')}));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:tr('library:unfiled')}));
 }
 else if(action === 'query') fireEvent.change(screen.getByRole('textbox',{name:tr('library:search')}),{target:{value:'exclude'}});
 else { departed=true; act(()=>window.dispatchEvent(new Event('library-changed'))); }
 await waitFor(()=>expect(count()).toBeGreaterThan(before));
 await waitFor(()=>expect(screen.queryByText('doc0')).toBeNull());
 expect(count()-before).toBeLessThanOrEqual(3);
 expect(document.querySelectorAll('[data-selected=true]')).toHaveLength(0);
});

it.each([false,true])('windows 5000 documents with a failed item (grid %s)', async grid => {
 localStorage.setItem('library-grid',String(grid));
 document.documentElement.style.setProperty('--art-reader-card-height','300');
 const rows=Array.from({length:5000},(_,i)=>row('doc'+i));
 rows[1]!.document.status='failed';
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:rows,nextCursor:null}:[]);
 const {container}=mount(); await screen.findByText('doc0');
 expect(container.querySelectorAll('.library-document').length).toBeLessThan(80);
});

it('renders only the changed card on a conversion refresh', async () => {
 localStorage.setItem('library-grid','true');
 document.documentElement.style.setProperty('--art-reader-card-height','300');
 let rows=Array.from({length:200},(_,i)=>row('doc'+i));
 rows[1]!.document.status='converting';
 state.invoke.mockImplementation(async c=>c==='library:documents:list'
  ? {items:structuredClone(rows),nextCursor:null}:[]);
 mount(); await screen.findByText('doc0');
 state.art.mockClear();
 rows=structuredClone(rows); rows[1]!.document.title='Updated';
 act(()=>window.dispatchEvent(new Event('library-changed')));
 await screen.findByText('Updated');
 expect(state.art.mock.calls.map(([id])=>id)).toEqual(['doc1']);
});

it.each([false,true])('retries a failed row with Enter without nested tab stops (grid %s)', async grid => {
 localStorage.setItem('library-grid',String(grid));
 document.documentElement.style.setProperty('--art-reader-card-height','300');
 const failed=row('failed'); failed.document.status='failed';
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:[failed],nextCursor:null}:[]);
 mount(); const title=await screen.findByText('failed',{selector:'button'});
 const entry=title.closest<HTMLElement>('.library-document')!;
 for(const button of entry.querySelectorAll('button,input')) expect(button.getAttribute('tabindex')).toBe('-1');
 act(()=>entry.focus()); fireEvent.keyDown(entry,{key:'Enter'});
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('documents:retry',{documentId:'failed'}));
});

it('does not steal search focus after choosing files repeatedly', async () => {
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:[row('inside')],nextCursor:null}:[]);
 mount(); await screen.findByText('inside');
 const files=screen.getByRole('button',{name:tr('library:viewFiles')});
 fireEvent.click(files); fireEvent.click(files);
 const search=screen.getByRole('textbox',{name:tr('library:search')});
 act(()=>search.focus()); fireEvent.change(search,{target:{value:'inside'}});
 await waitFor(()=>expect(state.invoke.mock.calls.some(([c,q])=>c==='library:documents:list' && q.text==='inside')).toBe(true));
 expect(document.activeElement).toBe(search);
});

it.each([false,true])('falls back when the originating folder disappears (other folder %s)', async other => {
 let rows=[row('inside')];
 const remaining={...row('remaining'),course:{id:'course',fullName:'Other',identity:{title:{en:'Other',zh:'其他'},teachers:[],term:'1142'}}};
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:rows,nextCursor:null}:[]);
 mount(); await screen.findByText('inside');
 fireEvent.click(screen.getByRole('button',{name:tr('library:viewFolders')}));
 fireEvent.click(screen.getByRole('button',{name:tr('library:openFolder',{name:tr('library:unfiled')})}));
 rows=other?[remaining]:[];
 act(()=>window.dispatchEvent(new Event('library-changed')));
 await waitFor(()=>expect(document.activeElement).toBe(other
  ? screen.getByRole('button',{name:tr('library:openFolder',{name:'Other'})})
  : screen.getByRole('heading',{level:1})));
});

it('preserves a page two selection on refresh and clears it on a query change', async () => {
 const rows=Array.from({length:5000},(_,i)=>row('doc'+i));
 state.invoke.mockImplementation(async(c,q)=>{
  if(c!=='library:documents:list')return [];
  const offset=q.cursor?.sortValue??0;
  const limit=q.limit;
  return {items:rows.slice(offset,offset+limit),nextCursor:{id:'next',sortValue:offset+limit}};
 });
 const {container}=mount(); await screen.findByText('doc0');
 fireEvent.click(screen.getByRole('button',{name:tr('library:loadMore')}));
 await waitFor(()=>expect(state.invoke.mock.calls.some(([c,q])=>c==='library:documents:list' && q.cursor)).toBe(true));
 await waitFor(()=>expect(container.querySelector('[aria-setsize="100"]')).toBeTruthy());
 const first=container.querySelector<HTMLElement>('[data-index="0"]')!;
 fireEvent.keyDown(first,{key:'End'});
 const last=await screen.findByRole('listitem',{name:/doc99/});
 fireEvent.click(last);
 const before=state.invoke.mock.calls.filter(([c])=>c==='library:documents:list').length;
 act(()=>window.dispatchEvent(new Event('library-changed')));
 await waitFor(()=>expect(state.invoke.mock.calls.filter(([c])=>c==='library:documents:list').length).toBeGreaterThan(before));
 await waitFor(()=>expect(screen.getByRole('listitem',{name:/doc99.*Selected/})).toBeTruthy());
 expect(state.invoke.mock.calls.filter(([c])=>c==='library:documents:list').length-before).toBe(1);
 fireEvent.change(screen.getByRole('textbox',{name:tr('library:search')}),{target:{value:'new query'}});
 await waitFor(()=>expect(state.invoke.mock.calls.some(([c,q])=>c==='library:documents:list' && q.text)).toBe(true));
 expect(document.querySelectorAll('[data-selected=true]')).toHaveLength(0);
});

it.each(['en','zh-Hant','ja'])('localizes row name punctuation (%s)', async locale => {
 await i18n.changeLanguage(locale);
 state.invoke.mockImplementation(async c=>c==='library:documents:list'?{items:[row('Notes')],nextCursor:null}:[]);
 mount(); await screen.findByText('Notes');
 const punctuation=locale==='en'?', ':'、';
 expect(screen.getByRole('listitem',{name:`Notes${punctuation}${tr('library:itemUnselected')}`})).toBeTruthy();
 await i18n.changeLanguage('en');
});

it('keeps all 3000 selected targets after refresh and conversion poll', async () => {
 const rows=Array.from({length:3000},(_,i)=>row('doc'+i));
 rows[0]!.document.status='converting';
 state.invoke.mockImplementation(async(c,q)=>{
  if(c!=='library:documents:list')return [];
  const offset=q.cursor?.sortValue??0;
  return {items:rows.slice(offset,offset+q.limit),nextCursor:offset+q.limit<rows.length
   ? {id:'next',sortValue:offset+q.limit}:null};
 });
 const {container}=mount(); await screen.findByText('doc0');
 fireEvent.keyDown(container.querySelector('.library-results')!,{key:'a',ctrlKey:true});
 await waitFor(()=>expect(container.querySelector('.bulk-bar')?.textContent).toContain('3,000'));
 act(()=>window.dispatchEvent(new Event('library-changed')));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1700));});
 expect(container.querySelector('.bulk-bar')?.textContent).toContain('3,000');
 fireEvent.click(screen.getByRole('button',{name:tr('library:delete')}));
 await waitFor(()=>expect(state.invoke.mock.calls.filter(([c])=>c==='library:documents:softDelete')).toHaveLength(3000),{timeout:10000});
});

it('retains a selected document and its move target when it leaves a filtered view', async () => {
 state.route.query={status:'failed'};
 let visible=true;
 const item=row('first');item.document.status='failed';
 state.invoke.mockImplementation(async(c)=>{
  if(c==='library:documents:list')return {items:visible?[item]:[],nextCursor:null};
  if(c==='library:tree')return [{id:'destination',name:'Destination',parentId:null}];
  return [];
 });
 mount();fireEvent.click((await screen.findByText('first',{selector:'button'})).closest('.library-document')!);
 visible=false;act(()=>window.dispatchEvent(new Event('library-changed')));
 await waitFor(()=>expect(screen.queryByText('first',{selector:'button'})).toBeNull());
 expect(document.querySelector('.bulk-bar')?.textContent).toContain('1 selected');
 expect(document.querySelector('.library-live')?.textContent).not.toContain(tr('library:selectedMissing',{count:1}));
 fireEvent.click(screen.getByRole('button',{name:tr('library:move')}));
 fireEvent.click(screen.getByRole('button',{name:'Destination'}));
 await waitFor(()=>expect(state.invoke).toHaveBeenCalledWith('library:documents:move',{documentIds:['first'],folderId:'destination'}));
 state.route.query={};
});

it('keeps 300 loaded rows, scroll and active row after a poll', async () => {
 const rows=Array.from({length:500},(_,i)=>row('doc'+i));
 rows[0]!.document.status='converting';
 state.invoke.mockImplementation(async(c,q)=>{
  if(c!=='library:documents:list')return [];
  const offset=q.cursor?.sortValue??0;
  return {items:structuredClone(rows.slice(offset,offset+q.limit)),
   nextCursor:{id:'next',sortValue:offset+q.limit}};
 });
 const {container}=mount(); await screen.findByText('doc0');
 for(let i=2;i<=6;i++){
  fireEvent.click(screen.getByRole('button',{name:tr('library:loadMore')}));
  await waitFor(()=>expect(container.querySelector('[aria-setsize="'+i*50+'"]')).toBeTruthy());
 }
 const viewport=container.querySelector<HTMLElement>('.library-results')!;
 Object.defineProperty(viewport,'scrollHeight',{configurable:true,value:19200});
 fireEvent.scroll(viewport,{target:{scrollTop:12800}});
 const active=container.querySelector<HTMLElement>('[data-index="200"]')!;
 act(()=>active.focus());
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1700));});
 expect(container.querySelector('[aria-setsize="300"]')).toBeTruthy();
 expect(viewport.scrollTop).toBe(12800);
 expect(active.isConnected).toBe(true);
 rows[200]!.document.title='Refreshed active row';
 act(()=>window.dispatchEvent(new Event('library-changed')));
 await screen.findByText('Refreshed active row');
 expect(container.querySelector('[aria-setsize="300"]')).toBeTruthy();
 expect(viewport.scrollTop).toBe(12800);
 expect(active.isConnected).toBe(true);
});

it('bounds mounted rows after deletion with scroll past the content end', async () => {
 let rows=Array.from({length:5001},(_,i)=>row('doc'+i));
 state.invoke.mockImplementation(async(c)=>{
  if(c==='library:documents:softDelete'){rows=rows.slice(1);return {};}
  return c==='library:documents:list'?{items:rows,nextCursor:null}:[];
 });
 const {container}=mount(); await screen.findByText('doc0');
 fireEvent.click(screen.getByText('doc0').closest('.library-document')!);
 fireEvent.scroll(container.querySelector('.library-results')!,{target:{scrollTop:320000}});
 fireEvent.click(screen.getByRole('button',{name:tr('library:delete')}));
 await waitFor(()=>expect(container.querySelector('[aria-setsize="5000"]')).toBeTruthy(),{timeout:10000});
 expect(container.querySelectorAll('.library-document').length).toBeLessThan(80);
});
