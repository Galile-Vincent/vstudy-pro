// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { i18n } from '../../shared/i18n';
import type { folderSchema } from '../../shared/library';
import type { z } from 'zod';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: {
  invoke, getPathForFile: () => '/tmp/notes.pdf',
} }));
vi.mock('../shell', () => ({ useOptionalNavigation: () => undefined }));
import { UploadCard } from './upload-card';
afterEach(cleanup);
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

it('holds one lock while a sample import is pending, including drops', async () => {
  let finish!: (value: null) => void;
  invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { container } = render(<UploadCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Try a sample document' }));
  fireEvent.drop(container.firstChild!, {
    dataTransfer: { files: [new File(['notes'], 'notes.pdf')] },
  });
  expect(invoke.mock.calls.map(call => call[0])).toEqual(['documents:importSample']);
  expect(screen.getByRole('button', { name: 'Choose a file' }).hasAttribute('disabled')).toBe(true);
  await act(async () => finish(null));
  invoke.mockResolvedValue([]);
  fireEvent.drop(container.firstChild!, {
    dataTransfer: { files: [new File(['notes'], 'notes.pdf')] },
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
  expect((await screen.findByRole('alert')).textContent).toBe(i18n.t('errors:disk_full'));
});

it('marks the entire import section during drag and restores it on leave', () => {
  const { container } = render(<UploadCard title="Bring a document"/>);
  const section = container.firstElementChild!;
  fireEvent.dragEnter(section);
  expect(section.getAttribute('data-dragging')).toBe('true');
  expect(section.getAttribute('style')).toContain('var(--active)');
  expect(screen.getByText('Drop to import').getAttribute('aria-hidden')).toBe('false');
  fireEvent.dragLeave(section);
  expect(section.getAttribute('data-dragging')).toBe('false');
});
