// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SurfaceErrorBoundary } from './surface-error-boundary';
import { tr } from '../../shared/i18n';
const invoke = vi.hoisted(() => vi.fn().mockResolvedValue({ok:true}));
vi.mock('../bridge', () => ({desktop:{invoke}}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('recovers on navigation and reports the failed surface through IPC', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Content({fail}:{fail:boolean}) { if(fail) throw new Error('private document text'); return <p>Library content</p>; }
  const view=render(<SurfaceErrorBoundary resetKeys={['home']}><Content fail/></SurfaceErrorBoundary>);
  expect(screen.getByRole('alert').textContent).toContain(tr('common:surface_render_error'));
  expect(invoke).toHaveBeenCalledWith('app:reportError', expect.objectContaining({phase:'render',code:'Error'}));
  expect(JSON.stringify(invoke.mock.calls)).not.toContain('private document text');
  view.rerender(<SurfaceErrorBoundary resetKeys={['library']}><Content fail={false}/></SurfaceErrorBoundary>);
  expect(screen.getByText('Library content')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps Retry available after a render error', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let fail=true;
  function Content() { if(fail) throw new Error('failed'); return <p>Recovered content</p>; }
  render(<SurfaceErrorBoundary><Content/></SurfaceErrorBoundary>);
  fail=false; fireEvent.click(screen.getByRole('button',{name:tr('common:retry')}));
  expect(screen.getByText('Recovered content')).toBeTruthy();
});
