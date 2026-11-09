// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GettingStarted, LearningHelp, openLearningHelp } from './help';
import { i18n } from '../../shared/i18n';
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../shell', () => ({ useNavigate: () => ({ navigate }), useOptionalNavigation: () => undefined }));
vi.mock('../bridge', () => ({ desktop: { invoke: async () => [] } }));
vi.mock('./onboarding', () => ({ Onboarding: () => null }));
afterEach(cleanup);
it('closes the checklist on document navigation and has one unique title', async () => {
  await i18n.changeLanguage('en');
  render(<><GettingStarted /><LearningHelp /></>);
  act(() => openLearningHelp('checklist'));
  const dialog = screen.getByRole('dialog');
  const headings = dialog.querySelectorAll('h2');
  expect(headings).toHaveLength(1);
  const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  fireEvent.click(Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.includes(i18n.t('onboarding:check_document')))!);
  expect(navigate).toHaveBeenCalledWith('library');
  expect(screen.queryByRole('dialog')).toBeNull();
});
