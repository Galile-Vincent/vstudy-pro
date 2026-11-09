// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  const warning = vi.spyOn(console, 'error');
  render(<><GettingStarted /><LearningHelp /></>);
  act(() => openLearningHelp('checklist'));
  const dialog = screen.getByRole('dialog', { name: i18n.t('onboarding:checklist') });
  const headings = dialog.querySelectorAll('h2');
  expect(headings).toHaveLength(1);
  const ids = Array.from(document.querySelectorAll('[id]'), node => node.id);
  expect(new Set(ids).size).toBe(ids.length);
  fireEvent.click(Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.includes(i18n.t('onboarding:check_document')))!);
  expect(navigate).toHaveBeenCalledWith('library');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(warning).not.toHaveBeenCalled();
  warning.mockRestore();
});

it('uses a single checklist region', () => {
  render(<GettingStarted />);
  expect(screen.getAllByRole('region')).toHaveLength(1);
});

it('focuses the destination main after checklist navigation', async () => {
  const { unmount } = render(<><GettingStarted /><LearningHelp /></>);
  navigate.mockImplementation(() => {
    const main = document.createElement('div');
    main.id = 'shell-content';
    main.setAttribute('role', 'main');
    main.tabIndex = -1;
    main.innerHTML = '<h1>Library</h1>';
    document.body.append(main);
  });
  act(() => openLearningHelp('checklist'));
  const dialog = screen.getByRole('dialog', { name: i18n.t('onboarding:checklist') });
  fireEvent.click(Array.from(dialog.querySelectorAll('button')).find(button =>
    button.textContent?.includes(i18n.t('onboarding:check_document')))!);
  await waitFor(() => expect(document.activeElement?.textContent).toBe('Library'));
  unmount();
  document.getElementById('shell-content')?.remove();
  navigate.mockReset();
});
