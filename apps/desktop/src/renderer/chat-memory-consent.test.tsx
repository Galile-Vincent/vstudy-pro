// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Chat } from './chat';
import { conversationSchema } from '../shared/domain';
import { tr } from '../shared/i18n';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('./bridge', () => ({ desktop: { invoke, onChatEvent: () => () => {} } }));
vi.mock('./usage/meter', () => ({ useUsage: () => ({}), useBudgetGuard: () => ({}), UsageButton: () => null, UsageMeter: () => null }));
vi.mock('./components/assistant-ui/elements/thread.aui', () => ({ Thread: ({ components }: { components: { ComposerBanner: ComponentType } }) => <components.ComposerBanner /> }));
vi.mock('./model-controls', () => ({ ModelControls: () => null }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); });
it('asks once, above the composer, before study memory starts recording this chat', async () => {
  invoke.mockImplementation(async (channel: string) => channel === 'review:prefs:get' ? { memoryEnabled: true, noticeAcknowledged: false, consentAcknowledged: false, timeZone: 'UTC' } : { items: [], nextCursor: null });
  const conversation = conversationSchema.parse({ id: '00000000-0000-4000-8000-000000000001', scope: 'general', providerId: 'openai-api', modelId: 'mock-model', createdAt: '2026-11-06T08:00:00.000Z' });
  render(<Chat conversation={conversation} history={[]} draft="" onDraft={() => {}} selection={null} onClearSelection={() => {}} providers={[]} model="" onModel={() => {}} onSettings={() => {}} onProvidersChanged={async () => {}} onUsage={() => {}} />);
  expect(await screen.findByText(tr('review:memory_disclosure'))).toBeTruthy();
  expect(screen.getByRole('button', { name: tr('review:consent_turn_on') })).toBeTruthy();
  expect(screen.getByRole('button', { name: tr('review:consent_not_now') })).toBeTruthy();
});
