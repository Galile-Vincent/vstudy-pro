// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { i18n } from '../../shared/i18n';
const { progress } = vi.hoisted(() => ({ progress: { done: ['setup', 'document'], status: 'active' } }));
vi.mock('../onboarding/progress', () => ({
  useLearningProgress: () => progress, markLearned: vi.fn(), saveProgress: vi.fn(),
}));
vi.mock('../shell', () => ({ useNavigate: () => ({ navigate: vi.fn() }) }));
vi.mock('../bridge', () => ({ desktop: {} }));
import { GettingStarted } from '../onboarding/help';
afterEach(cleanup);
beforeEach(async () => { await i18n.changeLanguage('en'); });
it('shows detailed steps and 50 percent below completion', () => {
  progress.done = ['setup', 'document'];
  render(<GettingStarted/>);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
});
it('collapses only when all four distinct steps are complete and opens Help', () => {
  progress.done = ['setup', 'document', 'walkthrough', 'help'];
  const show = vi.fn();
  window.addEventListener('vstudy:learning-help', show, { once: true });
  render(<GettingStarted/>);
  expect(screen.getByText('Setup complete')).toBeTruthy();
  expect(screen.queryByRole('list')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  expect(show.mock.calls[0]?.[0].detail).toBe('checklist');
});
it('keeps all steps available in detailed Help after completion', () => {
  progress.done = ['setup', 'document', 'walkthrough', 'help'];
  render(<GettingStarted detailed/>);
  expect(screen.getAllByRole('listitem')).toHaveLength(4);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
});
