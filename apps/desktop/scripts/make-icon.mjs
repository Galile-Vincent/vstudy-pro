/**
 * Renders build/icon.svg into build/icon.icns (macOS app icon).
 * Run `pnpm --filter @vstudy/desktop icon` after editing the SVG; the .icns is committed.
 * Needs macOS `iconutil` and the `sharp` package.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const build = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
const set = join(build, 'icon.iconset');
rmSync(set, { recursive: true, force: true });
mkdirSync(set);
const svg = readFileSync(join(build, 'icon.svg'));
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2]) {
    const px = size * scale;
    const name = scale === 1 ? `icon_${size}x${size}.png` : `icon_${size}x${size}@2x.png`;
    await sharp(svg, { density: 384 }).resize(px, px).png().toFile(join(set, name));
  }
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', join(build, 'icon.icns')]);
rmSync(set, { recursive: true, force: true });
