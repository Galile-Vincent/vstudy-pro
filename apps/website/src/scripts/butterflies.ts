/** A single session arrival, replayable from home logos. No work remains after the flight ends. */
import { duration, flights, frame, type Rect } from './butterfly-model';
const layer = document.querySelector<HTMLElement>('.butterfly-flight');
const hero = document.querySelector<HTMLElement>('.hero-brand');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const key = 'vstudy-butterflies-v1';
const root = document.documentElement;
let animation = 0;
let previous = 0;
let elapsed = 0;
let playedHere = false;
let current: ReturnType<typeof flights> = [];
let zones: Rect[] = [];
const butterflies = Array.from(layer?.querySelectorAll<HTMLElement>('.butterfly') ?? []);
function stop() {
  cancelAnimationFrame(animation);
  animation = 0;
  if (layer) layer.hidden = true;
}
function paused() { return document.hidden || root.dataset.motion === 'paused'; }
function tick(time: number) {
  elapsed += Math.min(48, time - previous);
  previous = time;
  current.forEach((flight, i) => {
    const element = butterflies[i]!;
    const state = frame(flight, elapsed, zones);
    element.style.transform = `translate3d(${state.point.x - flight.size / 2}px,${state.point.y - flight.size / 2}px,0) rotate(${state.angle}deg)`;
    element.style.opacity = String(state.opacity);
    const flutter = .68 + Math.sin(elapsed / 165 + i) * .28;
    const wings = element.children;
    (wings[0] as HTMLElement).style.transform = `scaleX(${flutter}) skewY(${(1 - flutter) * 9}deg)`;
    (wings[1] as HTMLElement).style.transform = `scaleX(${flutter}) skewY(${(flutter - 1) * 9}deg)`;
  });
  if (elapsed >= duration) stop();
  else animation = requestAnimationFrame(tick);
}
function play() {
  stop();
  if (!layer || !hero || reduced.matches || paused()) return;
  const nav = document.querySelector('.site-header .brand')!.getBoundingClientRect();
  const origin = hero.getBoundingClientRect();
  if (origin.bottom < 0) return;
  const navigatorHints = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const count = innerWidth < 768 || navigatorHints.connection?.saveData || (navigatorHints.deviceMemory ?? 8) <= 4 || navigator.hardwareConcurrency <= 4 ? 3 : 4;
  current = flights(innerWidth, { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 }, { x: nav.left + 12, y: nav.bottom + 13 }, Math.min(innerHeight - 40, document.querySelector('.hero-screen')!.getBoundingClientRect().bottom), count);
  zones = Array.from(document.querySelectorAll('.hero h1 span,.hero-sub,.hero-actions a,.release-meta')).map(element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect(); });
  butterflies.forEach((element, i) => { element.hidden = i >= count; if (current[i]) element.style.width = element.style.height = `${current[i]!.size}px`; });
  layer.hidden = false;
  elapsed = 0;
  previous = performance.now();
  animation = requestAnimationFrame(tick);
  playedHere = true;
  try { sessionStorage.setItem(key, 'played'); } catch { /* The animation still runs without optional session storage. */ }
}
function syncPause() {
  if (!layer || layer.hidden) return;
  if (paused()) { cancelAnimationFrame(animation); animation = 0; }
  else if (!animation) { previous = performance.now(); animation = requestAnimationFrame(tick); }
}
document.addEventListener('visibilitychange', () => { syncPause(); if (!document.hidden && layer?.hidden) arrive(); });
new MutationObserver(syncPause).observe(root, { attributes: true, attributeFilter: ['data-motion'] });
reduced.addEventListener('change', () => { if (reduced.matches) stop(); });
window.addEventListener('resize', stop, { passive: true });
window.addEventListener('scroll', stop, { passive: true });
hero?.addEventListener('click', play);
document.querySelectorAll<HTMLAnchorElement>('.brand').forEach(logo => logo.addEventListener('click', event => {
  if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (scrollY > 0) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    requestAnimationFrame(() => requestAnimationFrame(play));
  } else play();
}));
function arrive() {
  let played = playedHere;
  try { played ||= sessionStorage.getItem(key) === 'played'; } catch { /* Storage is optional. */ }
  if (!played) {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => play(), { timeout: 1800 });
    else setTimeout(play, 300);
  }
}
if (document.readyState === 'complete') arrive();
else window.addEventListener('load', arrive, { once: true });
