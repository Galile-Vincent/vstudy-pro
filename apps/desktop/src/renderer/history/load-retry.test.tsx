// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryView } from './index';
import { tr } from '../../shared/i18n';
const state=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('../bridge',()=>({desktop:state}));
vi.mock('../shell',()=>({useNavigate:()=>({route:{conversationId:'chat'},navigate:vi.fn()})}));
vi.mock('./search',()=>({HistorySearch:()=>null}));
vi.mock('../chat',()=>({Chat:()=> <p>Recovered conversation</p>}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('keeps the typed load error visible and retries the conversation',async()=>{
  let failed=false;
  state.invoke.mockImplementation(async channel=>{
    if(channel==='providers:list')return [];
    if(channel==='chats:get')return {id:'chat',scope:'general',providerId:'anthropic-api',modelId:'fake'};
    if(channel==='messages:page'){if(!failed){failed=true;throw new Error('VSTUDY_STATUS:'+JSON.stringify({code:'errors.network',params:{}}));}return {items:[],nextCursor:null};}
  });
  render(<HistoryView/>);
  const alert=await screen.findByRole('alert');expect(alert.textContent).toContain(tr('errors:network'));
  fireEvent.click(within(alert).getByRole('button',{name:tr('common:retry')}));
  expect(await screen.findByText('Recovered conversation')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
it('opens a conversation using only the recent message page',async()=>{
  state.invoke.mockImplementation(async channel=>{
    if(channel==='providers:list')return [];
    if(channel==='chats:get')return {id:'chat',scope:'general',providerId:'anthropic-api',modelId:'fake'};
    if(channel==='messages:page')return {items:[],nextCursor:{createdAt:'2026-11-01T00:00:00Z',id:'oldest-loaded'}};
    throw new Error('Unexpected unbounded read');
  });
  render(<HistoryView/>);expect(await screen.findByText('Recovered conversation')).toBeTruthy();
  expect(state.invoke).toHaveBeenCalledWith('messages:page',{conversationId:'chat',limit:50,direction:'backward'});
  expect(state.invoke).not.toHaveBeenCalledWith('messages:list',expect.anything());
});

it.each(['rejects','never settles'])('opens readable history even when provider discovery %s',async failure=>{
  state.invoke.mockImplementation(async channel=>{
    if(channel==='providers:list'){
      if(failure==='rejects')throw new Error('keychain unavailable');
      return new Promise(()=>{});
    }
    if(channel==='chats:get')return {id:'chat',scope:'general',providerId:'anthropic-api',modelId:'fake'};
    if(channel==='messages:page')return {items:[],nextCursor:null};
  });
  render(<HistoryView/>);
  expect(await screen.findByText('Recovered conversation')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
