// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AssistantRuntimeProvider, ComposerPrimitive, useLocalRuntime } from '@assistant-ui/react';
import { EarlierMessages } from './chat-history';
import { tr } from '../shared/i18n';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./bridge', () => ({desktop: {invoke}}));
afterEach(cleanup);
it('consumes empty-page focus before later sends', async () => {
  invoke.mockResolvedValue({items: [], nextCursor: null});
  function Harness() {
    const runtime = useLocalRuntime({async *run() { yield {content: [{type: 'text', text: 'Done'}]}; }});
    return <AssistantRuntimeProvider runtime={runtime}>
      <EarlierMessages runtime={runtime} conversationId={'c' as never}
        cursor={{id: 'recent', createdAt: '2026-11-02T00:00:00Z'}} onLoaded={() => {}}/>
      <ComposerPrimitive.Root><ComposerPrimitive.Input/><ComposerPrimitive.Send>Send</ComposerPrimitive.Send></ComposerPrimitive.Root>
    </AssistantRuntimeProvider>;
  }
  render(<Harness/>);
  const button = screen.getByRole('button', {name: tr('common:load_earlier_messages')});
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(screen.queryByRole('button', {name: tr('common:load_earlier_messages')})).toBeNull());
  const input = screen.getByRole('textbox');
  input.focus();
  fireEvent.change(input, {target: {value: 'Question'}});
  await act(async () => fireEvent.submit(document.querySelector('form')!));
  expect(document.activeElement).toBe(input);
});
