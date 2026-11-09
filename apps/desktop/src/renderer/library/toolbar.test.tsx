// @vitest-environment jsdom
import { recovery } from './recovery';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
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
 fireEvent.change(within(panel).getByLabelText(tr('library:addedAfter'),{selector:'input'}),{target:{value:'2026-09-01'}});
 fireEvent.change(within(panel).getByLabelText(tr('library:addedBefore')),{target:{value:'2026-10-01'}});
 await waitFor(()=>expect(state.invoke.mock.calls.some(([c,q])=>c==='library:documents:list' && q.addedAfter && q.addedBefore)).toBe(true));
 fireEvent.change(within(panel).getByLabelText(tr('library:addedAfter'),{selector:'input'}),{target:{value:'2026-11-02'}});
 await waitFor(()=>expect(document.querySelector('.library-live')?.textContent).toContain(tr('library:dateRangeInvalid')));
 const alerts = within(panel).getAllByRole('alert');
 expect(alerts).toHaveLength(2);
 for (const key of ['addedAfter', 'addedBefore']) {
  const input = within(panel).getByLabelText(tr(`library:${key}`), {selector:'input'});
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(alerts.some(alert => alert.id === input.getAttribute('aria-describedby'))).toBe(true);
 }
 for(const [channel,q] of state.invoke.mock.calls){if(channel==='library:documents:list' && q.addedBefore && q.addedAfter)expect(q.addedAfter<=q.addedBefore).toBe(true);}
});

it.each(['en','zh-Hant','ja'])('localizes converter, dates and sizes in filter chips (%s)',async locale=>{
 await i18n.changeLanguage(locale);
 state.route.query={converter:'markitdown',addedAfter:'2026-11-01T00:00:00.000Z',minSize:10000000};
 await mount(false);document.documentElement.lang=locale;
 const chips=document.querySelector('.filter-chips')!;
 expect(chips.textContent).toContain(tr('library:markitdown'));
 expect(chips.textContent).toContain(new Intl.DateTimeFormat(locale).format(new Date('2026-11-01T00:00:00.000Z')));
 expect(chips.textContent).not.toContain('10000000');
 expect(chips.textContent).toContain(new Intl.NumberFormat(locale,{style:'unit',unit:'megabyte',unitDisplay:'short'}).format(10));
 await i18n.changeLanguage('en');
});

it('submits equal picked days inclusively through local 23:59',async()=>{
 const toolbar=await mount(false);fireEvent.click(within(toolbar).getByTestId('library-filters'));
 const panel=await screen.findByRole('dialog',{name:tr('library:filters')});
 fireEvent.change(within(panel).getByRole('combobox',{name:tr('library:addedAfter')}),{target:{value:'custom'}});
 for(const key of ['addedAfter','addedBefore'])fireEvent.change(within(panel).getByLabelText(tr(`library:${key}`),{selector:'input'}),{target:{value:'2026-11-02'}});
 await waitFor(()=>{
  const q=state.invoke.mock.calls.filter(([c])=>c==='library:documents:list').at(-1)?.[1];
  expect(q.addedAfter).toBe(new Date(2026,10,2).toISOString());
  expect(q.addedBefore).toBe(new Date(2026,10,2,23,59,59,999).toISOString());
 });
 expect(document.querySelector('.filter-chips')?.textContent).toContain(new Intl.DateTimeFormat('en').format(new Date(2026,10,2)));
 fireEvent.change(within(panel).getByLabelText(tr('library:addedAfter'),{selector:'input'}),{target:{value:''}});
 await waitFor(()=>{
  const q=state.invoke.mock.calls.filter(([c])=>c==='library:documents:list').at(-1)?.[1];
  expect(q.addedAfter).toBeUndefined();
  expect(q.addedBefore).toBe(new Date(2026,10,2,23,59,59,999).toISOString());
 });
});

beforeEach(() => recovery.reset());

it('does not resurrect a removed date chip when editing the other bound',async()=>{
 state.route.query={addedAfter:new Date(2026,9,1).toISOString()};
 const toolbar=await mount(false);fireEvent.click(within(toolbar).getByTestId('library-filters'));
 const panel=await screen.findByRole('dialog',{name:tr('library:filters')});
 fireEvent.change(within(panel).getByRole('combobox',{name:tr('library:addedAfter')}),{target:{value:'custom'}});
 fireEvent.click(within(document.querySelector('.filter-chips')! as HTMLElement).getByRole('button',{name:/Added after/}));
 expect((within(panel).getByLabelText(tr('library:addedAfter'),{selector:'input'}) as HTMLInputElement).value).toBe('');
 fireEvent.change(within(panel).getByLabelText(tr('library:addedBefore')),{target:{value:'2026-11-01'}});
 await waitFor(()=>{
  const q=state.invoke.mock.calls.filter(([c])=>c==='library:documents:list').at(-1)?.[1];
  expect(q.addedBefore).toBeTruthy();expect(q.addedAfter).toBeUndefined();
 });
});

it('rejects a five digit year without breaking rendering',async()=>{
 const toolbar=await mount(false);fireEvent.click(within(toolbar).getByTestId('library-filters'));
 const panel=await screen.findByRole('dialog',{name:tr('library:filters')});
 fireEvent.change(within(panel).getByRole('combobox',{name:tr('library:addedAfter')}),{target:{value:'custom'}});
 fireEvent.change(within(panel).getByLabelText(tr('library:addedAfter'),{selector:'input'}),{target:{value:'20261-11-01'}});
 expect(document.querySelector('.library-live')?.textContent).toBe(tr('library:dateRangeInvalid'));
 expect(screen.getByText('notes')).toBeTruthy();
});

it('labels every filter above its control and offers one clear action', async () => {
  state.route.query = {status:'ready'};
  const toolbar = await mount(false);
  fireEvent.click(within(toolbar).getByTestId('library-filters'));
  const panel = await screen.findByRole('dialog', {name:tr('library:filters')});
  const fields = panel.querySelectorAll('[data-slot=form-field]');
  expect(fields).toHaveLength(10);
  for (const field of fields) {
    const label = field.querySelector('label')!;
    expect(label).toBe(field.firstElementChild);
    expect(document.getElementById(label.htmlFor)).toBeTruthy();
  }
  expect(screen.getAllByRole('button', {name:tr('library:clearFilters')})).toHaveLength(1);
});

it('offers Clear beside active chips while filters are closed', async () => {
 state.route.query = {status:'ready'};
 await mount(false);
 expect(within(document.querySelector('.filter-chips')! as HTMLElement)
  .getByRole('button', {name:tr('library:clearFilters')})).toBeTruthy();
});
