/** Check local Markdown destinations in the three user guides and documentation index. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = ['README.md', 'README.zh-Hant.md', 'README.ja.md', 'docs/README.md', ...['INSTALL', 'GUIDE'].flatMap(name => ['', '.zh-Hant', '.ja'].map(locale => `docs/${name}${locale}.md`))];
const errors = [];
let checked = 0;
for (const file of files) {
  const source = readFileSync(resolve(root, file), 'utf8').replace(/```[^\n]*\n[\s\S]*?```/g, '');
  const references = new Map([...source.matchAll(/^\s*\[([^\]]+)\]:\s*(\S+)/gm)].map(match => [match[1].toLowerCase(), match[2]]));
  const links = [...source.matchAll(/!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)/g)].map(match => match[1]);
  for (const match of source.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const key = (match[2] || match[1]).toLowerCase();
    if (!references.has(key)) errors.push(`${file}: missing reference ${key}`);
    else links.push(references.get(key));
  }
  for (const raw of links) {
    const destination = raw.replace(/^<|>$/g, '');
    if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(destination)) continue;
    const [path, fragment] = destination.split('#');
    const target = path ? resolve(dirname(resolve(root, file)), decodeURIComponent(path.split('?')[0])) : resolve(root, file);
    checked++;
    if (!existsSync(target)) {
      errors.push(`${file}: missing ${destination}`);
      continue;
    }
    if (fragment && /\.md$/i.test(target)) {
      const counts = new Map();
      const anchors = [...readFileSync(target, 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => {
        const slug = match[1].toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/ /g, '-');
        const count = counts.get(slug) || 0;
        counts.set(slug, count + 1);
        return count ? `${slug}-${count}` : slug;
      });
      if (!anchors.includes(decodeURIComponent(fragment))) errors.push(`${file}: missing anchor ${destination}`);
    }
    if (/docs\/assets\/readme\/.*\.(png|webp)$/i.test(target) && statSync(target).size >= 400_000) errors.push(`${file}: oversized image ${destination}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Checked ${checked} local Markdown links across ${files.length} files.`);
