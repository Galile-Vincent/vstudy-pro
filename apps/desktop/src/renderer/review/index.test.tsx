// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReviewView } from './index';
const { invoke, navigate } = vi.hoisted(() => ({ invoke: vi.fn(), navigate: vi.fn() }));
vi.mock('../bridge', () => ({desktop:{invoke}}));
vi.mock('../shell', () => ({useNavigate:()=>({navigate, route:{view:'review'}})}));
vi.mock('../../shared/i18n', () => ({tr:(key:string)=>key}));
vi.mock('react-i18next', () => ({useTranslation:()=>({i18n:{language:'en'}})}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
function fixture() {
 invoke.mockImplementation(async (channel:string) => {
  if(channel==='providers:list'||channel==='documents:list')return [];
  if(channel==='review:prefs:get')return {timeZone:'Asia/Taipei'};
  if(channel==='review:courses:list') return {items:[{id:'course',title:'Calculus'}],nextCursor:null};
  if(channel==='review:jobs:page') return {items:[{id:'job',questionSummary:'Why does the chain rule work?',occurredAt:'2026-11-06T00:00:00Z',conversationId:'chat',userMessageId:'message',status:'succeeded'}],nextCursor:null};
  if(channel==='review:courses:mastery') return {items:[{id:'concept',key:'chain',label:'Chain rule',mastery:{state:'needs_review'}}],nextCursor:null};
  if(channel==='review:courses:units') return {items:[{id:'unit',title:'Differentiation'}],nextCursor:null};
  if(channel==='review:observations:page') return {items:[{id:'evidence',jobId:'job',unitId:'unit',conceptKey:'chain',conversationId:'chat',userMessageId:'message',evidenceQuote:'I confuse the inner derivative'}],nextCursor:null};
  return {items:[],nextCursor:null};
 });
}
it('shows a question on day one and opens its exact evidence in History', async()=>{
 fixture(); render(<ReviewView/>);
 fireEvent.change(await screen.findByLabelText('review:course_picker'),{target:{value:'course'}});
 fireEvent.click(await screen.findByText('Why does the chain rule work?'));
 expect(navigate).toHaveBeenCalledWith({view:'history',conversationId:'chat',messageId:'message'});
});
it('lets students mark understanding and preselect a concept for notes', async()=>{
 fixture(); render(<ReviewView/>);
 fireEvent.change(await screen.findByLabelText('review:course_picker'),{target:{value:'course'}});
 fireEvent.mouseDown(screen.getByRole('tab',{name:'review:weak'}),{button:0,ctrlKey:false});
 fireEvent.click(await screen.findByRole('button',{name:'review:make_note'}));
 expect(await screen.findByRole('checkbox',{name:'Chain rule'})).toBeTruthy();
 expect(within(screen.getByRole('tabpanel')).getByText('review:scope_title')).toBeTruthy();
 fireEvent.mouseDown(screen.getByRole('tab',{name:'review:weak'}),{button:0,ctrlKey:false});
 fireEvent.click(await screen.findByRole('button',{name:'review:understood'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('review:concepts:understood',{conceptId:'concept'}));
});
it('recovers a failed load through a labelled retry', async()=>{
 fixture(); invoke.mockRejectedValueOnce(new Error('offline')); render(<ReviewView/>);
 expect(await screen.findByRole('alert')).toBeTruthy(); fixture();
 fireEvent.click(screen.getAllByRole('button',{name:'review:retry'})[1]!);
 expect(await screen.findByLabelText('review:course_picker')).toBeTruthy();
});
it.each(['offline','budget','error'] as const)('shows %s status and retries through the optional W2 adapter',async status=>{
 fixture();const retry=vi.fn().mockResolvedValue(undefined);render(<ReviewView jobsAdapter={{status,retry}}/>);
 expect(screen.getByText(`review:${status}`)).toBeTruthy();
 fireEvent.click(screen.getAllByRole('button',{name:'review:retry'})[1]!);
 await waitFor(()=>expect(retry).toHaveBeenCalledOnce());
});
it('edits summaries without changing the conversation',async()=>{
 fixture();render(<ReviewView/>);fireEvent.change(await screen.findByLabelText('review:course_picker'),{target:{value:'course'}});
 fireEvent.click(await screen.findByRole('button',{name:'review:edit'}));
 fireEvent.change(screen.getByLabelText('review:summary'),{target:{value:'Corrected question'}});
 fireEvent.click(screen.getByRole('button',{name:'review:save'}));
 await waitFor(()=>expect(invoke).toHaveBeenCalledWith('review:jobs:edit',{jobId:'job',changes:{questionSummary:'Corrected question'}}));
});

it('shows the related course and unit beside each summary',async()=>{
 fixture();render(<ReviewView/>);fireEvent.change(await screen.findByLabelText('review:course_picker'),{target:{value:'course'}});
 expect(await within(screen.getByRole('tabpanel')).findByText('Differentiation')).toBeTruthy();
});
