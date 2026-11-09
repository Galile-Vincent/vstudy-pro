// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ToolAnnouncement } from './chat-accessibility';
const store = vi.hoisted(() => ({thread: {isRunning: false, messages: [] as unknown[]}}));
vi.mock('@assistant-ui/react', () => ({useAuiState: (select: (state: unknown) => unknown) => select(store)}));
afterEach(() => { cleanup(); store.thread.messages = []; store.thread.isRunning = false; });
const tool = {type: 'tool-call', toolCallId: 'one', toolName: 'lookup'};
const message = (status: object, content = [tool]) => ({id: 'active', role: 'assistant', content, status});
it.each([
  [{type: 'requires-action', reason: 'tool-calls'}, 'waiting for you'],
  [{type: 'incomplete', reason: 'cancelled'}, 'cancelled'],
])('announces unresolved tools as %j', (status, expected) => {
  const view = render(<ToolAnnouncement/>);
  store.thread.isRunning = true;
  store.thread.messages = [message({type: 'running'})];
  view.rerender(<ToolAnnouncement/>);
  store.thread.isRunning = false;
  store.thread.messages = [message(status)];
  view.rerender(<ToolAnnouncement/>);
  expect(screen.getByRole('log').lastElementChild?.textContent).toContain(expected);
  expect(screen.getByRole('log').textContent).not.toContain('finished');
});
it('keeps five entries and reads only the last message in a 500-message chat', () => {
  const historicalRead = vi.fn(() => []);
  const history = Array.from({length: 499}, (_, id) => ({
    id: String(id), role: 'assistant', get content() { return historicalRead(); },
  }));
  store.thread.messages = [...history, message({type: 'complete'})];
  const view = render(<ToolAnnouncement/>);
  expect(historicalRead).not.toHaveBeenCalled();
  for (let turn = 0; turn < 10; turn++) {
    store.thread.isRunning = true;
    store.thread.messages = [...history, {...message({type: 'running'}), id: String(turn)}];
    view.rerender(<ToolAnnouncement/>);
    store.thread.isRunning = false;
    store.thread.messages = [...history, {...message({type: 'incomplete', reason: 'cancelled'}), id: String(turn)}];
    view.rerender(<ToolAnnouncement/>);
  }
  expect(screen.getByRole('log').children).toHaveLength(5);
  expect(historicalRead).not.toHaveBeenCalled();
});
