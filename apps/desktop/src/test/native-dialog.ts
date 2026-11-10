// jsdom has no top layer: emulate the native dialog and popover methods Astryx calls.
const dialog = typeof HTMLDialogElement === 'undefined' ? undefined : HTMLDialogElement.prototype;
if (dialog) {
  dialog.show ??= function show(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  dialog.showModal ??= function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  dialog.close ??= function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
const element = typeof HTMLElement === 'undefined' ? undefined : HTMLElement.prototype;
if (element) {
  element.showPopover ??= function showPopover(this: HTMLElement) { this.setAttribute('data-popover-open', ''); };
  element.hidePopover ??= function hidePopover(this: HTMLElement) { this.removeAttribute('data-popover-open'); };
  element.togglePopover ??= function togglePopover(this: HTMLElement) { this.toggleAttribute('data-popover-open'); return this.hasAttribute('data-popover-open'); };
}
