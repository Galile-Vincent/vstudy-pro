// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
