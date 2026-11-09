// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { DesktopChat } from './desktop-chat';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../shell', () => ({ useNavigate: () => ({}) }));
vi.mock('../tab-presentation', () => ({ useTabPresentation: () => ({ initial: undefined, update: vi.fn() }) }));
vi.mock('../chat', () => ({ Chat: () => <p>Conversation</p> }));
const provider = { config: { id: 'codex-cli', enabled: true }, availability: { available: true }, models: [{ id: 'm1', name: 'Model' }] };
const conversation = { id: 'c1', scope: 'general', providerId: 'codex-cli', modelId: 'm1', createdAt: '2026-01-01T00:00:00.000Z' };
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
