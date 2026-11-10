// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { GettingStarted, HelpMenu, LearningHelp, openLearningHelp } from './help';
import { TooltipProvider } from '../components/ui/tooltip';
import { i18n } from '../../shared/i18n';
const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('../shell', () => ({ useNavigate: () => ({ navigate }), useOptionalNavigation: () => undefined }));
vi.mock('../bridge', () => ({ desktop: { invoke: async () => [] } }));
vi.mock('./onboarding', () => ({ Onboarding: () => null }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
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

it('shows the dialog checklist as four rows without an inner card', async () => {
  render(<LearningHelp />);
  act(() => openLearningHelp('checklist'));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.querySelector('[data-slot=card]')).toBeNull();
  expect(dialog.querySelectorAll('[data-slot=list-row]')).toHaveLength(4);
  expect(dialog.querySelector('main,[role=main]')).toBeNull();
});

it('switches walkthrough lessons with tabs', async () => {
  await i18n.changeLanguage('en');
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  render(<LearningHelp />);
  act(() => openLearningHelp('walkthroughs'));
  const tab = await screen.findByRole('tab', { name: i18n.t('onboarding:lesson_due') });
  fireEvent.mouseDown(tab);
  fireEvent.focus(tab);
  await waitFor(() => expect(tab.getAttribute('aria-selected')).toBe('true'));
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
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

it('returns focus to the Help button after the shortcuts dialog closes with Escape', async () => {
  await i18n.changeLanguage('en');
  render(<TooltipProvider><HelpMenu /><LearningHelp /></TooltipProvider>);
  const help = screen.getByRole('button', { name: i18n.t('onboarding:help') });
  help.focus();
  fireEvent.keyDown(help, { key: 'ArrowDown' });
  const item = await screen.findByRole('menuitem', { name: i18n.t('onboarding:help_shortcuts') });
  item.focus();
  fireEvent.click(item);
  await screen.findByRole('dialog', { name: i18n.t('onboarding:help_shortcuts') });
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(help);
});

it('restores focus to the element that opened a dialog from the page', async () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  render(<LearningHelp />);
  act(() => openLearningHelp('checklist'));
  await screen.findByRole('dialog');
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
