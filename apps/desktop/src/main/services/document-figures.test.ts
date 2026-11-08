import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { publishFigureAssets, pruneFigureAssets, preserveFigureLinks } from './document-figures';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'document-figures-'));
  roots.push(root);
  const staging = join(root, 'staging'), library = join(root, 'library');
  await mkdir(staging); await mkdir(library);
  const bytes = Buffer.from('figure content');
  const name = `image-${createHash('sha256').update(bytes).digest('hex')}.png`;
  await writeFile(join(staging, name), bytes);
  return { staging, library, markdown: join(library, 'content.md'), bytes, name };
}
it('publishes contained hash assets idempotently and removes obsolete images', async () => {
  const f = await fixture();
  const first = await publishFigureAssets(f.staging, f.markdown);
  expect(await publishFigureAssets(f.staging, f.markdown)).toEqual(first);
  expect(await readFile(join(f.library, f.name))).toEqual(f.bytes);
  const old = `image-${'a'.repeat(64)}.png`;
  await writeFile(join(f.library, old), 'old');
  await pruneFigureAssets(f.markdown, first);
  expect(await readdir(f.library)).toEqual([f.name]);
  await rm(f.library, { recursive: true });
  await expect(readFile(join(f.library, f.name))).rejects.toThrow();
});
it('keeps images referenced by the AI markdown version', async () => {
  const f = await fixture();
  await publishFigureAssets(f.staging, f.markdown);
  await writeFile(join(f.library, 'content.ai.md'), `![figure](${f.name})`);
  await pruneFigureAssets(f.markdown, new Set());
  expect(await readFile(join(f.library, f.name))).toEqual(f.bytes);
});
it('rejects a symlink and a forged hash before publishing', async () => {
  const f = await fixture();
  await writeFile(join(f.staging, f.name), 'changed');
  await expect(publishFigureAssets(f.staging, f.markdown)).rejects.toThrow('Invalid figure content');
  await rm(join(f.staging, f.name));
  await writeFile(join(f.library, f.name), f.bytes);
  await symlink(join(f.library, f.name), join(f.staging, f.name));
  await expect(publishFigureAssets(f.staging, f.markdown)).rejects.toThrow('Symlink');
});

it('preserves each original figure once when AI conversion omits it', () => {
  const name = `image-${'b'.repeat(64)}.png`;
  const original = `Text\n\n![Page 2 figure](${name})`;
  const converted = preserveFigureLinks(original, 'Improved text');
  expect(converted).toContain(`![Page 2 figure](${name})`);
  expect(preserveFigureLinks(original, converted)).toBe(converted);
  expect(preserveFigureLinks(original, `![Renamed](${name})`)).toBe(`![Renamed](${name})`);
});
