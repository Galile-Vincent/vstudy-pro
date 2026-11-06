/** Development fixture injection cannot alter packaged network or trust decisions. @packageDocumentation */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { setupNetwork } from './fixtures';
import { claudeFingerprint } from './releases';
import { temporaryDirectories } from './test-fixtures';
const temporary = temporaryDirectories();
it('requires both unpackaged execution and an explicit test flag', async () => {
  const env = { VSTUDY_AI_CLI_TEST: '1', VSTUDY_AI_CLI_FIXTURE_FILE: '/does-not-exist' };
  expect((await setupNetwork(true, env)).fingerprint).toBe(claudeFingerprint);
  expect((await setupNetwork(false, { ...env, VSTUDY_AI_CLI_TEST: '0' })).fingerprint).toBe(claudeFingerprint);
});
it('maps exact vendor URLs to bounded files, reloads metadata, and never falls through to network', async () => {
  const root = await temporary(), file = join(root, 'payload'), config = join(root, 'config.json'), url = 'https://downloads.claude.ai/claude-code-releases/latest';
  await writeFile(file, '1.0.0'); await writeFile(config, JSON.stringify({ files: { [url]: file }, claudeFingerprint: '0'.repeat(40), loginInterpreters: [process.execPath] }));
  const { network, fingerprint, loginInterpreters } = await setupNetwork(false, { VSTUDY_AI_CLI_TEST: '1', VSTUDY_AI_CLI_FIXTURE_FILE: config });
  expect(fingerprint).toBe('0'.repeat(40)); expect(loginInterpreters).toEqual([process.execPath]);
  expect(await network.text('claude', url, AbortSignal.timeout(5000))).toBe('1.0.0');
  await writeFile(file, '1.1.0'); expect(await network.text('claude', url, AbortSignal.timeout(5000))).toBe('1.1.0');
  await expect(network.text('claude', 'https://downloads.claude.ai/missing', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'offline' });
  await expect(network.text('claude', 'https://attacker.test/a', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'blocked' });
  expect(JSON.parse(await readFile(config, 'utf8')).files[url]).toBe(file);
});
