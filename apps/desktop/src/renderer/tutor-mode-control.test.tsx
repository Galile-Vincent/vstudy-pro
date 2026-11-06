// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TutorModeControl, useTutorMode } from './tutor-mode-control';
vi.mock('../shared/i18n', () => ({tr: (key: string) => key}));
vi.mock('react-i18next', () => ({useTranslation: () => ({})}));
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
const answer = vi.fn();
function Fixture() { const [mode, setMode] = useTutorMode(); return <TutorModeControl mode={mode} onChange={setMode} onAnswer={answer}/>; }
it('defaults off, exposes a labelled checkbox, remembers the choice and offers direct answers', () => {
  const view = render(<Fixture/>);
  const toggle = screen.getByRole('checkbox', {name:'chat:socratic_mode'});
  expect((toggle as HTMLInputElement).checked).toBe(false);
  fireEvent.click(toggle);
  expect(localStorage.getItem('vstudy.tutorMode')).toBe('socratic');
  view.unmount(); render(<Fixture/>);
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', {name:'chat:answer_directly'}));
  expect(answer).toHaveBeenCalledOnce();
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
});
it('works when storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {throw new Error('blocked');});
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {throw new Error('blocked');});
  render(<Fixture/>); fireEvent.click(screen.getByRole('checkbox'));
  expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
});
