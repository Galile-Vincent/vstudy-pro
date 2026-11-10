// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SegmentedControl, SegmentedControlItem } from './segmented-tabs';

it('exposes a radio choice and selects with arrow keys', async () => {
  const change = vi.fn();
  render(<SegmentedControl type="single" aria-label="Mode" defaultValue="online" onValueChange={change}
  >
    <SegmentedControlItem value="online">Downloads</SegmentedControlItem>
    <SegmentedControlItem value="offline">Offline</SegmentedControlItem>
  </SegmentedControl>);
  expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
  const online = screen.getByRole('radio', { name: 'Downloads' });
  expect(online.getAttribute('aria-checked')).toBe('true');
  online.focus();
  fireEvent.keyDown(online, { key: 'ArrowRight' });
  await waitFor(() => expect(change).toHaveBeenCalledWith('offline'));
  expect(screen.getByRole('radio', { name: 'Offline' }).getAttribute('aria-checked')).toBe('true');
});
