import { URL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error(`Dependency must be exactly pinned: ${name}`);
}
const lock = readFileSync(new URL('../../../pnpm-lock.yaml', import.meta.url), 'utf8');
if (/git\+|git:\/\/|github:|version:\s*latest\b/.test(lock)) throw new Error('Unapproved floating or git resolution');
const result = spawnSync('pnpm', ['audit', '--json'], { encoding: 'utf8' });
const report = JSON.parse(result.stdout);
const accepted = JSON.parse(readFileSync(new URL('../../../docs/security-audit.json', import.meta.url), 'utf8'));
if (!report.metadata || result.status > 1) throw new Error('Audit unavailable');
const unknown = Object.keys(report.advisories ?? {}).filter(id => !accepted.advisories?.[id]);
console.log(JSON.stringify({ vulnerabilities: report.metadata.vulnerabilities, unreviewed: unknown }));
if (unknown.length) process.exitCode = 1;
