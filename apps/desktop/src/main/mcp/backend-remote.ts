/** Serialize bounded school requests with spacing, jitter, live capabilities and no mutation retry. @packageDocumentation */
import type { z } from 'zod';
import type { McpBackendOptions } from './backend-types';
import type { BackendContext } from './backend-context';
import { backendBoundary, fail } from './backend-errors';

export class BackendRemote {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private lastFinished: number | null = null;
  constructor(private readonly options:McpBackendOptions, private readonly onSecrets?: (values:readonly string[]) => void) {}
  supports(context:BackendContext, name:string): boolean {
    return context.repository.capabilities(context.account().id)?.functions?.includes(name) === true;
  }
  require(context:BackendContext, names:readonly string[]): void {
    if (names.some(name => !this.supports(context, name))) fail('UNSUPPORTED');
  }
  async call<S extends z.ZodTypeAny>(context:BackendContext, name:string, params:Record<string,string>, schema:S): Promise<z.output<S>> {
    this.require(context, [name]);
    if (this.pending >= 24) fail('RATE_LIMITED');
    this.pending++;
    const work = this.tail.catch(() => {}).then(() => backendBoundary(async () => {
      const clock = this.options.clock ?? Date.now;
      const random = this.options.random ?? Math.random;
      const wait = this.options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
      if (this.lastFinished !== null) await wait(Math.max(0, this.lastFinished + 250 + Math.floor(random() * 151) - clock()));
      context.recheck();
      this.require(context, [name]);
      if (context.account().status !== 'connected') fail('SESSION_REQUIRED');
      try {
        const client = await this.options.moodle.mcpClient(context.account().id, this.onSecrets);
        context.recheck();
        return await client.call(name, params, schema, false);
      } finally { this.lastFinished = clock(); }
    }));
    this.tail = work;
    try { return await work; } finally { this.pending--; }
  }
}
