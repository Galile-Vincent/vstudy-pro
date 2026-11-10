// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFooterInset } from './footer-inset';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function Page() {
  return <main data-tab-scroll=""><footer ref={useFooterInset()} /></main>;
}
it('publishes the sticky footer height on the page scroller and follows its size', () => {
  let notify = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect = disconnect;
  });
  let height = 86;
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
  const { container, unmount } = render(<Page />);
  const scroller = container.querySelector('main')!;
  expect(scroller.style.getPropertyValue('--exam-footer-size')).toBe('86px');
  height = 140;
  act(() => notify());
  expect(scroller.style.getPropertyValue('--exam-footer-size')).toBe('140px');
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
it('does nothing without a resize observer', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  const { container } = render(<Page />);
  expect(container.querySelector('main')!.style.getPropertyValue('--exam-footer-size')).toBe('0px');
});
