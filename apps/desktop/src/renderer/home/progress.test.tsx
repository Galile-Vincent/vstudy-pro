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

it.each([[50, 0, '-50%'], [200, 100, '-0%']])('bounds value %s with max %s', (value, max, offset) => {
  render(<Progress value={value} max={max} />);
  expect(document.querySelector('[data-slot=progress-indicator]')?.getAttribute('style'))
    .toContain(`translateX(${offset})`);
});

it.each([undefined, null, NaN, Infinity])('keeps invalid value %s indeterminate', value => {
  render(<Progress value={value} />);
  expect(screen.getByRole('progressbar').getAttribute('data-state')).toBe('indeterminate');
  expect(document.querySelector('[data-slot=progress-indicator]')?.getAttribute('style')).not.toContain('NaN');
});

it.each([[200, 100, 100], [-1, 100, 0], [50, 0, 50], [200, 50, 50]])(
  'clamps finite value %s to max %s for accessibility', (value, max, expected) => {
    render(<Progress value={value} max={max} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(String(expected));
  },
);
