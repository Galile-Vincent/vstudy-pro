// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AssistantRuntimeProvider, useLocalRuntime, type ChatModelAdapter } from '@assistant-ui/react';
import { Thread } from './components/assistant-ui/elements/thread.aui';
import { tr } from '../shared/i18n';
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
HTMLElement.prototype.scrollIntoView = vi.fn();
HTMLElement.prototype.scrollTo = vi.fn();
afterEach(cleanup);
it.each(['send', 'regenerate'])('keeps composer focus during and after %s', async action => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const adapter: ChatModelAdapter = {async *run() {
    yield {content: [{type: 'text', text: 'Streaming'}]};
    await pending;
    yield {content: [{type: 'text', text: 'Done'}]};
  }};
  function Harness() {
    const runtime = useLocalRuntime(adapter, {initialMessages: action === 'regenerate'
      ? [{role: 'user', content: 'Question'}, {role: 'assistant', content: 'Answer'}] : []});
    return <AssistantRuntimeProvider runtime={runtime}><Thread autoFocus={false}/></AssistantRuntimeProvider>;
  }
  render(<Harness/>);
  const input = screen.getByRole('textbox');
  if (action === 'send') fireEvent.change(input, {target: {value: 'Question'}});
  const button = screen.getByRole('button', {name: tr(action === 'send' ? 'common:send_message' : 'common:regenerate')});
  button.focus();
  fireEvent.click(button);
  await waitFor(() => expect(document.activeElement).toBe(input));
  await act(async () => { finish(); await pending; });
  await screen.findByText('Done');
  expect(document.activeElement).toBe(input);
});
