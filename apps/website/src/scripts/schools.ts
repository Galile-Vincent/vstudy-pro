/** Local carousel state owns playback, typed queries, and accessibility. No action makes a network request. */
const demo = document.querySelector<HTMLElement>('[data-school-demo]');
if (demo) {
  const slides = [...demo.querySelectorAll<HTMLElement>('[data-school-slide]')];
  const dots = [...demo.querySelectorAll<HTMLButtonElement>('[data-school-dot]')];
  const stage = demo.querySelector<HTMLElement>('[data-school-stage]')!;
  const controls = demo.querySelector<HTMLElement>('[data-school-controls]')!;
  const play = demo.querySelector<HTMLButtonElement>('[data-school-play]')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const interruptions = new Set<string>();
  let index = 0;
  let manuallyPaused = false;
  let slideTimer: number | undefined;
  let typingTimer: number | undefined;
  let typed = 0;

  function playing() {
    return !manuallyPaused && !reduced.matches && interruptions.size === 0;
  }
  function typeQuery() {
    const slide = slides[index]!;
    const query = slide.querySelector<HTMLElement>('[data-school-query]')!;
    const full = slide.dataset.query!;
    query.textContent = full.slice(0, typed);
    if (typed < full.length && playing()) {
      typingTimer = window.setTimeout(() => { typed++; typeQuery(); }, 55);
    }
  }
  function render() {
    window.clearTimeout(slideTimer);
    window.clearTimeout(typingTimer);
    demo!.dataset.playback = reduced.matches ? 'static' : playing() ? 'playing' : 'paused';
    controls.hidden = reduced.matches;
    stage.setAttribute('aria-live', playing() ? 'off' : 'polite');
    play.textContent = (manuallyPaused ? play.dataset.play : play.dataset.pause)!;
    slides.forEach((slide, position) => {
      const visible = reduced.matches || position === index;
      slide.toggleAttribute('data-active', position === index);
      slide.inert = !visible;
      slide.setAttribute('aria-hidden', String(!visible));
      if (reduced.matches) slide.querySelector<HTMLElement>('[data-school-query]')!.textContent = slide.dataset.query!;
    });
    dots.forEach((dot, position) => dot.setAttribute('aria-current', String(position === index)));
    if (!reduced.matches) typeQuery();
    if (playing()) slideTimer = window.setTimeout(() => {
      index = (index + 1) % slides.length;
      typed = 0;
      render();
    }, 4800);
  }
  function interrupt(reason: string, active: boolean) {
    if (active) interruptions.add(reason);
    else interruptions.delete(reason);
    render();
  }
  function select(position: number) {
    index = (position + slides.length) % slides.length;
    typed = slides[index]!.dataset.query!.length;
    manuallyPaused = true;
    const focusWasInSlide = slides.some(slide => slide.contains(document.activeElement));
    render();
    if (focusWasInSlide) dots[index]!.focus();
  }
  demo.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') interrupt('hover', true); });
  demo.addEventListener('pointerleave', () => interrupt('hover', false));
  demo.addEventListener('pointerdown', event => { if (event.pointerType === 'touch') { manuallyPaused = true; render(); } });
  demo.addEventListener('focusin', () => interrupt('focus', true));
  demo.addEventListener('focusout', event => { if (!demo.contains(event.relatedTarget as Node | null)) interrupt('focus', false); });
  document.addEventListener('visibilitychange', () => interrupt('hidden', document.hidden));
  reduced.addEventListener('change', render);
  play.addEventListener('click', () => { manuallyPaused = !manuallyPaused; render(); });
  demo.querySelector('[data-school-prev]')!.addEventListener('click', () => select(index - 1));
  demo.querySelector('[data-school-next]')!.addEventListener('click', () => select(index + 1));
  dots.forEach((dot, position) => dot.addEventListener('click', () => select(position)));
  demo.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      select(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
  demo.querySelectorAll('[data-school-connect]').forEach(button => button.addEventListener('click', () => {
    button.classList.remove('is-connecting');
    requestAnimationFrame(() => button.classList.add('is-connecting'));
  }));
  demo.querySelectorAll('[data-school-connect]').forEach(button => button.addEventListener('animationend', () => button.classList.remove('is-connecting')));
  new MutationObserver(() => interrupt('page-motion', document.documentElement.dataset.motion === 'paused'))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  if (document.hidden) interruptions.add('hidden');
  if (document.documentElement.dataset.motion === 'paused') interruptions.add('page-motion');
  demo.setAttribute('data-enhanced', '');
  render();
}
