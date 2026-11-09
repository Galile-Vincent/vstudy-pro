/** Audit generated HTML links, media dimensions, locale routes, and the home asset budget. */
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, extname } from 'node:path';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const base = (process.env.BASE_PATH ?? '/').replace(/\/$/, '');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(dir, entry.name)) : join(dir, entry.name)))).flat();
}
const htmlFiles = (await files(root)).filter(file => extname(file) === '.html');
const redirect = join(root,'download/index.html');
const redirectHtml = await readFile(redirect,'utf8');
assert.match(redirectHtml, /http-equiv="refresh"/i);
assert.ok(redirectHtml.includes(`url=${base}/en/download/`), 'download redirect must target the English download page');
let mediaPages = 0;
let links = 0;
let largestHome = 0;
let largestHomeImages = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  if (file === redirect) continue;
  if (/\/(en|zh-Hant|ja)\/media\/index.html$/.test(file)) {
    const encoded = html.match(/data-config="([^"]+)"/)?.[1];
    assert.ok(encoded, `${file}: missing media config`);
    const config = JSON.parse(encoded.replace(/&#(\d+);/g, (_,n) => String.fromCodePoint(Number(n))).replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    const url = new URL(config.url);
    assert.equal(config.displayUrl, `${new URL(process.env.SITE_URL ?? 'https://vstudy.vcstudio.app').host}${base}/download`);
    assert.ok(html.includes(`data-copy="${config.url}"`), 'Copy link must use localized URL');
    const language = file.match(/\/(en|zh-Hant|ja)\/media\//)[1];
    assert.equal(url.pathname, `${base}/${language}/download/`);
    assert.equal(url.origin, new URL(process.env.SITE_URL ?? 'https://vstudy.vcstudio.app').origin);
    assert.ok((await stat(join(root,url.pathname.slice(base.length),'index.html'))).isFile(), config.url);
    mediaPages++;
  }
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, file);
  assert.match(html, /<html lang="(en|zh-Hant|ja)"/, file);
  assert.match(html, /href="#main"/, file);
  for (const image of html.matchAll(/<img\s[^>]+>/g)) {
    assert.match(image[0], /width="\d+"/, file);
    assert.match(image[0], /height="\d+"/, file);
    assert.match(image[0], /alt="[^"]+"/, file);
  }
  const assets = new Set();
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1];
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    assert.ok(href.startsWith(base + '/') || href === base, href);
    const [pathname, hash] = href.slice(base.length).split('#');
    const target = join(root, pathname.endsWith('/') ? pathname + 'index.html' : pathname);
    assert.ok((await stat(target)).isFile(), `${file}: ${href}`);
    links++;
    if (hash && target.endsWith('.html')) {
      assert.ok((await readFile(target,'utf8')).includes(`id="${decodeURIComponent(hash)}"`), href);
    }
    if (/\.(css|js|webp|png|svg)$/.test(target)) assets.add(target);
  }
  if (dirname(file) === root.replace(/\/$/,'') || /\/(en|zh-Hant|ja)\/index.html$/.test(file)) {
    const imagePaths = new Set([...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(match => join(root,match[1].slice(base.length))));
    const imageBytes = (await Promise.all([...imagePaths].map(async image => (await stat(image)).size))).reduce((a,b) => a+b,0);
    assert.ok(imageBytes < 400_000, `Home images exceed 400 KB: ${imageBytes}`);
    largestHomeImages = Math.max(largestHomeImages,imageBytes);
    const bytes = Buffer.byteLength(html) + (await Promise.all([...assets].map(async asset => (await stat(asset)).size))).reduce((a,b) => a+b,0);
    assert.ok(bytes < 1_500_000, `Home budget exceeded: ${bytes}`);
    largestHome = Math.max(largestHome,bytes);
  }
}
assert.equal(mediaPages,3);
console.log(JSON.stringify({pages:htmlFiles.length,checkedLinks:links,largestHomeBytes:largestHome,largestHomeImageBytes:largestHomeImages,imageBudgetBytes:400_000,budgetBytes:1_500_000,failures:0},null,2));
