// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Chat } from './chat';
import { conversationSchema, messageSchema } from '../shared/domain';
import { tr } from '../shared/i18n';
const {invoke, events} = vi.hoisted(() => ({invoke:vi.fn(),events:{emit:undefined as undefined | ((event:unknown) => void)}}));
vi.mock('./bridge', () => ({desktop:{invoke,onChatEvent: (_id:string, emit:typeof events.emit) => {events.emit=emit; return () => {};}}}));
const {guardSend} = vi.hoisted(() => ({guardSend: vi.fn((_message: string, send: () => void) => send())}));
vi.mock('./usage/meter', () => ({useUsage:() => ({}),useBudgetGuard:() => ({guardSend}),UsageButton:() => null,UsageMeter:() => null}));
vi.mock('./components/assistant-ui/elements/thread.aui', () => ({Thread:({components}:{components:{ComposerExtra:ComponentType}}) => <components.ComposerExtra/>}));
vi.mock('./model-controls', () => ({ModelControls:() => null}));
afterEach(() => {cleanup(); localStorage.clear(); vi.clearAllMocks();});
const history = [
  messageSchema.parse({id:'00000000-0000-4000-8000-0000000000a1',conversationId:'00000000-0000-4000-8000-000000000001',role:'user',parts:[{type:'text',text:'What is osmosis?'}],createdAt:'2026-11-01T00:00:00Z'}),
  messageSchema.parse({id:'00000000-0000-4000-8000-0000000000a2',conversationId:'00000000-0000-4000-8000-000000000001',role:'assistant',parts:[{type:'text',text:'What do you already know?'}],createdAt:'2026-11-01T00:00:01Z'}),
];
const online = [{config:{id:'anthropic-api',enabled:true},availability:{available:true},models:[]}] as never;
const conversationFor = (scope: 'document'|'general'|'course', id = '00000000-0000-4000-8000-000000000001') => conversationSchema.parse({id,...(scope === 'course' ? {scope,courseId:'00000000-0000-4000-8000-000000000003'} : scope === 'general' ? {scope} : {scope,documentId:'00000000-0000-4000-8000-000000000002'}),providerId:'anthropic-api',modelId:'fake',createdAt:'2026-11-01T00:00:00Z'});
const chat = (scope: 'document'|'general'|'course', extra: {history?: typeof history; providers?: never} = {}) => <Chat conversation={conversationFor(scope)} history={extra.history ?? history} draft="" onDraft={() => {}} selection={null} onClearSelection={() => {}} providers={extra.providers ?? online} model="" onModel={() => {}} onSettings={() => {}} onProvidersChanged={async () => {}} onUsage={() => {}}/>;
const turnOn = () => fireEvent.click(screen.getByRole('checkbox', {name:tr('chat:socratic_mode')}));
const answer = () => screen.getByRole('button', {name:tr('chat:answer_directly')});
it.each(['document','general','course'] as const)('Just answer sends a direct turn through the budget guard in %s chat and keeps the toggle active', async scope => {
  invoke.mockImplementation(async channel => {if(channel === 'chat:start') events.emit?.({type:'done'}); return {ok:true};});
  render(chat(scope));
  turnOn();
  fireEvent.click(answer());
  expect(guardSend).toHaveBeenCalledWith(tr('chat:answer_directly_request'), expect.any(Function));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('chat:start', expect.objectContaining({tutorMode:'direct',userMessage:tr('chat:answer_directly_request')})));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
});
it('does not send Just answer when the budget guard holds it back', () => {
  guardSend.mockImplementationOnce(() => {});
  render(chat('general'));
  turnOn(); fireEvent.click(answer());
  expect(invoke).not.toHaveBeenCalledWith('chat:start', expect.anything());
});
it.each([
  ['an empty thread', {history: [] as typeof history}, 'chat:answer_directly_empty'],
  ['an unavailable model', {providers: [] as never}, 'chat:answer_directly_unavailable'],
] as const)('blocks Just answer with a reason for %s', (_name, extra, key) => {
  render(chat('general', extra));
  turnOn();
  expect(answer().getAttribute('aria-disabled')).toBe('true');
  expect(answer().getAttribute('aria-describedby')).toBeTruthy();
  expect(document.getElementById(answer().getAttribute('aria-describedby')!)!.textContent).toBe(tr(key));
  fireEvent.click(answer());
  expect(guardSend).not.toHaveBeenCalled();
});
it('blocks Just answer while a reply is streaming and sends once the reply ends', async () => {
  invoke.mockImplementation(async () => ({ok:true}));
  render(chat('general'));
  turnOn();
  fireEvent.click(answer());
  await waitFor(() => expect(answer().getAttribute('aria-disabled')).toBe('true'));
  expect(document.getElementById(answer().getAttribute('aria-describedby')!)!.textContent).toBe(tr('chat:answer_directly_running'));
  fireEvent.click(answer());
  expect(guardSend).toHaveBeenCalledOnce();
  events.emit?.({type:'done'});
  await waitFor(() => expect(answer().getAttribute('aria-disabled')).toBeNull());
});
it('keeps Socratic mode to the conversation it was turned on in', () => {
  const view = render(chat('general'));
  turnOn();
  view.unmount();
  render(<Chat conversation={conversationFor('general', '00000000-0000-4000-8000-0000000000ff')} history={[]} draft="" onDraft={() => {}} selection={null} onClearSelection={() => {}} providers={online} model="" onModel={() => {}} onSettings={() => {}} onProvidersChanged={async () => {}} onUsage={() => {}}/>);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
});
