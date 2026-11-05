/**
 * Adapt Claude CLI output and process lifetime to the shared provider interface.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
import { createCodexAdapter } from './codex';
import { discoverModels } from './models';
import { cliArgs, findCli, runCli } from './cli-transport';
export { cliArgs, cliEnvironment, findCli, runCli } from './cli-transport';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderAdapter } from './index';
/** Create the opted-in CLI adapter using the shared event and cancellation contract. */
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
      return binary === 'agy' ? [] : (await discoverModels(binary)).map(m=>({...m,supportsImages:true}));
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
          [...cliArgs(binary, request.modelId, request.options), ...(request.systemPrompt ? ['--system-prompt',request.systemPrompt] : []), ...(request.images?.length ? ['--input-format','stream-json'] : [])],
          request.images?.length ? JSON.stringify({type:'user',message:{role:'user',content:[{type:'text',text:request.prompt},...request.images.map(image=>({type:'image',source:{type:'base64',media_type:image.mediaType,data:image.data}}))]}})+'\n' : request.options?.effort === 'ultrathink' ? `ultrathink\n\n${request.prompt}` : request.prompt,
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
