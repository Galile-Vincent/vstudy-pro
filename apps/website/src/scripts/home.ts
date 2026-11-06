/** Marketing examples are local-only. Motion follows both the visitor's preference and pause control. */
import palettes from '../../../desktop/src/shared/themes/palettes.json';
import { transitionTheme } from './theme';
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const motionButton = document.querySelector<HTMLButtonElement>('#motion-toggle');
let paused = reduced.matches;
function setMotion() {
  root.dataset.motion = paused ? 'paused' : 'running';
  motionButton?.setAttribute('aria-pressed', String(paused));
  if (motionButton) motionButton.textContent = (paused ? motionButton.dataset.resume : motionButton.dataset.pause) ?? '';
}
setMotion();
motionButton?.addEventListener('click', () => { paused = !paused; setMotion(); });
reduced.addEventListener('change', () => { paused = reduced.matches; setMotion(); });
const reveals = document.querySelectorAll<HTMLElement>('[data-reveal]');
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  }
}, { threshold: 0.08 });
reveals.forEach(element => { if (element.getBoundingClientRect().top > innerHeight) element.classList.add('reveal-ready'); observer.observe(element); });
const product = document.querySelector<HTMLElement>('.product-depth');
let scheduled = false;
function moveProduct() {
  scheduled = false;
  if (!product) return;
  const progress = Math.min(1, Math.max(0, scrollY / 1100));
  product.style.transform = paused || reduced.matches ? '' : `translateY(${progress * -20}px) scale(${1 - progress * 0.018})`;
}
window.addEventListener('scroll', () => { if (!scheduled) { scheduled = true; requestAnimationFrame(moveProduct); } }, { passive: true });
motionButton?.addEventListener('click', moveProduct);
reduced.addEventListener('change', moveProduct);
let seconds = 17 * 3600;
const deadline = document.querySelector<HTMLElement>('[data-deadline]');
let deadlineVisible = false;
if (deadline) new IntersectionObserver(entries => { deadlineVisible = entries.some(entry => entry.isIntersecting); }).observe(deadline);
window.setInterval(() => {
  if (paused || reduced.matches || document.hidden || !deadlineVisible || !deadline) return;
  seconds = Math.max(0, seconds - 1);
  deadline.textContent = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2,'0')).join(':');
}, 1000);
const approve = document.querySelector<HTMLButtonElement>('[data-approve]');
const reset = document.querySelector<HTMLButtonElement>('[data-reset]');
const approvalStatus = document.querySelector('[data-approval-status]');
approve?.addEventListener('click', () => {
  approve.disabled = true;
  approve.textContent = approve.dataset.approved ?? '';
  approve.closest('.approval-demo')?.classList.add('approved');
  if (reset) reset.hidden = false;
  if (approvalStatus) approvalStatus.textContent = approve.dataset.approved ?? '';
});
reset?.addEventListener('click', () => {
  if (!approve) return;
  approve.disabled = false;
  approve.textContent = approve.dataset.label ?? '';
  approve.closest('.approval-demo')?.classList.remove('approved');
  reset.hidden = true;
  if (approvalStatus) approvalStatus.textContent = '';
  approve.focus();
});
const search = document.querySelector<HTMLInputElement>('#history-demo');
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    search?.focus();
  }
});
search?.addEventListener('input', () => {
  const query = search.value.trim().toLocaleLowerCase();
  const matches = !query || (search.dataset.match ?? '').toLocaleLowerCase().includes(query);
  const result = document.querySelector<HTMLElement>('[data-history-result]');
  const empty = document.querySelector<HTMLElement>('[data-history-empty]');
  if (result) result.hidden = !matches;
  if (empty) empty.hidden = matches;
});
let selected = palettes[0]!;
function applyPack() {
  const dark = root.dataset.scheme === 'dark';
  const colors = dark ? selected.dark : selected.light;
  root.style.setProperty('--accent', colors[7]!);
  root.style.setProperty('--on-accent', dark ? '#0b0b0d' : '#ffffff');
  const button = document.querySelector<HTMLButtonElement>(`[data-theme-id="${selected.id}"]`);
  const preview = document.querySelector<HTMLImageElement>('.theme-preview img');
  const src = dark ? button?.dataset.darkShot : button?.dataset.lightShot;
  if (preview && src) { preview.src = src; preview.alt = `${button?.getAttribute('aria-label')} · ${dark ? button?.dataset.darkLabel : button?.dataset.lightLabel}`; }
}
document.querySelectorAll<HTMLButtonElement>('[data-theme-id]').forEach(button => button.addEventListener('click', () => {
  const pack = palettes.find(item => item.id === button.dataset.themeId);
  if (!pack) return;
  transitionTheme(() => {
    selected = pack;
    document.querySelectorAll('[data-theme-id]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    applyPack();
  });
}));
document.addEventListener('scheme-change', applyPack);
applyPack();
