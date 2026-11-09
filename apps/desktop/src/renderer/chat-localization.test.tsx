// @vitest-environment jsdom
/** Generated suggestions and tool-call counts follow the current language. */
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { ThreadFollowupSuggestions } from './components/assistant-ui/elements/follow-up-suggestions.aui';
import { ToolGroupContent, ToolGroupRoot, ToolGroupTrigger } from './components/assistant-ui/elements/tool-group.aui';
import { followUpSuggestions } from './chat-suggestions';
import { i18n, tr } from '../shared/i18n';
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
afterEach(async () => { cleanup(); await i18n.changeLanguage('en'); });
const prompts = ['common:which_passages_support_this_answer', 'common:explain_this_more_simply'];
function Suggestions({ onRun = vi.fn() }: { onRun?: (text: string) => void }) {
  const runtime = useLocalRuntime({ run: async ({ messages }) => { onRun(JSON.stringify(messages.at(-1))); return { content: [{ type: 'text', text: 'Done' }] }; } }, { adapters: { suggestion: followUpSuggestions } });
  return <AssistantRuntimeProvider runtime={runtime}><button onClick={() => runtime.thread.append('Hello')}>ask</button><ThreadFollowupSuggestions/></AssistantRuntimeProvider>;
}
const asked = async () => { await act(async () => screen.getByText('ask').click()); await waitFor(() => expect(document.querySelectorAll('.aui-thread-followup-suggestion')).toHaveLength(2)); };
it.each(['zh-Hant', 'ja'])('re-translates existing follow-up suggestions after switching to %s', async language => {
  render(<Suggestions/>);
  await asked();
  expect(Array.from(document.querySelectorAll('.aui-thread-followup-suggestion')).map(e => e.textContent)).toEqual(prompts.map(key => tr(key)));
  await act(async () => { await i18n.changeLanguage(language); });
  const labels = Array.from(document.querySelectorAll('.aui-thread-followup-suggestion')).map(e => e.textContent);
  expect(labels).toEqual(prompts.map(key => tr(key)));
  expect(labels).not.toContain('Explain this more simply');
});
it('sends the suggestion in the current language', async () => {
  const onRun = vi.fn();
  render(<Suggestions onRun={onRun}/>);
  await asked();
  await act(async () => { await i18n.changeLanguage('ja'); });
  onRun.mockClear();
  await act(async () => (document.querySelectorAll<HTMLElement>('.aui-thread-followup-suggestion')[1]!).click());
  await waitFor(() => expect(onRun).toHaveBeenCalled());
  expect(onRun.mock.calls[0]![0]).toContain(tr('common:explain_this_more_simply'));
  expect(onRun.mock.calls[0]![0]).not.toContain('i18n:');
});
it.each([
  ['en', 1, '1 tool call'], ['en', 3, '3 tool calls'],
  ['zh-Hant', 1, tr('chat:tool_calls', { count: 1, lng: 'zh-Hant' })], ['ja', 3, tr('chat:tool_calls', { count: 3, lng: 'ja' })],
])('translates the tool count in %s (%i)', async (language, count, expected) => {
  await i18n.changeLanguage(language);
  render(<ToolGroupRoot><ToolGroupTrigger count={count}/><ToolGroupContent>x</ToolGroupContent></ToolGroupRoot>);
  const label = document.querySelector('[data-slot=tool-group-trigger-label]')!.textContent;
  expect(label).toBe(expected);
  if (language !== 'en') { expect(label).not.toMatch(/tool call/i); expect(label).toContain(String(count)); }
});
