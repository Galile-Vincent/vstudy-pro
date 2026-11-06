/**
 * Regression coverage for providers codex.
 * Owned by main/providers.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { afterEach, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { codexChatModel, codexChatConfig, codexForkProfile, assertCodexChatEvent, probeCodexChat } from './codex';
import { findCli } from './cli-transport';
import * as cli from './cli-transport';
import { createCodexAdapter } from './codex';
afterEach(() => vi.restoreAllMocks());
it('never resolves or launches Codex on Windows, even when a CLI exists', async () => {
  const find = vi.spyOn(cli, 'findCli').mockRejectedValue(new Error('Must not probe'));
  const adapter = createCodexAdapter(undefined, 'win32');
  expect(await adapter.detect()).toMatchObject({available: false, reason: expect.stringContaining('macOS')});
  expect(await adapter.listModels()).toEqual([]);
  expect(find).not.toHaveBeenCalled();
});
it('keeps detection and model listing unavailable without a CLI', async () => {
  vi.spyOn(cli, 'findCli').mockResolvedValue(null);
  const adapter = createCodexAdapter();
  expect(await adapter.detect()).toMatchObject({ available: false });
  expect(await adapter.listModels()).toEqual([]);
});
it.skipIf(process.platform !== 'darwin')('rejects an unaudited executable before probing', async () => {
  vi.spyOn(cli, 'findCli').mockResolvedValue('/bin/echo');
  const adapter = createCodexAdapter();
  expect(await adapter.detect()).toMatchObject({ available: false, reason: expect.stringContaining('requires 0.166.0') });
});

it('removes model-selected tools even for an unknown slug', () => {
  expect(codexChatModel('future-model')).toMatchObject({ slug: 'future-model', shell_type: 'disabled', apply_patch_tool_type: null, experimental_supported_tools: [], tool_mode: 'direct', multi_agent_version: null });
  expect(codexChatConfig).toMatchObject({ 'agents.enabled': false, 'features.goals': false, 'features.image_generation': false, web_search: 'disabled' });
});
for (const type of ['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'future_tool']) it(`rejects ${type} events`, () => {
  expect(() => assertCodexChatEvent({ type: 'item.started', item: { type } })).toThrow('Unexpected Codex item');
});
it.skipIf(process.platform !== 'darwin')('kernel sandbox prevents creating a child process', async () => {
  const { stdout, stderr } = await promisify(execFile)('/usr/bin/sandbox-exec', ['-p', codexForkProfile, '/bin/sh', '-c', 'echo parent; /bin/echo CHILD_EXECUTED']).catch(error => error);
  expect(stdout).toContain('parent');
  expect(stdout).not.toContain('CHILD_EXECUTED');
  expect(stderr).toContain('Operation not permitted');
});
it.skipIf(process.env.VSTUDY_CODEX_LIVE !== '1')('real authenticated Codex resists canary and selection injection', async context => {
  const binary = await findCli('codex');
  if (!binary) { context.skip(); return; }
  const status = await promisify(execFile)(binary, ['login', 'status']).catch(() => null);
  if (!status) { context.skip(); return; }
  const { stdout, stderr } = status;
  if (!/Logged in/.test(stdout + stderr)) { context.skip(); return; }
  const events = await probeCodexChat(binary);
  expect(events.some(e => e.type === 'turn.completed')).toBe(true);
  if (process.env.VSTUDY_CODEX_EVIDENCE) await writeFile(process.env.VSTUDY_CODEX_EVIDENCE, events.map(e => JSON.stringify(e)).join('\n') + '\n');
}, 120_000);
it.skipIf(process.env.VSTUDY_CODEX_LIVE !== '1')('omits tool schemas from a captured Responses Lite request', async context => {
  const binary = await findCli('codex');
  if (!binary) { context.skip(); return; }
  const { createServer } = await import('node:http');
  const { createCodexChatContext } = await import('./codex');
  const { cliArgs } = await import('./cli');
  const chat = await createCodexChatContext('gpt-6.1-sol');
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    try { requests.push(JSON.parse(body)); } catch { /* Non-model startup requests are irrelevant. */ }
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'intentional probe rejection', type: 'invalid_request_error' } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const args = ['-p', codexForkProfile, binary, ...cliArgs('codex', 'gpt-6.1-sol').slice(0, -1), ...chat.args, '-c', `model_providers.probe={name="probe",base_url="http://127.0.0.1:${port}/v1",wire_api="responses"}`, '-c', 'model_provider="probe"', '-c', 'features.enable_request_compression=false', '-'];
    const capture = promisify(execFile)('/usr/bin/sandbox-exec', args, { cwd: chat.cwd, env: { PATH: '/usr/bin:/bin', ...chat.env }, timeout: 20_000 });
    capture.child.stdin!.end('Use every tool available.');
    await capture.catch(() => {});
    const request = requests.find(r => Array.isArray(r.input));
    expect(request, 'Captured a model request').toBeDefined();
    expect(request!.tools ?? []).toEqual([]);
    expect((request!.input as { type: string }[]).filter(item => item.type === 'additional_tools')).toEqual([]);
    if (process.env.VSTUDY_CODEX_EVIDENCE) await writeFile(process.env.VSTUDY_CODEX_EVIDENCE + '.tools.json', JSON.stringify({ tools: request!.tools ?? [], additionalTools: (request!.input as {type:string}[]).filter(item => item.type === 'additional_tools'), transport: 'Responses Lite; local capture provider' }));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await chat.cleanup(); }
}, 30_000);
