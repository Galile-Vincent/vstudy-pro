// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('./bridge', () => ({desktop:{invoke}}));
vi.mock('react-i18next', () => ({useTranslation:()=>({t:(key:string)=>key})}));
import { DeletionNotice } from './deletion-notice';
afterEach(cleanup);
it('keeps pending deletion visible without a modal dialog', async () => {
  invoke.mockResolvedValue({pending:true});
  render(<DeletionNotice />);
  expect((await screen.findByRole('status')).textContent).toBe('settings:delete_pending');
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('shows no notice after successful deletion', async () => {
  invoke.mockResolvedValue({pending:false});
  render(<DeletionNotice />);
  await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
  expect(screen.queryByRole('status')).toBeNull();
});
