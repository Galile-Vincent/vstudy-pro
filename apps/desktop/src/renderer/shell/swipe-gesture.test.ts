import { describe, expect, it } from 'vitest';
import { advanceSwipe, isMomentumTail, pendingSwipe, releaseSwipe, type SwipeGesture } from './swipe-gesture';
const sample = (x: number, y = 0, blocked = false) => ({ x, y, blocked, canBack: true, canForward: true });

describe('swipe intent', () => {
  it('waits for 8px, locks to one axis, and rejects vertical scrolling for the entire gesture', () => {
    const pending = advanceSwipe(pendingSwipe(), sample(-3, 2)).gesture;
    expect(pending.phase).toBe('pending');
    expect(advanceSwipe(pending, sample(-4)).gesture).toMatchObject({ phase: 'tracking', direction: 'back', distance: 7 });
    const vertical = advanceSwipe(pendingSwipe(), sample(3, 9)).gesture;
    expect(advanceSwipe(vertical, sample(-200)).gesture.phase).toBe('ignored');
  });
  it.each([[-120, 'back'], [120, 'forward']] as const)('arms at %s but commits only on release', (delta, direction) => {
    const update = advanceSwipe(pendingSwipe(), sample(delta));
    expect(update.released).toBeUndefined();
    expect(releaseSwipe(update.gesture).released).toBe(direction);
    expect(releaseSwipe(releaseSwipe(update.gesture).gesture).released).toBeUndefined();
    expect(releaseSwipe(advanceSwipe(pendingSwipe(), sample(delta * .9)).gesture).released).toBeUndefined();
  });
  it('subtracts reverse movement so crossing the threshold alone does not commit', () => {
    const armed = advanceSwipe(pendingSwipe(), sample(-130)).gesture;
    const reversed = advanceSwipe(armed, sample(30)).gesture;
    expect(releaseSwipe(reversed).released).toBeUndefined();
  });
  it.each(['horizontal scroller', 'dialog', 'pinch', 'editable field', 'non-pixel wheel'])('rejects a blocked %s for the whole gesture', () => {
    const blocked = advanceSwipe(pendingSwipe(), sample(-2, 0, true)).gesture;
    expect(releaseSwipe(advanceSwipe(blocked, sample(-200)).gesture).released).toBeUndefined();
  });
  it('never tracks toward a missing entry', () => {
    expect(advanceSwipe(pendingSwipe(), { ...sample(-130), canBack: false }).gesture.phase).toBe('ignored');
    expect(advanceSwipe(pendingSwipe(), { ...sample(130), canForward: false }).gesture.phase).toBe('ignored');
  });
  it('releases before adding a decaying momentum tail and ignores subsequent momentum', () => {
    let gesture: SwipeGesture = advanceSwipe(pendingSwipe(), sample(-10)).gesture;
    for (const delta of [40, 37, 34, 31.3]) gesture = advanceSwipe(gesture, sample(-delta)).gesture;
    const result = advanceSwipe(gesture, sample(-28.8));
    expect(result.released).toBe('back');
    expect(advanceSwipe(result.gesture, sample(-200)).released).toBeUndefined();
  });
  it.each([
    [[40, 37, 34, 31.3, 28.8], true], [[12, 18, 9, 15, 11], false],
    [[30, 22, 20, 12, 11], false], [[10, 8, 6, 4, -2], false], [[40, 37, 34], false],
  ])('recognizes momentum %j', (deltas, expected) => expect(isMomentumTail(deltas)).toBe(expected));
  it('excludes the detected tail from a short gesture instead of arming it', () => {
    let gesture = advanceSwipe(pendingSwipe(), sample(-8)).gesture;
    for (const delta of [30, 27, 24.3, 21.87]) gesture = advanceSwipe(gesture, sample(-delta)).gesture;
    const release = advanceSwipe(gesture, sample(-19.683));
    expect(release.gesture.phase).toBe('ignored');
    expect(release.released).toBeUndefined();
  });
});
