/**
 * Acquire single-instance ownership before opening the application data namespace.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
interface OwnershipApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', handler: (event?:unknown, argv?:string[]) => void): unknown;
}
interface OwnedWindow { isMinimized(): boolean; restore(): void; focus(): void }
/** Acquire the single-instance lock before any normal userData initialization. */
export function acquireOwnership(app: OwnershipApp, window: () => OwnedWindow | null, restoreWindow?: () => void): boolean {
  if (!app.requestSingleInstanceLock()) { app.quit(); return false; }
  app.on('second-instance', (_event, argv) => {
    if (argv?.includes('--mcp-background')) return;
    if (restoreWindow) {restoreWindow();return;}
    const current = window();
    if (current?.isMinimized()) current.restore();
    current?.focus();
    // Command-line paths have no frame-bound drop token and cannot authorize an import.
  });
  return true;
}

export function relaunchArguments(argv: string[] = process.argv): string[] {
  return argv.slice(1).filter(arg => arg !== '--mcp-background');
}

export function restartOwnedApp(app: {
  releaseSingleInstanceLock(): void;
  relaunch(options: {args:string[]}): void;
  exit(code?: number): void;
}, code = 0): void {
  app.releaseSingleInstanceLock();
  try { app.relaunch({args:relaunchArguments()}); }
  finally { app.exit(code); }
}
