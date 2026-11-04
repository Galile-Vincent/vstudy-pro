// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {highlightCitation} from './citation-highlight';
it('starts a full two second outline after scrolling settles and reapplies to replaced content', async () => {
  vi.useFakeTimers(); Element.prototype.scrollIntoView=vi.fn();
  const root=document.createElement('div'); root.innerHTML='<p data-start="16" data-end="30">Page</p>';
  const dispose=highlightCitation(root,16,true);
  expect(root.hasAttribute('data-citation-layout')).toBe(true);
  document.dispatchEvent(new Event('scroll'));
  await vi.advanceTimersByTimeAsync(119);
  expect(root.querySelector('[data-citation-highlight]')).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(root.firstElementChild?.hasAttribute('data-citation-highlight')).toBe(true);
  root.innerHTML='<p data-start="16" data-end="30">Replaced</p>';
  await Promise.resolve();
  expect(root.firstElementChild?.hasAttribute('data-citation-highlight')).toBe(true);
  await vi.advanceTimersByTimeAsync(1999);
  expect(root.firstElementChild?.hasAttribute('data-citation-highlight')).toBe(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(root.querySelector('[data-citation-highlight]')).toBeNull();
  expect(Element.prototype.scrollIntoView).toHaveBeenLastCalledWith({block:'center',behavior:'instant'});
  expect(root.hasAttribute('data-citation-layout')).toBe(false);
  dispose();vi.useRealTimers();
});
