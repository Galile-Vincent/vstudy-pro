// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CourseChip } from './course-chip';
const invoke = vi.fn();
vi.mock('../bridge', () => ({ desktop: { invoke: (...args: unknown[]) => invoke(...args) } }));
vi.mock('../../shared/i18n', () => ({ tr: (key: string) => key }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({}) }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it('shows Unsorted, assigns from a keyboard operable picker, and excludes only on request', async () => {
  invoke.mockImplementation(async channel => {
    if (channel === 'review:courses:list') return { items: [{ id: 'course', title: 'Biology' }], nextCursor: null };
    if (channel === 'review:chat:inbox') return { items: [{ conversationId: 'chat', courseId: null }], nextCursor: null };
    if (channel === 'review:chat:assign') return { courseId: 'course' };
    return { ok: true };
  });
  render(<CourseChip conversationId="chat" />);
  const chip = await screen.findByRole('button', { name: 'review:unsorted' });
  fireEvent.click(chip);
  fireEvent.change(screen.getByRole('combobox', { name: 'review:course_picker' }), { target: { value: 'course' } });
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:chat:assign', { conversationId: 'chat', courseId: 'course' }));
  await screen.findByRole('button', { name: 'Biology' });
  expect(invoke).not.toHaveBeenCalledWith('review:chat:exclude', expect.anything());
  fireEvent.click(screen.getByRole('button', { name: 'review:exclude_chat' }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('review:chat:exclude', { conversationId: 'chat', excluded: true }));
});
it('finds an existing assignment through paged job summaries without writing on mount', async () => {
  invoke.mockImplementation(async (channel, input) => {
    if (channel === 'review:courses:list') return { items: [{ id: 'course', title: 'Biology' }], nextCursor: null };
    if (channel === 'review:chat:inbox') return { items: [], nextCursor: null };
    if (channel === 'review:jobs:page') return input.cursor ? { items: [{ conversationId: 'chat' }], nextCursor: null } : { items: [], nextCursor: { at: 'time', id: 'cursor' } };
    return { ok: true };
  });
  render(<CourseChip conversationId="chat" />);
  await screen.findByRole('button', { name: 'Biology' });
  expect(invoke.mock.calls.every(([channel]) => !['review:chat:assign', 'review:chat:exclude'].includes(channel))).toBe(true);
});
