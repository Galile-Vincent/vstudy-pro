/** Builds validated, visually checked brand derivatives from owner-supplied vector originals. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';
import { optimize } from 'svgo';

const root = fileURLToPath(new URL('../', import.meta.url));
const originals = join(root, 'assets/brand/originals');
const generated = join(root, 'assets/brand/generated');
const build = join(root, 'apps/desktop/build');
const web = join(root, 'apps/website/public');
const report = [];
for (const dir of [generated, build, join(web, 'brand')]) await mkdir(dir, { recursive: true });
const vectors = new Map();
for (const name of (await readdir(originals)).filter(name => name.endsWith('.svg')).sort()) {
  const source = await readFile(join(originals, name), 'utf8');
  assert.ok(source.length < 100_000, `${name} size`);
  assert.ok(!/<(?:script|image|foreignObject|iframe|animate|set)\b|\bon\w+\s*=|<!ENTITY|<!DOCTYPE|<\?xml-stylesheet|@import/i.test(source), `${name} unsafe content`);
  for (const ref of source.matchAll(/(?:href\s*=\s*["']([^"']+)|url\(\s*["']?([^)'"\s]+))/gi)) {
    assert.ok((ref[1] ?? ref[2]).startsWith('#'), `${name} external reference`);
  }
  const svg = optimize(source, { multipass: true, plugins: [{ name: 'preset-default', params: { overrides: { convertPathData: false } } }] }).data;
  const raw = async input => sharp(Buffer.from(input)).ensureAlpha().raw().toBuffer();
  const before = await raw(source), after = await raw(svg);
  assert.equal(before.length, after.length);
  const meanError = before.reduce((sum, value, i) => sum + Math.abs(value - after[i]), 0) / before.length;
  assert.ok(meanError < 0.2, `${name} render changed by ${meanError}`);
  await writeFile(join(generated, name), svg);
  vectors.set(name, svg);
  report.push({ name, originalBytes: source.length, optimizedBytes: svg.length, meanChannelError: meanError });
}
const get = name => vectors.get(`VStudyPro-${name}.svg`);
// The owner lockup has generous export padding. Tight viewBoxes keep the wordmark legible at nav size.
for (const [name, art, viewBox, width, height] of [
  ['symbol', 'Symbol', '32 59 226 178', 226, 178],
  ['lockup-light', 'Lockup', '53 67 926 193', 926, 193],
  ['lockup-dark', 'Lockup-ForDark', '53 67 926 193', 926, 193],
]) {
  const svg = get(art).replace(/viewBox="[^"]+"/, `viewBox="${viewBox}"`).replace(/width="\d+" height="\d+"/, `width="${width}" height="${height}"`);
  await writeFile(join(generated, `${name}.svg`), svg);
  await writeFile(join(web, 'brand', `${name}.svg`), svg);
}
const iconArt = get('AppIcon-Light');
const icon = await sharp(Buffer.from(iconArt)).resize(1024).png().toBuffer();
await writeFile(join(build, 'icon.png'), icon);
// The 824px body sits at (100,100) inside the transparent macOS icon template.
const body = await sharp(Buffer.from(iconArt)).resize(824, 824).png().toBuffer();
// Blur on a full-size canvas prevents clipping at the bottom edge of the body.
const silhouette = await sharp({create:{width:1024,height:1024,channels:4,background:'#0000'}}).composite([{input:body,left:100,top:112}]).ensureAlpha().extractChannel('alpha').png().toBuffer();
const softShadow = await sharp({create:{width:1024,height:1024,channels:3,background:'#000'}}).joinChannel(await sharp(silhouette).blur(12).linear(.22).toBuffer()).png().toBuffer();
const mac = await sharp({create:{width:1024,height:1024,channels:4,background:'#0000'}}).composite([{input:softShadow},{input:body,left:100,top:100}]).png().toBuffer();
await writeFile(join(build, 'icon-mac.png'), mac);
const iconset = join(build, 'icon.iconset');
await mkdir(iconset, { recursive: true });
for (const size of [16, 32, 128, 256, 512]) for (const scale of [1, 2]) {
  await sharp(mac).resize(size * scale).png().toFile(join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`));
}
if (process.platform === 'darwin') execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(build, 'icon.icns')]);
await rm(iconset, {recursive:true, force:true});
async function ico(input, sizes, path) {
  const images = await Promise.all(sizes.map(size => sharp(input).resize(size,size,{fit:'contain',background:'#0000'}).png().toBuffer()));
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const entry = 6 + i * 16;
    header[entry] = header[entry + 1] = sizes[i] % 256;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await writeFile(path, Buffer.concat([header, ...images]));
}
await ico(icon, [16,24,32,48,64,128,256], join(build, 'icon.ico'));
for (const size of [16,24,32,48,64,128,256,512,1024]) {
  await mkdir(join(build, 'icons'), {recursive:true});
  await sharp(icon).resize(size).png().toFile(join(build, 'icons', `${size}x${size}.png`));
}
await copyFile(join(generated, 'symbol.svg'), join(web, 'favicon.svg'));
await ico(Buffer.from(await readFile(join(generated, 'symbol.svg'))), [16,32,48], join(web, 'favicon.ico'));
await sharp(icon).resize(180).png().toFile(join(web, 'apple-touch-icon.png'));
for (const size of [192,512]) await sharp(icon).resize(size).png().toFile(join(web, `icon-${size}.png`));
await sharp({create:{width:1200,height:630,channels:4,background:'#f6f5fd'}}).composite([{input:await sharp(Buffer.from(await readFile(join(generated,'lockup-light.svg')))).resize(850).png().toBuffer(),left:175,top:226}]).png().toFile(join(web,'og.png'));
await sharp({create:{width:660,height:400,channels:4,background:'#f6f5fd'}}).composite([{input:await sharp(Buffer.from(await readFile(join(generated,'lockup-light.svg')))).resize(300).png().toBuffer(),left:180,top:34}]).png().toFile(join(build,'dmg-background.png'));
await writeFile(join(generated, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Validated and compared ${report.length} vectors. Generated platform icons and web branding.`);
