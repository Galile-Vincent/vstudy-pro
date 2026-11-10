import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { desktop } from '../bridge';
import { desktopPlatform } from '../../shared/platform';
import type { HistoryDirection } from './navigation-history';
import { advanceSwipe, pendingSwipe, releaseSwipe, swipeThreshold, type SwipeGesture } from './swipe-gesture';
import './history-navigation.css';

const editableSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]';
export function hasNavigationOverlay(): boolean {
  return [...document.querySelectorAll('.app-shell[data-view="welcome"]')].some(element=>!element.closest('[hidden], [aria-hidden="true"]')) ||
    [...document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open], [role="menu"], [role="listbox"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"], .app-tabs-menu')]
      .some(element => [...element.getClientRects()].some(rect=>rect.width>0 && rect.height>0) && !element.closest('[hidden], [aria-hidden="true"], [data-state="closed"]'));
}

export function HistorySwipeNavigation({ canGoBack, canGoForward, onNavigate }: {
  canGoBack: boolean; canGoForward: boolean; onNavigate: (direction: HistoryDirection) => void;
}) {
  const actions = useRef({ canGoBack, canGoForward, onNavigate });
  actions.current = { canGoBack, canGoForward, onNavigate };
  const indicator = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let gesture: SwipeGesture = pendingSwipe();
    let nativeGesture = false;
    let lastWheel = -Infinity;
    let lastCommit = -Infinity;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let paintFrame = 0, measureFrame = 0;
    const dirtyRoots = new Set<Element>();
    let y = 0, contentTop = 0;
    let startPath: EventTarget[] = [];
    let visual = { direction: 'back' as HistoryDirection, progress: 0, tracking: false };
    const scrollers = new Map<Element, { left: number; min: number; max: number }>();
    const content = indicator.current!.parentElement!;
    const readScroller = (element: Element) => {
      const width = element.scrollWidth - element.clientWidth;
      if (width <= 1 || !['auto', 'scroll', 'overlay'].includes(getComputedStyle(element).overflowX)) { scrollers.delete(element); return; }
      const rtl = getComputedStyle(element).direction === 'rtl';
      scrollers.set(element, { left: element.scrollLeft, min: rtl ? -width : 0, max: rtl ? 0 : width });
    };
    const measure = () => {
      measureFrame = 0;
      contentTop = content.getBoundingClientRect().top;
      for (const element of scrollers.keys()) {
        if (element.isConnected) readScroller(element); else scrollers.delete(element);
      }
      for (const root of dirtyRoots) {
        if (!root.isConnected) continue;
        readScroller(root); root.querySelectorAll('*').forEach(readScroller);
      }
      dirtyRoots.clear();
    };
    const scheduleMeasure = () => { if (!measureFrame) measureFrame = requestAnimationFrame(measure); };
    const pointer = (event: Event) => {
      contentTop = content.getBoundingClientRect().top;
      event.composedPath().forEach(node => { if (node instanceof Element) readScroller(node); });
    };
    const scroll = (event: Event) => {
      const node = event.target;
      if (node instanceof Element) {
        const cached = scrollers.get(node);
        if (cached) cached.left = node.scrollLeft;
      }
    };
    const canScroll = (path: EventTarget[], delta: number) => path.some(node => {
      if (!(node instanceof Element)) return false;
      const cached = scrollers.get(node);
      return cached && (delta < 0 ? cached.left > cached.min + 1 : cached.left < cached.max - 1);
    });
    const paint = () => {
      paintFrame = 0;
      const node = indicator.current;
      if (!node) return;
      const { direction, progress, tracking } = visual;
      node.dataset.direction = direction;
      node.dataset.tracking = String(tracking);
      node.dataset.armed = String(progress >= 1);
      node.style.setProperty('--swipe-y', `${y - contentTop}px`);
      const circle = node.firstElementChild as HTMLElement;
      circle.style.transform = `translateX(${(direction === 'back' ? -1 : 1) * (100 - (tracking ? progress : 0) * 56)}%)`;
      circle.style.opacity = tracking ? '1' : '0';
    };
    const schedulePaint = () => { if (!paintFrame) paintFrame = requestAnimationFrame(paint); };
    const commit = (direction: HistoryDirection) => {
      const now = performance.now();
      if (now - lastCommit < 300 || hasNavigationOverlay()) return;
      if (!(direction === 'back' ? actions.current.canGoBack : actions.current.canGoForward)) return;
      lastCommit = now;
      actions.current.onNavigate(direction);
    };
    const settle = (navigate = true) => {
      clearTimeout(idleTimer);
      const update = releaseSwipe(gesture);
      gesture = update.gesture;
      visual = { ...visual, tracking: false };
      schedulePaint();
      if (navigate && update.released) commit(update.released);
    };
    const unsubscribeBegin = desktop.onTrackpadScrollBegin?.(() => {
      nativeGesture = true;
      gesture = pendingSwipe();
      startPath = [];
      clearTimeout(idleTimer);
    });
    const unsubscribeEnd = desktop.onTrackpadScrollEnd?.(() => settle());
    const onWheel = (event: WheelEvent) => {
      const now = performance.now();
      if (!nativeGesture && now - lastWheel > 180) { gesture = pendingSwipe(); startPath = []; }
      lastWheel = now;
      if (gesture.phase === 'ignored') return;
      const path = event.composedPath();
      if (gesture.phase === 'pending') {
        if (!startPath.length) y = event.clientY;
        startPath.push(...path.filter(node => !startPath.includes(node)));
      }
      const active = document.activeElement;
      const editing = active instanceof Element && active.matches(editableSelector) && startPath.some(node => node === active || node instanceof Element && active.contains(node));
      const sumX = gesture.phase === 'pending' ? gesture.x + event.deltaX : 0;
      const sumY = gesture.phase === 'pending' ? gesture.y + event.deltaY : 0;
      const locksHorizontal = gesture.phase === 'pending' && Math.abs(sumX) + Math.abs(sumY) >= 8 && Math.abs(sumX) > Math.abs(sumY);
      const blocked = event.ctrlKey || event.deltaMode !== 0 || hasNavigationOverlay() || editing ||
        startPath.some(node => node instanceof Element && !!node.closest('[role="dialog"], [role="alertdialog"], webview')) ||
        (locksHorizontal && canScroll(startPath, sumX));
      const update = advanceSwipe(gesture, { x: event.deltaX, y: event.deltaY, blocked,
        canBack: actions.current.canGoBack, canForward: actions.current.canGoForward });
      gesture = update.gesture;
      if (gesture.phase === 'tracking') visual = { direction: gesture.direction, progress: Math.min(1, gesture.distance / swipeThreshold), tracking: true };
      else visual = { ...visual, tracking: false };
      schedulePaint();
      if (update.released) commit(update.released);
      clearTimeout(idleTimer);
      if (!nativeGesture) idleTimer = setTimeout(() => settle(), 150);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.shiftKey || event.ctrlKey ||
        document.activeElement?.closest(editableSelector)) return;
      const mac = desktopPlatform() === 'darwin';
      const direction = mac && event.metaKey && !event.altKey ? (event.code === 'BracketLeft' ? 'back' : event.code === 'BracketRight' ? 'forward' : null) :
        event.altKey && !event.metaKey ? (event.key === 'ArrowLeft' ? 'back' : event.key === 'ArrowRight' ? 'forward' : null) : null;
      if (!direction || hasNavigationOverlay()) return;
      event.preventDefault();
      settle(false);
      commit(direction);
    };
    const mouse = (event: MouseEvent) => {
      if (![3, 4].includes(event.button) || hasNavigationOverlay()) return;
      event.preventDefault();
      if (event.type !== 'mouseup') return;
      settle(false);
      commit(event.button === 3 ? 'back' : 'forward');
    };
    const cancel = () => settle(false);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element) dirtyRoots.add(record.target);
        for (const node of record.addedNodes) if (node instanceof Element) dirtyRoots.add(node);
      }
      scheduleMeasure();
    });
    observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open', 'data-state'] });
    const resize = new ResizeObserver(() => { dirtyRoots.add(content); scheduleMeasure(); });
    resize.observe(content);
    dirtyRoots.add(content); measure();
    window.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('keydown', keyboard);
    window.addEventListener('mousedown', mouse, true);
    window.addEventListener('mouseup', mouse, true);
    window.addEventListener('auxclick', mouse, true);
    window.addEventListener('pointermove', pointer, { passive: true });
    window.addEventListener('scroll', scroll, { capture: true, passive: true });
    window.addEventListener('blur', cancel);
    return () => {
      unsubscribeBegin?.(); unsubscribeEnd?.(); observer.disconnect(); resize.disconnect();
      clearTimeout(idleTimer); cancelAnimationFrame(paintFrame); cancelAnimationFrame(measureFrame);
      window.removeEventListener('wheel', onWheel, true); window.removeEventListener('keydown', keyboard);
      window.removeEventListener('mousedown', mouse, true); window.removeEventListener('mouseup', mouse, true); window.removeEventListener('auxclick', mouse, true);
      window.removeEventListener('pointermove', pointer); window.removeEventListener('scroll', scroll, true); window.removeEventListener('blur', cancel);
    };
  }, []);
  return <div ref={indicator} className="history-swipe-viewport" aria-hidden="true" data-tracking="false" data-direction="back">
    <div className="history-swipe-circle"><ArrowLeft className="history-swipe-back" /><ArrowRight className="history-swipe-forward" /></div>
  </div>;
}
