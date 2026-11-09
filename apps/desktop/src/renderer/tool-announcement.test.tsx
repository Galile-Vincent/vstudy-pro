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
