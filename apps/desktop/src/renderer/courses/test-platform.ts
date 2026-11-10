const previousFocus = new WeakMap<HTMLDialogElement, Element | null>();
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    previousFocus.set(this, document.activeElement);
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    const previous = previousFocus.get(this);
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    this.dispatchEvent(new Event('close'));
  };
}
if (typeof HTMLElement !== 'undefined' && !HTMLElement.prototype.showPopover) {
  HTMLElement.prototype.showPopover = function () { this.setAttribute('data-test-popover-open', ''); this.style.display = 'block'; };
  HTMLElement.prototype.hidePopover = function () { this.removeAttribute('data-test-popover-open'); this.style.display = 'none'; };
  HTMLElement.prototype.togglePopover = function (force) {
    const open = force ?? !this.hasAttribute('data-test-popover-open');
    if (open) this.showPopover(); else this.hidePopover();
    return open;
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const dialog = event.target instanceof Element ? event.target.closest('dialog[open]') : null;
    dialog?.dispatchEvent(new Event('cancel', { cancelable: true }));
  });
}
