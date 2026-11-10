// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { i18n } from '../../shared/i18n';
import type { SelectHTMLAttributes } from 'react';
import type { folderSchema } from '../../shared/library';
import type { z } from 'zod';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: {
  invoke, getPathForFile: () => '/tmp/notes.pdf',
} }));
vi.mock('../shell', () => ({ useOptionalNavigation: () => undefined }));
vi.mock('../components/select', () => ({ Select: (props: SelectHTMLAttributes<HTMLSelectElement>) =>
  <select {...props} data-value={props.value} /> }));
import { UploadCard } from './upload-card';
afterEach(cleanup);
const uploadStatus = () => document.querySelector('.upload-status') as HTMLElement;
beforeEach(async () => { invoke.mockReset(); await i18n.changeLanguage('en'); });
it('labels the destination trigger and defaults to Unfiled', () => {
  render(<UploadCard folders={[{ id: 'folder', name: 'Notes' } as z.infer<typeof folderSchema>]} />);
  const trigger = screen.getByRole('combobox', { name: 'Save in' });
  expect(trigger.getAttribute('data-value')).toBe('');
  expect(document.querySelector(`label[for="${trigger.id}"]`)).not.toBeNull();
});
it('omits destination when no folders exist', () => {
  render(<UploadCard />);
  expect(screen.queryByRole('combobox')).toBeNull();
});

it.each(['Choose a file', 'Try a sample document'])('holds one lock while %s is pending, including drops', async name => {
  let finish!: (value: null) => void;
  invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { container } = render(<UploadCard />);
  fireEvent.click(screen.getByRole('button', { name }));
  fireEvent.drop(container.firstChild!, {
    dataTransfer: { types: ['Files'], files: [new File(['notes'], 'notes.pdf')] },
  });
  expect(invoke.mock.calls.map(call => call[0])).toEqual([name === 'Choose a file' ? 'documents:import' : 'documents:importSample']);
  expect(screen.getByRole('button', { name: 'Choose a file' }).hasAttribute('disabled')).toBe(true);
  await act(async () => finish(null));
  invoke.mockResolvedValue([]);
  fireEvent.drop(container.firstChild!, {
    dataTransfer: { types: ['Files'], files: [new File(['notes'], 'notes.pdf')] },
  });
  await act(async () => {});
  expect(invoke).toHaveBeenLastCalledWith('documents:importPaths', {
    paths: ['/tmp/notes.pdf'], folderId: null,
  });
});

it.each(['Choose a file', 'Try a sample document'])('shows actionable errors from %s', async name => {
  invoke.mockRejectedValue({ code: 'errors.disk_full', params: {} });
  render(<UploadCard />);
  fireEvent.click(screen.getByRole('button', { name }));
  await act(async () => {});
  expect(uploadStatus().textContent).toBe(i18n.t('errors:disk_full'));
});

it('marks the entire import section during drag and restores it on leave', () => {
  const { container } = render(<UploadCard title="Bring a document"/>);
  const section = container.firstElementChild!;
  fireEvent.dragEnter(section, { dataTransfer: { types: ['Files'] } });
  expect(section.getAttribute('data-dragging')).toBe('true');
  expect(screen.getByText('Drop to import').getAttribute('aria-hidden')).toBe('false');
  fireEvent.dragLeave(section);
  expect(section.getAttribute('data-dragging')).toBe('false');
});

it('ignores text drags', () => {
  const { container } = render(<UploadCard />);
  fireEvent.dragEnter(container.firstChild!, { dataTransfer: { types: ['text/plain'] } });
  expect(container.firstElementChild!.getAttribute('data-dragging')).toBe('false');
});
it.each(['dragEnd', 'blur'])('clears nested drag depth on %s', event => {
  const { container } = render(<UploadCard />);
  const card = container.firstElementChild!;
  for (let i = 0; i < 3; i++) fireEvent.dragEnter(card, { dataTransfer: { types: ['Files'] } });
  if (event === 'blur') fireEvent.blur(window);
  else if (event === 'dragEnd') fireEvent.dragEnd(card);
  else fireEvent.dragLeave(card, { relatedTarget: null });
  expect(card.getAttribute('data-dragging')).toBe('false');
});
it('rejects a busy drag visibly without highlighting', async () => {
  invoke.mockReturnValue(new Promise(() => {}));
  const { container } = render(<UploadCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose a file' }));
  fireEvent.dragEnter(container.firstChild!, { dataTransfer: { types: ['Files'] } });
  expect(container.firstElementChild!.getAttribute('data-dragging')).toBe('false');
  fireEvent.drop(container.firstChild!, { dataTransfer: { types: ['Files'], files: [] } });
  expect(uploadStatus().textContent).toContain('Wait');
});
it('releases the picker lock after an error and accepts a drop', async () => {
  invoke.mockRejectedValueOnce(new Error('failed')).mockResolvedValue([]);
  const { container } = render(<UploadCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Choose a file' }));
  await act(async () => {});
  fireEvent.drop(container.firstChild!, { dataTransfer: { types: ['Files'], files: [new File([''], 'notes.pdf')] } });
  await act(async () => {});
  expect(invoke.mock.calls.map(call => call[0])).toEqual(['documents:import', 'documents:importPaths']);
});

it('imports into Unfiled when the selected folder disappeared', async () => {
  const onImported = vi.fn();
  const changed = vi.fn();
  window.addEventListener('library-changed', changed);
  const { rerender } = render(<UploadCard folders={[{ id: 'folder', name: 'Notes' } as z.infer<typeof folderSchema>]} onImported={onImported} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'folder' } });
  rerender(<UploadCard folders={[]} onImported={onImported} />);
  invoke.mockResolvedValue({ id: 'doc', title: 'Notes' });
  fireEvent.click(screen.getByRole('button', { name: 'Choose a file' }));
  await act(async () => {});
  expect(invoke).toHaveBeenCalledWith('documents:import', { folderId: null });
  expect(invoke).not.toHaveBeenCalledWith('library:documents:move', expect.anything());
  expect(onImported).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalledOnce();
  window.removeEventListener('library-changed', changed);
});

it('keeps one persistent status for partial failures', async () => {
  invoke.mockResolvedValue([{ ok: true, document: { id: 'doc', title: 'Notes' } },
    { ok: false, error: 'errors.disk_full' }]);
  const { container } = render(<UploadCard />);
  const status = uploadStatus();
  fireEvent.drop(container.firstChild!, { dataTransfer: { types: ['Files'], files: [new File([''], 'notes.pdf')] } });
  await act(async () => {});
  expect(document.querySelectorAll('.upload-status')).toHaveLength(1);
  const error = screen.getByRole('alert').textContent;
  expect(error).toBeTruthy();
  expect(status.textContent).toBe(error + i18n.t('home:imported'));
});

it('keeps nested file drags highlighted with null relatedTarget', () => {
  const { container } = render(<UploadCard />);
  const card = container.firstElementChild!;
  const child = screen.getByText('Drop to import');
  fireEvent.dragEnter(card, { dataTransfer: { types: ['Files'] } });
  fireEvent.dragEnter(child, { dataTransfer: { types: ['Files'] } });
  fireEvent.dragLeave(card, { relatedTarget: null });
  expect(card.getAttribute('data-dragging')).toBe('true');
  fireEvent.dragLeave(child, { relatedTarget: null });
  expect(card.getAttribute('data-dragging')).toBe('false');
});
it.each([false, true])('reannounces identical rejected drops while busy=%s', async busy => {
  invoke.mockReturnValue(new Promise(() => {}));
  const { container } = render(<UploadCard />);
  if (busy) fireEvent.click(screen.getByRole('button', { name: 'Choose a file' }));
  const drop = () => fireEvent.drop(container.firstChild!, { dataTransfer: { types: ['Files'], files: [] } });
  drop();
  await act(async () => {});
  const status = uploadStatus();
  const content = status.lastElementChild!;
  const text = content.textContent;
  drop();
  await act(async () => {});
  expect(status.lastElementChild).not.toBe(content);
  expect(status.lastElementChild?.textContent).toBe(text);
});
it('clears a rejected drop on the next file interaction', () => {
  const { container } = render(<UploadCard />);
  fireEvent.drop(container.firstChild!, { dataTransfer: { types: ['Files'], files: [] } });
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.dragEnter(container.firstChild!, { dataTransfer: { types: ['Files'] } });
  expect(screen.queryByRole('alert')).toBeNull();
});
it('does not accept text dragover or drop', () => {
  const { container } = render(<UploadCard />);
  const dataTransfer = { types: ['text/plain'], files: [] };
  expect(fireEvent.dragOver(container.firstChild!, { dataTransfer })).toBe(true);
  expect(fireEvent.drop(container.firstChild!, { dataTransfer })).toBe(true);
  expect(uploadStatus().textContent).toBe('');
  expect(invoke).not.toHaveBeenCalled();
});
