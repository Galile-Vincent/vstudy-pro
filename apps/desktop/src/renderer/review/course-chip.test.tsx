// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { tr } from '../../shared/i18n';
import { CourseChip } from './course-chip';
const invoke = vi.fn();
vi.mock('../components/select', () => import('../../test/native-select'));
vi.mock('../bridge', () => ({ desktop: { invoke: (...args: unknown[]) => invoke(...args) } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const link = (courseId: string | null, excludeFromMemory = false) => ({ conversationId: 'chat', courseId, method: 'manual', confidence: 1, confirmed: true, excludeFromMemory, revision: 1, updatedAt: '2026-11-06T00:00:00.000Z' });
it('shows Unsorted, assigns from a keyboard operable picker, and excludes only on request', async () => {
  invoke.mockImplementation(async channel => {
    if (channel === 'review:courses:list') return { items: [{ id: 'course', title: 'Biology' }], nextCursor: null };
    if (channel === 'review:chat:link-get') return link(null);
    if (channel === 'review:chat:assign') return link('course');
    return { ok: true };
  });
  render(<CourseChip conversationId="chat" />);
  const chip = await screen.findByRole('button', { name: tr('review:unsorted') });
  fireEvent.click(chip);
  fireEvent.change(screen.getByRole('combobox', { name: tr('review:course_picker') }), { target: { value: 'course' } });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:chat:assign', { conversationId: 'chat', courseId: 'course' }));
  await screen.findByRole('button', { name: 'Biology' });
  expect(invoke).not.toHaveBeenCalledWith('review:chat:exclude', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: tr('review:exclude_chat') }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:chat:exclude', { conversationId: 'chat', excluded: true }));
});
it('reads the assignment with one link lookup, even for a new chat with no summary yet and many unsorted chats', async () => {
  invoke.mockImplementation(async channel => {
    if (channel === 'review:courses:list') return { items: [{ id: 'course', title: 'Biology' }], nextCursor: null };
    if (channel === 'review:chat:link-get') return link('course', true);
    return { ok: true };
  });
  render(<CourseChip conversationId="chat" />);
  await screen.findByRole('button', { name: 'Biology' });
  expect(invoke.mock.calls.map(([channel]) => channel).sort()).toEqual(['review:chat:link-get', 'review:courses:list']);
  expect(invoke).toHaveBeenCalledWith('review:chat:link-get', { conversationId: 'chat' });
  fireEvent.click(screen.getByRole('button', { name: 'Biology' }));
  expect((screen.getByRole('button', { name: tr('review:exclude_chat') }) as HTMLButtonElement).disabled).toBe(true);
});
it('treats a chat that has never been classified as unsorted', async () => {
  invoke.mockImplementation(async channel => channel === 'review:courses:list' ? { items: [], nextCursor: null } : null);
  render(<CourseChip conversationId="chat" />);
  await screen.findByRole('button', { name: tr('review:unsorted') });
});
