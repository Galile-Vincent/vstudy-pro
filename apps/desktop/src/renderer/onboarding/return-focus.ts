const helpButton = '.learning-help-trigger';

function resolve(opener: Element | null) {
  if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body && !opener.closest('[role=menu]')) return opener;
  return document.querySelector<HTMLElement>(helpButton);
}

export function returnFocusTo(opener: () => Element | null) {
  return (event: Event) => {
    event.preventDefault();
    resolve(opener())?.focus();
  };
}

export function isInsideDialog(element: Element | null) {
  return !!element?.closest('[role=dialog]');
}
