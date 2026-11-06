// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { tr } from '../shared/i18n';
import { TutorModeControl, useTutorMode } from './tutor-mode-control';
const answer = vi.fn();
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); answer.mockClear(); });
const mode = () => screen.getByRole('checkbox', { name: tr('chat:socratic_mode') }) as HTMLInputElement;
function Fixture({ conversation = 'one', blocked }: { conversation?: string; blocked?: string }) { const [value, setValue] = useTutorMode(conversation); return <TutorModeControl mode={value} onChange={setValue} onAnswer={answer} blocked={blocked}/>; }
it('defaults off, exposes a labelled checkbox, remembers the choice for that conversation and offers direct answers', () => {
  const view = render(<Fixture/>);
  expect(mode().checked).toBe(false);
  fireEvent.click(mode());
  view.unmount(); render(<Fixture/>);
  expect(mode().checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: tr('chat:answer_directly') }));
  expect(answer).toHaveBeenCalledOnce();
  expect(mode().checked).toBe(true);
});
it('does not carry Socratic mode into other conversations', () => {
  const view = render(<Fixture conversation="one"/>);
  fireEvent.click(mode());
  view.rerender(<Fixture conversation="two"/>);
  expect(mode().checked).toBe(false);
  view.rerender(<Fixture conversation="one"/>);
  expect(mode().checked).toBe(true);
});
it('keeps two chats showing the same conversation in step', () => {
  render(<><Fixture/><Fixture/></>);
  const [first, second] = screen.getAllByRole('checkbox') as HTMLInputElement[];
  fireEvent.click(first!);
  expect(second!.checked).toBe(true);
});
it('works when storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  render(<Fixture/>); fireEvent.click(screen.getByRole('checkbox'));
  expect(mode().checked).toBe(true);
});
it('keeps Just answer focusable but inert, with its reason announced, while it cannot send', () => {
  const reason = tr('chat:answer_directly_running');
  render(<Fixture blocked={reason}/>);
  fireEvent.click(mode());
  const button = screen.getByRole('button', { name: tr('chat:answer_directly') });
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(button.hasAttribute('disabled')).toBe(false);
  expect(button.getAttribute('aria-describedby')).toBeTruthy();
  expect(document.getElementById(button.getAttribute('aria-describedby')!)!.textContent).toBe(reason);
  fireEvent.click(button);
  expect(answer).not.toHaveBeenCalled();
});
