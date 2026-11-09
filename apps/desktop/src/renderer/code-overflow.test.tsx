// @vitest-environment jsdom
import { cleanup, render, screen, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { tr } from '../shared/i18n';
import { CodeBlock } from './document-markdown';
let resize: () => void;
vi.stubGlobal('ResizeObserver', class {
  constructor(callback: () => void) { resize = callback; }
  observe() {} disconnect() {}
});
afterEach(cleanup);
it('only names and tabs overflowing code and updates after resize', () => {
  render(<CodeBlock>long code</CodeBlock>);
  const pre = screen.getByText('long code');
  expect(pre.hasAttribute('tabindex')).toBe(false);
  Object.defineProperty(pre, 'scrollWidth', { configurable: true, value: 4000 });
  Object.defineProperty(pre, 'clientWidth', { configurable: true, value: 500 });
  act(() => resize());
  expect(pre.tabIndex).toBe(0);
  expect(screen.getByRole('region', {name: tr('common:scrollable_code')})).toBe(pre);
  expect(pre.style.overflowX).toBe('auto');
  Object.defineProperty(pre, 'scrollWidth', { value: 500 });
  act(() => resize());
  expect(pre.hasAttribute('tabindex')).toBe(false);
  expect(pre.hasAttribute('aria-label')).toBe(false);
});
