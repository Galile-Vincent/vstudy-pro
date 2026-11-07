// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { defaultSettings } from '../../shared';
import { AppearanceSection } from './appearance';
import { applyAppearance } from './apply-appearance';
vi.mock('./apply-appearance', () => ({ applyAppearance: vi.fn() }));
vi.mock('../bridge', () => ({ desktop: { invoke: vi.fn(async () => defaultSettings) } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('previews continuous slider input immediately without a theme transition', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AppearanceSection />));
    const slider = host.querySelector<HTMLInputElement>('input[type=range]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '125');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(applyAppearance).toHaveBeenCalledWith(expect.objectContaining({ contrast: 125 }), false);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('saves a card transparency choice and applies the returned settings', async () => {
  const { desktop } = await import('../bridge');
  vi.mocked(desktop.invoke).mockImplementation(async (channel, request) =>
    (channel === 'settings:set' ? request : defaultSettings) as never);
  const { render, screen, within, fireEvent, waitFor, cleanup } = await import('@testing-library/react');
  try {
    render(<AppearanceSection />);
    const group=await screen.findByRole('radiogroup',{name:'Card transparency'});
    const glass=within(group).getByRole('radio',{name:'Glass'});
    fireEvent.click(glass);
    await waitFor(() => expect(glass.getAttribute('aria-checked')).toBe('true'));
    expect(desktop.invoke).toHaveBeenCalledWith('settings:set',expect.objectContaining({cardTransparency:'glass'}));
    expect(applyAppearance).toHaveBeenCalledWith(expect.objectContaining({cardTransparency:'glass'}),true);
  } finally { cleanup(); }
});
