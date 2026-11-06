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
    if(channel==='messages:list'){if(!failed){failed=true;throw new Error('VSTUDY_STATUS:'+JSON.stringify({code:'errors.network',params:{}}));}return [];}
  });
  render(<HistoryView/>);
  const alert=await screen.findByRole('alert');expect(alert.textContent).toContain(tr('errors:network'));
  fireEvent.click(within(alert).getByRole('button',{name:tr('common:retry')}));
  expect(await screen.findByText('Recovered conversation')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
