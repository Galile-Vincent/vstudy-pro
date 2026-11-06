/** Exercise Windows fixture argv through native Node and PTYs on any host, without claiming Windows acceptance. @packageDocumentation */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { fixturePty, fixtureVersion, windowsFixtureImage } from './native-fixtures';
import { authStatus } from './probes';
import { buildPlan } from './plans';
import { claudeFixture } from './service-fixtures';
import { temporaryDirectories } from './test-fixtures';

const temporary = temporaryDirectories();
it('runs the Windows service fixture with explicit Node argv while preserving its signed-out and signed-in behavior', async () => {
  const root = await temporary(), folder = join(root, "folder with 'quotes'");
  await mkdir(folder, { mode: 0o700 });
  const program = claudeFixture(root, '1.2.3');
  const binary = join(folder, 'claude.exe');
  await writeFile(binary, process.platform === 'win32' ? program : windowsFixtureImage(program), { mode: 0o700 });
  const signal = AbortSignal.timeout(10_000);
  expect(await fixtureVersion(binary, 'claude', '1.2.3', root, signal)).toBe('1.2.3');
  const plan = buildPlan('status-claude', root, binary, null, null, Date.now());
  expect(await authStatus('claude', plan, fixturePty('win32'), signal)).toBe(false);
  await writeFile(join(root, 'auth'), 'signed in');
  expect(await authStatus('claude', plan, fixturePty('win32'), signal)).toBe(true);
  const calls = (await readFile(join(root, 'argv.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  expect(calls.map(call => call.args)).toEqual([['auth', 'status', '--json'], ['auth', 'status', '--json']]);
  expect(calls.every(call => call.env.updates === '1')).toBe(true);
});
