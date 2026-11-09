// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WebChatHub } from './index';
vi.mock('../shell', () => ({ useNavigate: () => ({ openTab: vi.fn() }) }));
vi.mock('./desktop-chat', () => ({ DesktopChat: () => <h2>Conversation</h2> }));
it('provides one main landmark and a page heading above the chat', () => {
  render(<WebChatHub/>);
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.getAllByRole('heading', {level: 1})).toHaveLength(1);
  expect(screen.getByRole('main').contains(screen.getByRole('heading', {level: 2}))).toBe(true);
});
