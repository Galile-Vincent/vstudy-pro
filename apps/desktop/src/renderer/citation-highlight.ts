export function highlightCitation(root: HTMLElement, offset: number, reducedMotion: boolean): () => void {
  // Resolve content-visibility estimates before measuring a distant citation target.
  root.setAttribute('data-citation-layout', '');
  void root.getBoundingClientRect();
  let highlighted: HTMLElement | undefined;
  let expiry = 0;
  let timer: ReturnType<typeof setTimeout>;
  let settle: ReturnType<typeof setTimeout>;
  const target = () => {
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-start]'));
    return nodes.find(n => Number(n.dataset.start) === offset) ?? nodes.find(n => Number(n.dataset.start) <= offset && Number(n.dataset.end) > offset) ?? nodes.find(n => Number(n.dataset.start) > offset);
  };
  const apply = () => {
    const next = target();
    if (next !== highlighted) { highlighted?.removeAttribute('data-citation-highlight'); highlighted = next; }
    if (highlighted && Date.now() < expiry) highlighted.setAttribute('data-citation-highlight','');
  };
  const finish = () => {
    clearTimeout(settle); clearTimeout(timer);
    target()?.scrollIntoView({block:'center',behavior:'instant'});
    expiry = Date.now() + 2000;
    apply();
    timer = setTimeout(() => { expiry = 0; highlighted?.removeAttribute('data-citation-highlight'); observer.disconnect(); resize?.disconnect(); root.removeAttribute('data-citation-layout'); },2000);
    root.ownerDocument.removeEventListener('scroll', scrolling, true);
    root.ownerDocument.removeEventListener('scrollend', finish, true);
  };
  const scrolling = () => { clearTimeout(settle); settle = setTimeout(finish,120); };
  const layoutChanged = () => {
    apply();
    if (expiry) target()?.scrollIntoView({block:'center',behavior:'instant'});
    else scrolling();
  };
  const observer = new MutationObserver(layoutChanged);
  const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(layoutChanged);
  resize?.observe(root);
  observer.observe(root,{childList:true,subtree:true});
  root.ownerDocument.addEventListener('scroll',scrolling,true);
  root.ownerDocument.addEventListener('scrollend',finish,true);
  target()?.scrollIntoView({block:'center',behavior:reducedMotion ? 'instant' : 'smooth'});
  settle = setTimeout(finish,120);
  return () => { clearTimeout(timer); clearTimeout(settle); observer.disconnect(); resize?.disconnect(); root.removeAttribute('data-citation-layout'); highlighted?.removeAttribute('data-citation-highlight'); root.ownerDocument.removeEventListener('scroll',scrolling,true); root.ownerDocument.removeEventListener('scrollend',finish,true); };
}
