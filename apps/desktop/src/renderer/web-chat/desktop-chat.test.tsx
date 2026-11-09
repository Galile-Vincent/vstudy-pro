// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DesktopChat } from './desktop-chat';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../shell', () => ({ useNavigate: () => ({}) }));
vi.mock('../tab-presentation', () => ({ useTabPresentation: () => ({ initial: undefined, update: vi.fn() }) }));
vi.mock('../chat', () => ({
  Chat: ({ conversation, onModel, draft }: { conversation: { id: string }; onModel: (value: string) => void; draft: string }) =>
    <div><p>Conversation</p><output aria-label="id">{conversation.id}</output><output aria-label="draft">{draft}</output><button onClick={() => onModel('claude-cli/m2')}>Switch</button></div>,
}));
const provider = { config: { id: 'codex-cli', enabled: true }, availability: { available: true }, models: [{ id: 'm1', name: 'Model' }] };
const conversation = { id: 'c1', scope: 'general', providerId: 'codex-cli', modelId: 'm1', createdAt: '2026-01-01T00:00:00.000Z' };
afterEach(() => { cleanup(); document.body.replaceChildren(); });
beforeEach(() => {
  localStorage.clear();
  invoke.mockReset();
  invoke.mockImplementation(async (channel: string) => channel === 'providers:list' ? [provider] : channel === 'conversations:create' ? conversation : null);
});
it('offers one New chat action on the empty route and keeps it in the toolbar afterwards', async () => {
  render(<DesktopChat active launcher={<div role="group">Launcher</div>}/>);
  expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'New chat' })).toHaveLength(1);
  expect(screen.getAllByText(/Conversations appear in History/)).toHaveLength(1);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('providers:list', {}));
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  expect(await screen.findByText('Conversation')).toBeTruthy();
  expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'New chat' })).toHaveLength(1);
  expect(screen.getByRole('group').textContent).toBe('Launcher');
});
it('renders its toolbar inside the page header slot when one is provided', async () => {
  const slot = document.body.appendChild(document.createElement('div'));
  const { rerender } = render(<DesktopChat active launcher={<div role="group">Launcher</div>} toolbarSlot={null}/>);
  expect(screen.queryByRole('group')).toBeNull();
  rerender(<DesktopChat active launcher={<div role="group">Launcher</div>} toolbarSlot={slot}/>);
  expect(slot.contains(screen.getByRole('group'))).toBe(true);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('providers:list', {}));
});

const next = { ...conversation, id: 'c2', providerId: 'claude-cli', modelId: 'm2' };
async function started(messages: unknown[]) {
  invoke.mockImplementation(async (channel: string) => channel === 'providers:list' ? [provider] : channel === 'conversations:create' ? (invoke.mock.calls.filter(call => call[0] === 'conversations:create').length > 1 ? next : conversation)
    : channel === 'messages:page' ? { items: messages, nextCursor: null } : channel === 'conversations:model' ? next : null);
  render(<DesktopChat active/>);
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('providers:list', {}));
  fireEvent.click(screen.getByRole('button', { name: 'New chat' }));
  await screen.findByText('Conversation');
}
it('changes the model in place while the conversation is empty', async () => {
  await started([]);
  fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('conversations:model', { conversationId: 'c1', providerId: 'claude-cli', modelId: 'm2' }));
  await waitFor(() => expect(screen.getByLabelText('id').textContent).toBe('c2'));
  expect(invoke.mock.calls.filter(call => call[0] === 'conversations:create')).toHaveLength(1);
  expect(screen.queryByRole('alert')).toBeNull();
});
it('starts a new conversation with the chosen model once messages exist', async () => {
  await started([{ id: 'm' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('conversations:create', { scope: 'general', providerId: 'claude-cli', modelId: 'm2' }));
  await waitFor(() => expect(screen.getByLabelText('id').textContent).toBe('c2'));
  expect(invoke.mock.calls.some(call => call[0] === 'conversations:model')).toBe(false);
  expect(localStorage.getItem('vstudy-web-chat-conversation')).toBe('c2');
  expect(screen.queryByRole('alert')).toBeNull();
});
