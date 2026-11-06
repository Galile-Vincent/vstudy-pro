/** Materialize Apple API keys only for the signing call, with private permissions and deterministic cleanup. */
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withAppleApiKey(env, action) {
  const original = env.APPLE_API_KEY;
  if (!original || existsSync(original)) return action();
  const contents = original.includes('-----BEGIN PRIVATE KEY-----') ? original : Buffer.from(original, 'base64').toString('utf8');
  if (!/^-----BEGIN PRIVATE KEY-----\r?\n[\s\S]+\r?\n-----END PRIVATE KEY-----\s*$/.test(contents)) {
    throw new Error('APPLE_API_KEY must be a PEM private key, a base64 PEM key, or an existing key-file path');
  }
  const directory = await mkdtemp(join(tmpdir(), 'vstudy-notary-key-'));
  try {
    env.APPLE_API_KEY = join(directory, 'AuthKey.p8');
    await writeFile(env.APPLE_API_KEY, contents, { mode: 0o600 });
    return await action();
  } finally {
    env.APPLE_API_KEY = original;
    await rm(directory, { recursive: true, force: true });
  }
}
