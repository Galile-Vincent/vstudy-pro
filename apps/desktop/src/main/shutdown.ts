/**
 * Drain asynchronous work before closing shared resources and exiting Electron.
 * Owned by main.
 * Main owns privileged resources; shutdown must settle work before releasing those resources.
 * @packageDocumentation
 */
/** Join repeated quit requests and force exit only when ordered cleanup fails or exceeds its deadline. */
export function coordinateShutdown(phases: {
  stopWork(): Promise<void>;
  flush(): void;
  close(): void;
  quit(): void;
  forceExit(): void;
}, timeoutMs = 5000): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => pending ??= (async () => {
    const timeout = setTimeout(() => phases.forceExit(), timeoutMs);
    try {
      await phases.stopWork();
      phases.flush();
      phases.close();
      phases.quit();
    } catch { phases.forceExit(); }
    finally { clearTimeout(timeout); }
  })();
}
