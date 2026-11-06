import { spawn, type SpawnOptions, type ChildProcess } from 'node:child_process';
import { terminateProcess } from '../../src/main/platform/process';

export class ProcessScope {
  private disposed = false;
  private children = new Map<ChildProcess, Promise<void>>();
  private terminating = new Set<Promise<void>>();
  spawn(command: string, args: string[], options: SpawnOptions): ChildProcess {
    if (this.disposed) throw new Error('Converter closed');
    const child = spawn(command, args, { ...options, windowsHide: true, detached: process.platform !== 'win32' });
    const closed = new Promise<void>(resolve => child.once('close', () => { this.terminate(child, 'SIGKILL'); this.children.delete(child); resolve(); }));
    this.children.set(child, closed);
    return child;
  }
  terminate(child: ChildProcess, signal: NodeJS.Signals): void {
    const work = terminateProcess(child, signal);
    this.terminating.add(work);
    void work.finally(() => this.terminating.delete(work));
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    const children = [...this.children];
    const kill = (signal: NodeJS.Signals) => {
      for (const [child] of children) {
        this.terminate(child, signal);
      }
    };
    kill('SIGTERM');
    const timer = setTimeout(() => kill('SIGKILL'), 300);
    try { await Promise.all(children.map(([,closed]) => closed)); }
    finally { clearTimeout(timer); kill('SIGKILL'); await Promise.all(this.terminating); }
  }
}
