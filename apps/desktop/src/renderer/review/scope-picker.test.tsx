// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScopePicker } from './scope-picker';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
const unitId = '00000000-0000-4000-8000-000000000001';
const documentId = '00000000-0000-4000-8000-000000000002';
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function fixture() {
  invoke.mockImplementation(async (channel: string) => {
    if (channel === 'review:prefs:get') return { timeZone: 'Asia/Taipei' };
    if (channel === 'review:courses:units') return { items: [{ id: unitId, title: 'Cell transport', kind: 'document', sourceKey: documentId }], nextCursor: null };
    if (channel === 'review:concepts:list') return { items: [{ key: 'osmosis', label: 'Osmosis' }], nextCursor: null };
    if (channel === 'documents:list') return [{ id: documentId, title: 'Biology notes', status: 'ready' }];
    return { items: [], nextCursor: null };
  });
}
it('preselects a concept from Make note without requiring another selection', async () => {
  fixture(); const change = vi.fn();
  render(<ScopePicker courseId="course" selection={{ courseId: 'course', conceptKeys: ['osmosis'], labels: ['Osmosis'] }} onChange={change} />);
  expect(await screen.findByLabelText('Osmosis')).toHaveProperty('checked', true);
  await waitFor(() => expect(change).toHaveBeenLastCalledWith({ kind: 'concepts', conceptKeys: ['osmosis'] }));
});
it('uses local dates and the saved IANA zone and rejects reversed endpoints', async () => {
  fixture(); const change = vi.fn(); render(<ScopePicker courseId="course" selection={null} onChange={change} />);
  fireEvent.change(screen.getByLabelText('review:scope_kind'), { target: { value: 'dates' } });
  expect(await screen.findByText('Asia/Taipei')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('review:scope_from'), { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getByLabelText('review:scope_to'), { target: { value: '2026-11-03' } });
  await waitFor(() => expect(change).toHaveBeenLastCalledWith({ kind: 'dates', fromDate: '2026-11-01', toDate: '2026-11-03', timeZone: 'Asia/Taipei' }));
  fireEvent.change(screen.getByLabelText('review:scope_to'), { target: { value: '2026-10-01' } });
  await waitFor(() => expect(change).toHaveBeenLastCalledWith(null));
});
it('selects documents explicitly and supports weak-only scope', async () => {
  fixture(); const change = vi.fn(); render(<ScopePicker courseId="course" selection={null} onChange={change} />);
  fireEvent.change(screen.getByLabelText('review:scope_kind'), { target: { value: 'documents' } });
  fireEvent.click(await screen.findByLabelText('Biology notes'));
  await waitFor(() => expect(change).toHaveBeenLastCalledWith({ kind: 'documents', documentIds: [documentId] }));
  fireEvent.change(screen.getByLabelText('review:scope_kind'), { target: { value: 'weak' } });
  await waitFor(() => expect(change).toHaveBeenLastCalledWith({ kind: 'weak' }));
});
it('shows empty sources and lets students retry a failed load', async () => {
  fixture(); invoke.mockImplementation(async (channel: string) => {
    if (channel === 'review:prefs:get') return { timeZone: 'Asia/Taipei' };
    if (channel === 'documents:list') return [];
    throw new Error('offline');
  });
  render(<ScopePicker courseId="course" selection={null} onChange={vi.fn()} />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  fixture(); fireEvent.click(screen.getByRole('button', { name: 'review:retry' }));
  expect(await screen.findByLabelText('Cell transport')).toBeTruthy();
});
it('keeps selected units while loading the next keyset page', async () => {
  fixture(); const change = vi.fn();
  const cursor = { at: '2026-11-01T00:00:00.000Z', id: unitId };
  invoke.mockImplementation(async (channel: string, request: { cursor?: unknown }) => {
    if (channel === 'review:courses:units') return request.cursor ? { items: [{ id: documentId, title: 'Membranes' }], nextCursor: null } : { items: [{ id: unitId, title: 'Cell transport' }], nextCursor: cursor };
    if (channel === 'review:concepts:list') return { items: [], nextCursor: null };
    if (channel === 'documents:list') return [];
    return { timeZone: 'Asia/Taipei' };
  });
  render(<ScopePicker courseId="course" selection={null} onChange={change} />);
  fireEvent.click(await screen.findByLabelText('Cell transport'));
  fireEvent.click(screen.getByRole('button', { name: 'review:load_more' }));
  fireEvent.click(await screen.findByLabelText('Membranes'));
  await waitFor(() => expect(change).toHaveBeenLastCalledWith({ kind: 'units', unitIds: [unitId, documentId] }));
  expect(invoke).toHaveBeenCalledWith('review:courses:units', { courseId: 'course', limit: 50, cursor });
});
it('shows loading and then a useful empty state', async () => {
  fixture(); let resolveUnits: ((value: { items: []; nextCursor: null }) => void) | undefined;
  invoke.mockImplementation((channel: string) => {
    if (channel === 'review:courses:units') return new Promise(resolve => { resolveUnits = resolve; });
    if (channel === 'documents:list') return Promise.resolve([]);
    if (channel === 'review:prefs:get') return Promise.resolve({ timeZone: 'Asia/Taipei' });
    return Promise.resolve({ items: [], nextCursor: null });
  });
  render(<ScopePicker courseId="course" selection={null} onChange={vi.fn()} />);
  expect(screen.getByText('review:loading')).toBeTruthy();
  resolveUnits?.({ items: [], nextCursor: null });
  expect(await screen.findByText('review:scope_empty')).toBeTruthy();
});
