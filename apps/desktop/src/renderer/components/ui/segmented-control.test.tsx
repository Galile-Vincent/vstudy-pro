// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

it('exposes a radio choice and selects with arrow keys', async () => {
  const change = vi.fn();
  render(<SegmentedControl aria-label="Mode" defaultValue="online" onValueChange={change}
    options={[{ value: 'online', label: 'Downloads' }, { value: 'offline', label: 'Offline' }]} />);
  expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeTruthy();
  const online = screen.getByRole('radio', { name: 'Downloads' });
  expect(online.getAttribute('aria-checked')).toBe('true');
  online.focus();
  fireEvent.keyDown(online, { key: 'ArrowRight' });
  await waitFor(() => expect(change).toHaveBeenCalledWith('offline'));
  expect(screen.getByRole('radio', { name: 'Offline' }).getAttribute('aria-checked')).toBe('true');
});
