/** jsdom lacks the native dialog and popover APIs that Astryx overlays call. Import first in a test that renders them. */
const dialog = globalThis.HTMLDialogElement?.prototype;
if (dialog && !dialog.showModal) {
  dialog.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  dialog.show = function show(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  dialog.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
}
const element = globalThis.HTMLElement?.prototype as (HTMLElement & Record<string, unknown>) | undefined;
if (element && !element.showPopover) {
  element.showPopover = function showPopover(this: HTMLElement) { this.setAttribute('data-popover-open', ''); };
  element.hidePopover = function hidePopover(this: HTMLElement) { this.removeAttribute('data-popover-open'); };
  element.togglePopover = function togglePopover(this: HTMLElement) { this.toggleAttribute('data-popover-open'); return this.hasAttribute('data-popover-open'); };
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
export {};
