import { URL, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pnpmInvocation } from './platform.mjs';
export function reviewAudit(report, accepted, now = new Date()) {
  const failures = [];
  for (const [id, entry] of Object.entries(accepted)) {
    if (!entry || typeof entry.reason !== 'string' || !entry.reason.trim() ||
        typeof entry.package !== 'string' || !entry.package || typeof entry.version !== 'string' || !entry.version ||
        !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires) || !Number.isFinite(Date.parse(entry.expires)) ||
        new Date(entry.expires).toISOString().slice(0, 10) !== entry.expires) failures.push(`${id}: invalid exception`);
    else if (now >= new Date(entry.expires)) failures.push(`${id}: expired exception`);
  }
  for (const [id, advisory] of Object.entries(report.advisories ?? {})) {
    const entry = accepted[id];
    if (!entry) { failures.push(`${id}: unreviewed advisory`); continue; }
    const versions = entry.version?.split(',');
    if (entry.package !== advisory.module_name || !advisory.findings?.length ||
        advisory.findings.some(finding => !versions?.includes(finding.version))) failures.push(`${id}: package/version drift`);
  }
  return failures;
}

function main() {
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
  if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) throw new Error(`Dependency must be exactly pinned: ${name}`);
}
const lock = readFileSync(new URL('../../../pnpm-lock.yaml', import.meta.url), 'utf8');
if (/git\+|git:\/\/|github:|version:\s*latest\b/.test(lock)) throw new Error('Unapproved floating or git resolution');
const command = pnpmInvocation(['audit', '--json']);
const result = spawnSync(command.command, command.args, { encoding: 'utf8', windowsHide: true });
if (result.error || !result.stdout) throw new Error('Audit could not start');
const report = JSON.parse(result.stdout);
const accepted = JSON.parse(readFileSync(new URL('../../../docs/security-audit.json', import.meta.url), 'utf8'));
if (!report.metadata || result.status > 1) throw new Error('Audit unavailable');
const failures = reviewAudit(report, accepted);
console.log(JSON.stringify({ vulnerabilities: report.metadata.vulnerabilities, failures }));
if (failures.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
