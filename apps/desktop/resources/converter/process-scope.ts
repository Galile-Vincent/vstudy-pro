import { spawn, type SpawnOptions, type ChildProcess } from 'node:child_process';

export class ProcessScope {
  private disposed = false;
  private children = new Map<ChildProcess, Promise<void>>();
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcess {
    if (this.disposed) throw new Error('Converter closed');
    const child = spawn(command, args, { ...options, detached: process.platform !== 'win32' });
    const closed = new Promise<void>(resolve => child.once('close', () => { this.children.delete(child); resolve(); }));
    this.children.set(child, closed);
    return child;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    const children = [...this.children];
    const kill = (signal: NodeJS.Signals) => {
      for (const [child] of children) {
        try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* A process group may already have exited. */ }
      }
    };
    kill('SIGTERM');
    const timer = setTimeout(() => kill('SIGKILL'), 300);
    try { await Promise.all(children.map(([,closed]) => closed)); }
    finally { clearTimeout(timer); kill('SIGKILL'); }
  }
}
