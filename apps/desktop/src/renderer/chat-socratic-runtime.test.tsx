// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Chat } from './chat';
import { conversationSchema } from '../shared/domain';
import { tr } from '../shared/i18n';
const {invoke, events} = vi.hoisted(() => ({invoke:vi.fn(),events:{emit:undefined as undefined | ((event:unknown) => void)}}));
vi.mock('./bridge', () => ({desktop:{invoke,onChatEvent: (_id:string, emit:typeof events.emit) => {events.emit=emit; return () => {};}}}));
vi.mock('./usage/meter', () => ({useUsage:() => ({}),useBudgetGuard:() => ({}),UsageButton:() => null,UsageMeter:() => null}));
vi.mock('./components/assistant-ui/elements/thread.aui', () => ({Thread:({components}:{components:{ComposerExtra:ComponentType}}) => <components.ComposerExtra/>}));
vi.mock('./model-controls', () => ({ModelControls:() => null}));
afterEach(() => {cleanup(); localStorage.clear(); vi.clearAllMocks();});
it.each(['document','general','course'] as const)('Just answer sends a direct turn in %s chat and keeps the toggle active', async scope => {
  const conversation = conversationSchema.parse({id:'00000000-0000-4000-8000-000000000001',...(scope === 'course' ? {scope,courseId:'00000000-0000-4000-8000-000000000003'} : scope === 'general' ? {scope} : {scope,documentId:'00000000-0000-4000-8000-000000000002'}),providerId:'anthropic-api',modelId:'fake',createdAt:'2026-11-01T00:00:00Z'});
  invoke.mockImplementation(async channel => {if(channel === 'chat:start') events.emit?.({type:'done'}); return {ok:true};});
  render(<Chat conversation={conversation} history={[]} draft="" onDraft={() => {}} selection={null} onClearSelection={() => {}} providers={[]} model="" onModel={() => {}} onSettings={() => {}} onProvidersChanged={async () => {}} onUsage={() => {}}/>);
  fireEvent.click(screen.getByRole('checkbox', {name:tr('chat:socratic_mode')}));
  fireEvent.click(screen.getByRole('button', {name:tr('chat:answer_directly')}));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('chat:start', expect.objectContaining({tutorMode:'direct',userMessage:tr('chat:answer_directly_request')})));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
});
