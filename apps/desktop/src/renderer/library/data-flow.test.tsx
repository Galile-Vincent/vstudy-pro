// @vitest-environment jsdom
import { recovery } from './recovery';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { LibraryView } from './index';
import { TooltipProvider } from '../components/ui/tooltip';
import { i18n, tr } from '../../shared/i18n';
const state=vi.hoisted(()=>({invoke:vi.fn(),route:{view:'library',query:{}}}));
vi.mock('../bridge',()=>({desktop:{invoke:state.invoke}}));
vi.mock('../shell',()=>({useNavigate:()=>({route:state.route,navigate:vi.fn()})}));
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
const row=(id:string)=>({document:{id,title:id,sourceName:id+'.md',mime:'text/markdown',status:'ready',createdAt:'2026-11-01T00:00:00Z'},tags:[],folderId:null,sizeBytes:10,contentChars:null,pageCount:null,lastOpenedAt:null,pinnedAt:null,pinned:false});
function mount(){localStorage.setItem('library-mode','files');document.documentElement.lang='en';document.documentElement.style.fontSize='16px';document.documentElement.style.setProperty('--library-row-height','4');return render(<TooltipProvider><LibraryView/></TooltipProvider>);}
afterEach(()=>{cleanup();vi.resetAllMocks();localStorage.clear();sessionStorage.clear();});
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
 expect(retry.closest<HTMLElement>('.library-document')!.style.height).toBe('auto');
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
});
