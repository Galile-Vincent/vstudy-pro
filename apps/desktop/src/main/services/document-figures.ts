import { createHash } from 'node:crypto';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { containedPath } from './file-paths';
import { atomicWrite } from '../storage/atomic';

const figureName = /^image-[a-f0-9]{64}\.png$/;
const maxImageBytes = 8 * 1024 * 1024;
const maxAssetBytes = 64 * 1024 * 1024;

export async function publishFigureAssets(staging: string, markdownPath: string): Promise<Set<string>> {
  const directory = dirname(markdownPath);
  const names = new Set<string>();
  let total = 0;
  for (const name of await readdir(staging)) {
    if (!figureName.test(name)) throw new Error('Invalid figure name');
    const source = containedPath(staging, join(staging, name));
    const size = (await stat(source)).size;
    total += size;
    if (size > maxImageBytes || total > maxAssetBytes) throw new Error('Document images exceed size limit');
    const bytes = await readFile(source);
    if (bytes.length !== size || `image-${createHash('sha256').update(bytes).digest('hex')}.png` !== name) throw new Error('Invalid figure content');
    const target = join(containedPath(dirname(directory), directory), name);
    await atomicWrite(target, bytes);
    containedPath(directory, target);
    names.add(name);
  }
  return names;
}

export async function pruneFigureAssets(markdownPath: string, names: ReadonlySet<string>): Promise<void> {
  const directory = dirname(markdownPath);
  const aiMarkdown = await readFile(join(directory, 'content.ai.md'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  for (const name of await readdir(directory)) {
    if (figureName.test(name) && !names.has(name) && !aiMarkdown.includes(name)) {
      await rm(containedPath(directory, join(directory, name)));
    }
  }
}

export function preserveFigureLinks(original: string, converted: string): string {
  const figures = original.match(/!\[[^\]\n]*\]\(image-[a-f0-9]{64}\.png\)/g) ?? [];
  const missing = [...new Set(figures)].filter(figure => !converted.includes(figure.slice(figure.indexOf('](') + 2, -1)));
  return missing.length ? `${converted.trimEnd()}\n\n${missing.join('\n\n')}` : converted;
}
