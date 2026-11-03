import { createCodexAdapter } from './codex';
import { discoverModels } from './models';
import { cliArgs, findCli, runCli } from './cli-transport';
export { cliArgs, cliEnvironment, findCli, runCli } from './cli-transport';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderAdapter } from './index';
export function createCliAdapter(
  binary: "claude" | "codex" | "agy",
): ProviderAdapter {
  if (binary === 'codex') return createCodexAdapter();
  return {
    async detect() {
      if (!(await findCli(binary)))
        return { available: false, reason: `${binary} CLI not found` };
      if (binary === "agy")
        return {
          available: false,
          reason: "agy CLI detected; streaming protocol is not supported",
        };
      return { available: true };
    },
    async listModels() {
      return binary === 'agy' ? [] : discoverModels(binary);
    },
    async *stream(request, signal) {
      const file = await findCli(binary);
      if (!file || binary === "agy") throw new Error("CLI unavailable");
      const cwd = await mkdtemp(
        join(tmpdir(), `vstudy-${request.conversationId}-`),
      );
      try {
        yield* runCli(
          file,
          cliArgs(binary, request.modelId, request.options),
          request.options?.effort === 'ultrathink' ? `ultrathink\n\n${request.prompt}` : request.prompt,
          cwd,
          binary,
          signal,
          120_000, request.onUsageSnapshot,
        );
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
