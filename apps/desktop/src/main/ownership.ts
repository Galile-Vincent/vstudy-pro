interface OwnershipApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', handler: () => void): unknown;
}
interface OwnedWindow { isMinimized(): boolean; restore(): void; focus(): void }
export function acquireOwnership(app: OwnershipApp, window: () => OwnedWindow | null): boolean {
  if (!app.requestSingleInstanceLock()) { app.quit(); return false; }
  app.on('second-instance', () => {
    const current = window();
    if (current?.isMinimized()) current.restore();
    current?.focus();
    // Command-line paths have no frame-bound drop token and cannot authorize an import.
  });
  return true;
}
