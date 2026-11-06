/**
 * Opt-in development transport fixtures. Packaged applications cannot use local download mappings.
 * The real release parsers, hashes, PTYs, and provider adapters remain in the execution path.
 * @packageDocumentation
 */
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { executableMetadata } from '../trusted-executable';
import { VendorNetwork, type Fetch } from './network';
import { claudeFingerprint } from './releases';
import { SetupError } from './types';
const fixtureSchema = z.object({ files: z.record(z.string().refine(isAbsolute)), claudeFingerprint: z.string().regex(/^[A-F0-9]{40}$/).optional(), loginInterpreters: z.array(z.string().refine(isAbsolute)).max(4).optional() }).strict();
export async function setupNetwork(isPackaged: boolean, env = process.env) {
  if (isPackaged || env.VSTUDY_AI_CLI_TEST !== '1' || !env.VSTUDY_AI_CLI_FIXTURE_FILE) return { network: new VendorNetwork(), fingerprint: claudeFingerprint, loginInterpreters: [] as string[] };
  const path = env.VSTUDY_AI_CLI_FIXTURE_FILE;
  if (!isAbsolute(path)) throw new SetupError('blocked');
  const load = async () => {
    if ((await stat(path)).size > 2_000_000) throw new SetupError('blocked');
    return fixtureSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  };
  const initial = await load();
  const loginInterpreters = await Promise.all((initial.loginInterpreters ?? []).map(async path => (await executableMetadata(path)).path));
  const request: Fetch = async (input, init) => {
    const fixture = await load(), file = fixture.files[String(input)];
    if (!file) return new Response(null, { status: 404 });
    const info = await stat(file);
    if (!info.isFile() || info.size > 600_000_000) throw new SetupError('blocked');
    const stream = createReadStream(file, init?.signal ? { signal: init.signal } : {});
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: 200, headers: { 'content-length': String(info.size) } });
  };
  return { network: new VendorNetwork(request), fingerprint: initial.claudeFingerprint ?? claudeFingerprint, loginInterpreters };
}
