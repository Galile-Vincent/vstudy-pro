import { ProcessScope } from "./process-scope";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { scrubbedEnvironment, type Progress } from "./index";

export class WarmWorker {
  private child: ChildProcessWithoutNullStreams | undefined;
  private ready: Promise<void> | undefined;
  private pending: { resolve: () => void; reject: (error: Error) => void; progress: Progress | undefined } | undefined;
  private idle?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;

  constructor(private readonly python: string, private readonly script: string, private readonly cwd: string, private readonly scope?: ProcessScope) {}

  start(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      const args = [this.script, "--warm-worker"];
      const executable = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : this.python;
      const launchArgs = process.platform === 'darwin' ? ['-p', '(version 1)(allow default)(deny network*)', this.python, ...args] : args;
      const child = (this.scope ? this.scope.spawn.bind(this.scope) : spawn)(executable, launchArgs, {
        cwd: this.cwd, env: scrubbedEnvironment(this.cwd), shell: false, stdio: ["pipe", "pipe", "pipe"],
      });
      this.child = child as ChildProcessWithoutNullStreams;
      child.stdin!.on("error", error => this.stop(error));
      let bytes = 0;
      this.timer = setTimeout(() => { const error = new Error("Converter process timed out"); reject(error); this.stop(error); }, 120_000);
      const consume = (line: string) => {
        try {
          const record = JSON.parse(line) as { ready?: boolean; done?: boolean; progress?: string; error?: string; code?: string };
          if (record.ready) { clearTimeout(this.timer); resolve(); this.scheduleIdle(); }
          else if (record.progress) this.pending?.progress?.(record.progress);
          else if (record.code === "PDF_FALLBACK") this.pending?.progress?.("PDF too complex or large for the built-in parser; trying fallback…");
          else if (record.error) {
            const message = ["PDF_RESOURCE_LIMIT", "PDF_TIME_LIMIT"].includes(record.code ?? "")
              ? "This PDF is too large or complex to convert" : "Document conversion failed";
            if (!this.pending) { const error = new Error(message); reject(error); this.stop(error); }
            else { this.pending.reject(new Error(message)); this.finish(); }
          } else if (record.done) { this.pending?.resolve(); this.finish(); }
        } catch { /* Libraries may emit non-JSON diagnostics. */ }
      };
      for (const stream of [child.stdout, child.stderr]) {
        stream!.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1024 * 1024) this.stop(new Error("Converter process output exceeds limit"));
        });
        createInterface({ input: stream! }).on("line", consume);
      }
      child.once("error", error => { reject(error); this.stop(error); });
      child.once("close", () => {
        const error = new Error("Converter worker stopped; retry conversion");
        reject(error);
        if (this.child === child) this.stop(error);
      });
    });
    return this.ready;
  }

  async run(source: string, target: string, library: string, progress?: Progress): Promise<void> {
    await this.start();
    if (this.pending) throw new Error("Converter worker is busy");
    clearTimeout(this.idle);
    await new Promise<void>((resolve, reject) => {
      this.pending = { resolve, reject, progress };
      this.timer = setTimeout(() => this.stop(new Error("Converter process timed out")), 120_000);
      this.child!.stdin.write(`${JSON.stringify({ source, target, library })}\n`);
    });
  }

  private finish(): void { clearTimeout(this.timer); this.pending = undefined; this.scheduleIdle(); }
  private scheduleIdle(): void { clearTimeout(this.idle); this.idle = setTimeout(() => this.stop(), 300_000); this.idle.unref(); }
  stop(error = new Error("Converter closed")): void {
    clearTimeout(this.timer); clearTimeout(this.idle);
    this.pending?.reject(error); this.pending = undefined;
    if (this.child) { if (this.scope) this.scope.terminate(this.child, "SIGKILL"); else this.child.kill("SIGKILL"); } this.child = undefined; this.ready = undefined;
  }
}
