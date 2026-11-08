import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const bundle = process.argv[2];
if (!bundle) throw new Error('Usage: node scripts/check-app-name.mjs /path/to/VStudy Pro.app');
function check(app, expected) {
  const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], { encoding: 'utf8' }));
  for (const key of ['CFBundleName', 'CFBundleDisplayName', 'CFBundleExecutable']) {
    assert.equal(plist[key], expected, `${app}: ${key}`);
    assert.doesNotMatch(plist[key], /electron/i);
  }
  console.log(`PASS ${expected}: bundle name, display name, executable`);
}
check(bundle, 'VStudy Pro');
const frameworks = join(bundle, 'Contents/Frameworks');
for (const file of readdirSync(frameworks)) {
  if (file.endsWith('.app')) check(join(frameworks, file), file.slice(0, -4));
}
