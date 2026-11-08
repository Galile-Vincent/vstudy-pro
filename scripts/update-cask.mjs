import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function updateCask(source, version, sums) {
  version = version.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:[.-][\w.-]+)?$/.test(version)) throw new Error('Invalid version');
  const file = `VStudy-Pro-${version}-mac-arm64.dmg`;
  const entries = sums.split(/\r?\n/).filter(line => line.trim().split(/\s+/)[1]?.replace(/^\*/, '') === file);
  if (entries.length !== 1 || !/^[a-f0-9]{64}\s/i.test(entries[0])) throw new Error('Missing or invalid checksum');
  return source.replace(/^  version ".*"$/m, `  version "${version}"`)
    .replace(/^  sha256 ".*"$/m, `  sha256 "${entries[0].split(/\s+/)[0].toLowerCase()}"`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2];
  if (!version || !/^v?\d+\.\d+\.\d+(?:[.-][\w.-]+)?$/.test(version)) throw new Error('Usage: node scripts/update-cask.mjs VERSION [SHA256SUMS fixture]');
  let sums;
  if (process.argv[3]) sums = await readFile(process.argv[3], 'utf8');
  else {
    const response = await fetch(`https://github.com/ava-apple/vstudy-pro/releases/download/v${version.replace(/^v/, '')}/SHA256SUMS.txt`);
    if (!response.ok) throw new Error(`Checksum download failed: ${response.status}`);
    sums = await response.text();
  }
  const cask = new URL('../packaging/homebrew/Casks/vstudy-pro.rb', import.meta.url);
  await writeFile(cask, updateCask(await readFile(cask, 'utf8'), version, sums));
  console.log(`Updated cask to ${version}`);
}
