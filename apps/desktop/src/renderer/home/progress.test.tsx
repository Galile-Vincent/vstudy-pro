// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Progress } from '../components/ui/progress';
afterEach(cleanup);
it.each([50, 100])('exposes determinate progress at %s percent', value => {
  render(<Progress value={value} aria-label="Setup" />);
  const root = screen.getByRole('progressbar');
  expect(root.getAttribute('aria-valuenow')).toBe(String(value));
  expect(root.getAttribute('data-state')).toBe(value === 100 ? 'complete' : 'loading');
});
it('scales a custom maximum', () => {
  render(<Progress value={2} max={4} />);
  expect(screen.getByRole('progressbar').getAttribute('aria-valuemax')).toBe('4');
  expect(document.querySelector('[data-slot=progress-indicator]')?.getAttribute('style'))
    .toContain('translateX(-50%)');
});
