// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SelectHTMLAttributes } from 'react';
import { LibraryView } from './index';
import { TooltipProvider } from '../components/ui/tooltip';
import { i18n, tr } from '../../shared/i18n';
const state = vi.hoisted(() => ({ invoke: vi.fn(), route: { view: 'library', query: {} as Record<string, unknown> } }));
vi.mock('../components/select',()=>({Select:(props:SelectHTMLAttributes<HTMLSelectElement>)=><select {...props}/>}));
vi.mock('../bridge', () => ({ desktop: { invoke: state.invoke } }));
vi.mock('../shell', () => ({ useNavigate: () => ({ route: state.route, navigate: vi.fn() }) }));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const item = { document: { id: 'notes', title: 'notes', sourceName: 'notes.pdf', mime: 'application/pdf', status: 'ready', createdAt: '2026-11-01T00:00:00Z' }, tags: [], folderId: null, sizeBytes: 10, contentChars: null, pageCount: 3, lastOpenedAt: null, pinnedAt: null, pinned: false, course: null };
async function mount(compact: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  localStorage.setItem('library-mode', 'files');
  document.documentElement.lang = i18n.language;
  document.documentElement.style.fontSize = '16px';
  document.documentElement.style.setProperty('--library-row-height', '4');
  document.documentElement.style.setProperty('--library-search-row-height', '5');
  state.invoke.mockImplementation(async (channel: string) => channel === 'library:documents:list' ? { items: [item], nextCursor: null } : []);
  render(<TooltipProvider><LibraryView /></TooltipProvider>);
  await screen.findByText('notes');
  return screen.getByRole('textbox', { name: tr('library:search') }).closest('.library-toolbar') as HTMLElement;
}
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear(); state.route.query={}; });

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

it('clears optional filters while preserving folder, sort, and search in both input and query',async()=>{
 state.route.query={folderId:'folder',text:'notes',status:'ready',sort:'name'};
 const toolbar=await mount(false);
 fireEvent.click(within(toolbar).getByTestId('library-filters'));
 const panel=await screen.findByRole('dialog',{name:tr('library:filters')});
 fireEvent.click(within(panel).getByRole('button',{name:tr('library:clearFilters')}));
 await waitFor(()=>{
  const calls=state.invoke.mock.calls.filter(([channel])=>channel==='library:documents:list');
  expect(calls.at(-1)?.[1]).toMatchObject({folderId:'folder',text:'notes',sort:'name'});
  expect(calls.at(-1)?.[1].status).toBeUndefined();
 });
 expect((screen.getByRole('textbox',{name:tr('library:search')}) as HTMLInputElement).value).toBe('notes');
});

it('clears the custom before bound when a relative preset is selected',async()=>{
 const toolbar=await mount(false);fireEvent.click(within(toolbar).getByTestId('library-filters'));
 const panel=await screen.findByRole('dialog',{name:tr('library:filters')});
 const preset=within(panel).getByRole('combobox',{name:tr('library:addedAfter')});
 fireEvent.change(preset,{target:{value:'custom'}});
 fireEvent.change(within(panel).getByLabelText(tr('library:addedBefore')),{target:{value:'2026-10-01'}});
 fireEvent.change(preset,{target:{value:'7'}});
 await waitFor(()=>{
  const query=state.invoke.mock.calls.filter(([channel])=>channel==='library:documents:list').at(-1)?.[1];
  expect(query.addedAfter).toBeTruthy();expect(query.addedBefore).toBeUndefined();
 });
});
it('shows a reversed custom range error and never submits an impossible range',async()=>{
 const toolbar=await mount(false);fireEvent.click(within(toolbar).getByTestId('library-filters'));
 const panel=await screen.findByRole('dialog',{name:tr('library:filters')});
 fireEvent.change(within(panel).getByRole('combobox',{name:tr('library:addedAfter')}),{target:{value:'custom'}});
 fireEvent.change(within(panel).getByLabelText(tr('library:addedBefore')),{target:{value:'2026-10-01'}});
 fireEvent.change(within(panel).getByLabelText(tr('library:addedAfter'),{selector:'input'}),{target:{value:'2026-11-02'}});
 await waitFor(()=>expect(document.querySelector('.library-live')?.textContent).toContain(tr('library:dateRangeInvalid')));
 for(const [channel,q] of state.invoke.mock.calls){if(channel==='library:documents:list' && q.addedBefore && q.addedAfter)expect(q.addedAfter<=q.addedBefore).toBe(true);}
});

it.each(['en','zh-Hant','ja'])('localizes converter, dates and sizes in filter chips (%s)',async locale=>{
 await i18n.changeLanguage(locale);
 state.route.query={converter:'markitdown',addedAfter:'2026-11-01T00:00:00.000Z',minSize:10000000};
 await mount(false);document.documentElement.lang=locale;
 const chips=document.querySelector('.filter-chips')!;
 expect(chips.textContent).toContain(tr('library:markitdown'));
 expect(chips.textContent).not.toContain('2026-11-01T');
 expect(chips.textContent).not.toContain('10000000');
 expect(chips.textContent).toContain(new Intl.NumberFormat(locale,{style:'unit',unit:'megabyte',unitDisplay:'short'}).format(10));
 await i18n.changeLanguage('en');
});
