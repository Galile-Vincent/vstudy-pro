// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryView } from './index';
import { tr } from '../../shared/i18n';
import { groupByCourse, courseName, readMode, type Item } from './model';
const state = vi.hoisted(() => ({ invoke: vi.fn(), route: { view: 'library', query: {} as Record<string, unknown> } }));
vi.mock('../bridge', () => ({ desktop: { invoke: state.invoke } }));
vi.mock('../shell', () => ({ useNavigate: () => ({ route: state.route, navigate: vi.fn() }) }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const course = (id: string, zh: string, en: string) => ({ id, fullName: `1142${zh}`, identity: { title: { zh, en }, teachers: [], term: '1142' } });
const circuits = course('00000000-0000-4000-8000-000000000001', '電子電路', 'Circuits');
const logic = course('00000000-0000-4000-8000-000000000002', '邏輯設計', 'Logic');
const row = (id: string, c: typeof circuits | null, extra: Partial<Item> = {}) => ({ document: { id, title: id, sourceName: id + '.pdf', mime: 'application/pdf', status: 'ready', createdAt: '2026-11-01T00:00:00Z' }, tags: [], folderId: null, sizeBytes: 10, contentChars: null, pageCount: 3, lastOpenedAt: null, pinnedAt: null, pinned: false, course: c, ...extra }) as unknown as Item;
const library = [row('amp', circuits), row('lab', circuits), row('gates', logic), row('notes', null)];
function mount(lang = 'en') {
  document.documentElement.lang = lang;
  document.documentElement.style.fontSize = '16px';
  document.documentElement.style.setProperty('--library-row-height', '4');
  document.documentElement.style.setProperty('--art-reader-card-height', '240px');
  state.invoke.mockImplementation(async (channel: string) => channel === 'library:documents:list' ? { items: library, nextCursor: null } : []);
  return render(<><LibraryView /></>);
}
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear(); state.route.query = {}; });

describe('course grouping', () => {
  it('groups documents by course and keeps uncategorized documents last', () => {
    const groups = groupByCourse([row('notes', null), row('amp', circuits), row('gates', logic), row('lab', circuits)], 'en');
    expect(groups.map((g) => [g.name, g.items.length])).toEqual([['Circuits', 2], ['Logic', 1], [null, 1]]);
    expect(groups[0]!.pages).toBe(6);
  });
  it('shows the course title in the interface language', () => {
    expect(courseName(row('amp', circuits), 'zh-Hant')).toBe('電子電路');
    expect(courseName(row('amp', circuits), 'en')).toBe('Circuits');
    expect(courseName(row('notes', null), 'en')).toBeNull();
  });
  it('defaults to folders and remembers the files view', () => {
    expect(readMode()).toBe('folders');
    localStorage.setItem('library-mode', 'files');
    expect(readMode()).toBe('files');
  });
});

describe('library folders view', () => {
  it('opens on course folders and enters one with a breadcrumb back', async () => {
    mount();
    const folders = await screen.findByRole('list', { name: tr('library:folderList') });
    expect(within(folders).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      tr('library:openFolder', { name: 'Circuits' }), tr('library:openFolder', { name: 'Logic' }), tr('library:openFolder', { name: tr('library:unfiled') }),
    ]);
    expect(screen.queryByRole('list', { name: tr('library:documents') })).toBeNull();
    expect(folders.querySelectorAll('.folder-row')).toHaveLength(3);
    expect(folders.querySelector('.folder-art')).toBeNull();
    fireEvent.click(within(folders).getByRole('button', { name: tr('library:openFolder', { name: 'Circuits' }) }));
    const results = await screen.findByRole('list', { name: tr('library:documents') });
    expect(within(results).getAllByRole('listitem')).toHaveLength(2);
    expect(within(results).getByText('amp')).toBeTruthy();
    expect(screen.queryByText('gates')).toBeNull();
    expect(screen.getByRole('navigation', { name: tr('library:breadcrumb') }).textContent).toContain('Circuits');
    fireEvent.click(screen.getByRole('button', { name: tr('library:backToFolders') }));
    expect(await screen.findByRole('list', { name: tr('library:folderList') })).toBeTruthy();
  });
  it('switches to all files, shows the course on every row, and remembers the choice', async () => {
    const view = mount();
    await screen.findByRole('list', { name: tr('library:folderList') });
    fireEvent.click(screen.getByRole('radio', { name: tr('library:viewFiles') }));
    const results = await screen.findByRole('list', { name: tr('library:documents') });
    expect(within(results).getAllByRole('listitem')).toHaveLength(4);
    const places = Array.from(results.querySelectorAll('.document-folder')).map((e) => e.textContent);
    expect(places).toEqual(['Circuits', 'Circuits', 'Logic', tr('library:unfiled')]);
    expect(localStorage.getItem('library-mode')).toBe('files');
    view.unmount();
    mount();
    expect(await screen.findByRole('list', { name: tr('library:documents') })).toBeTruthy();
    expect(screen.getByRole('radio', { name: tr('library:viewFiles') }).getAttribute('aria-checked')).toBe('true');
  });
  it('lists documents flat while searching even in folders mode', async () => {
    mount();
    await screen.findByRole('list', { name: tr('library:folderList') });
    fireEvent.change(screen.getByRole('textbox', { name: tr('library:search') }), { target: { value: 'lab' } });
    expect(await screen.findByRole('list', { name: tr('library:documents') })).toBeTruthy();
    await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('library:documents:list', expect.objectContaining({ text: 'lab' })));
  });
  it('shows the course name on cards in the grid layout', async () => {
    localStorage.setItem('library-mode', 'files');
    localStorage.setItem('library-grid', 'true');
    mount('zh-Hant');
    const results = await screen.findByRole('list', { name: tr('library:documents') });
    const courses = Array.from(results.querySelectorAll('.document-course')).map((e) => e.textContent);
    expect(courses).toEqual(['電子電路', '電子電路', '邏輯設計', tr('library:unfiled')]);
    const first = results.querySelector<HTMLElement>('.library-document')!;
    expect(first.textContent).toContain(tr('library:pages', { count: 3, formatted: '3' }));
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    await waitFor(() => expect(document.activeElement?.id).toBe('library-document-lab'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement?.id).toBe('library-document-notes'));
  });
});


it.each([false, true])('keeps a keyboard entry row after changing course folders (grid %s)', async grid => {
  localStorage.setItem('library-grid', String(grid));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: tr('library:openFolder', { name: 'Circuits' }) }));
  let results = await screen.findByRole('list', { name: tr('library:documents') });
  fireEvent.focus(within(results).getAllByRole('listitem')[1]!);
  fireEvent.click(screen.getByRole('button', { name: tr('library:backToFolders') }));
  fireEvent.click(await screen.findByRole('button', { name: tr('library:openFolder', { name: 'Logic' }) }));
  results = await screen.findByRole('list', { name: tr('library:documents') });
  const entries = within(results).getAllByRole('listitem').filter(row => row.tabIndex === 0);
  expect(entries).toHaveLength(1);
  expect(entries[0]!.textContent).toContain('gates');
});
