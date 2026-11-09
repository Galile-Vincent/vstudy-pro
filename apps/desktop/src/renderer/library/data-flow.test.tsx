// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LibraryView } from './index';
import { TooltipProvider } from '../components/ui/tooltip';
import { tr } from '../../shared/i18n';
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
  await waitFor(()=>expect(container.querySelector('.library-live')?.textContent)
    .toContain(tr('library:deletePartial',{
      succeeded:'1',total:'2',failed:'1',reasons:`second: ${tr('errors:generic')}`,
    })));
  fireEvent.click(await screen.findByRole('button',{name:tr('library:undo')}));
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
