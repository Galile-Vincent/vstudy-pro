// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryView } from './index';
import { TooltipProvider } from '../components/ui/tooltip';
import { tr } from '../../shared/i18n';
const state = vi.hoisted(() => ({ invoke: vi.fn(), route: { view: 'library', query: {} as Record<string, unknown> } }));
vi.mock('../bridge', () => ({ desktop: { invoke: state.invoke } }));
vi.mock('../shell', () => ({ useNavigate: () => ({ route: state.route, navigate: vi.fn() }) }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const item = { document: { id: 'notes', title: 'notes', sourceName: 'notes.pdf', mime: 'application/pdf', status: 'ready', createdAt: '2026-11-01T00:00:00Z' }, tags: [], folderId: null, sizeBytes: 10, contentChars: null, pageCount: 3, lastOpenedAt: null, pinnedAt: null, pinned: false, course: null };
async function mount(compact: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  localStorage.setItem('library-mode', 'files');
  document.documentElement.lang = 'en';
  document.documentElement.style.fontSize = '16px';
  document.documentElement.style.setProperty('--library-row-height', '4');
  state.invoke.mockImplementation(async (channel: string) => channel === 'library:documents:list' ? { items: [item], nextCursor: null } : []);
  render(<TooltipProvider><LibraryView /></TooltipProvider>);
  await screen.findByText('notes');
  return screen.getByRole('textbox', { name: tr('library:search') }).closest('.library-toolbar') as HTMLElement;
}
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); });

describe('library toolbar', () => {
  it('keeps sort and layout beside search on wide windows', async () => {
    const toolbar = await mount(false);
    expect(within(toolbar).getByRole('combobox', { name: tr('library:sort') })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: tr('library:viewToggle') })).toBeTruthy();
  });
  it('moves sort and layout into the filter popover on narrow windows so search keeps its width', async () => {
    const toolbar = await mount(true);
    expect(within(toolbar).queryByRole('combobox', { name: tr('library:sort') })).toBeNull();
    expect(within(toolbar).queryByRole('button', { name: tr('library:viewToggle') })).toBeNull();
    fireEvent.click(within(toolbar).getByTestId('library-filters'));
    const panel = await screen.findByRole('dialog', { name: tr('library:filters') });
    expect(within(panel).getByRole('combobox', { name: tr('library:sort') })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: tr('library:direction') })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: tr('library:viewToggle') })).toBeTruthy();
  });
});
