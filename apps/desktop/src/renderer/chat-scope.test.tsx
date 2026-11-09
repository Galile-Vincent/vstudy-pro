// @vitest-environment jsdom
/** The welcome, prompts and composer label follow the conversation scope. */
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Chat } from './chat';
import { conversationSchema, type Message } from '../shared/domain';
import { i18n, tr } from '../shared/i18n';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('./bridge', () => ({ desktop: { invoke, onChatEvent: () => () => {} } }));
vi.mock('./usage/meter', () => ({ useUsage: () => ({}), useBudgetGuard: () => ({}), UsageButton: () => null, UsageMeter: () => null }));
vi.mock('./model-controls', () => ({ ModelControls: () => null }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
afterEach(async () => { cleanup(); vi.clearAllMocks(); await i18n.changeLanguage('en'); });
const id = '00000000-0000-4000-8000-000000000001';
const course = '00000000-0000-4000-8000-000000000002';
const scopes = {
  general: { scope: 'general' },
  course: { scope: 'course', courseId: course },
  document: { scope: 'document', documentId: course },
};
function mount(scope: keyof typeof scopes, history: Message[] = []) {
  invoke.mockResolvedValue({ items: [], nextCursor: null });
  const conversation = conversationSchema.parse({ id, ...scopes[scope], providerId: 'openai-api', modelId: 'mock-model', createdAt: '2026-11-06T08:00:00.000Z' });
  return render(<Chat conversation={conversation} history={history} draft="" onDraft={() => {}} selection={null} onClearSelection={() => {}} providers={[]} model="" onModel={() => {}} onSettings={() => {}} onProvidersChanged={async () => {}} onUsage={() => {}} />);
}
it.each(['en', 'zh-Hant', 'ja'])('keeps a general chat free of document wording in %s', async language => {
  await i18n.changeLanguage(language);
  const { container } = mount('general');
  const welcome = container.querySelector('.art-reader-welcome')!;
  expect(welcome.textContent).not.toContain(tr('common:document'));
  expect(welcome.textContent).toContain(tr('art-reader:general_welcome_body'));
  const labels = ['general_plan', 'general_explain', 'general_quiz'].map(key => tr(`art-reader:${key}`));
  expect(Array.from(welcome.querySelectorAll('[data-slot=suggestions] button')).map(button => button.textContent)).toEqual(labels);
  const input = container.querySelector<HTMLTextAreaElement>('textarea')!;
  expect(input.getAttribute('aria-label')).toBe(tr('history:general_ask_label'));
  expect(input.getAttribute('aria-label')).not.toBe(tr('common:ask_about_your_document'));
  expect(input.placeholder).toBe(tr('history:general_ask_placeholder'));
});
it('fills the composer with a general study prompt', async () => {
  const { container } = mount('general');
  fireEvent.click(screen.getByRole('button', { name: tr('art-reader:general_plan') }));
  expect(container.querySelector('textarea')!.value).toBe(tr('art-reader:prompt_general_plan'));
});
it('keeps the document and course wording', () => {
  const doc = mount('document');
  expect(doc.container.querySelector('textarea')!.getAttribute('aria-label')).toBe(tr('common:ask_about_your_document'));
  expect(screen.getByRole('button', { name: tr('art-reader:summarize') })).toBeTruthy();
  cleanup();
  const course = mount('course');
  expect(course.container.querySelector('textarea')!.getAttribute('aria-label')).toBe(tr('moodle:ask_course'));
  expect(screen.getByRole('button', { name: tr('art-reader:summarize') })).toBeTruthy();
});
const sent = [{ id: '00000000-0000-4000-8000-000000000009', conversationId: id, role: 'user', parts: [{ type: 'text', text: 'Hi' }], createdAt: '2026-11-06T08:00:00.000Z' }] as unknown as Message[];
it.each(['en', 'zh-Hant', 'ja'])('states the model switch consequence once messages exist in %s', async language => {
  await i18n.changeLanguage(language);
  mount('general');
  expect(screen.queryByText(tr('chat:model_switch_note'))).toBeNull();
  cleanup();
  mount('general', sent);
  expect(screen.getByText(tr('chat:model_switch_note'))).toBeTruthy();
});
