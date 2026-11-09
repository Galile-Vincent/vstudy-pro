import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const website = fileURLToPath(new URL('../', import.meta.url));
export const screenshots = ['courses-home', 'capture-to-chat', 'library', 'document-figures'];
export async function makeMediaKit(output = resolve(website, 'public/brand/kit')) {
  await mkdir(output, { recursive: true });
  for (const name of ['symbol', 'lockup-light', 'lockup-dark']) {
    const svg = await readFile(resolve(website, `public/brand/${name}.svg`));
    await writeFile(resolve(output, `${name}.svg`), svg);
    await sharp(svg).resize({ width: name === 'symbol' ? 1024 : 1852 }).png().toFile(resolve(output, `${name}.png`));
  }
  for (const name of screenshots) {
    await sharp(resolve(website, `src/assets/shots/${name}-vstudy-light.webp`)).png().toFile(resolve(output, `${name}.png`));
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await makeMediaKit();
