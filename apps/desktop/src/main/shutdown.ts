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
    } finally { clearTimeout(timeout); }
  })();
}
