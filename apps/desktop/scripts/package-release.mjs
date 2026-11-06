/** Package a native target with explicit signing and publishing policy. Never publishes from electron-builder. */
import { build, Platform, Arch } from 'electron-builder';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { targetFor, signingMode, signingConfiguration, unsignedEnvironment, packagedExecutable } from './release-contract.mjs';
import { withAppleApiKey } from './signing-key.mjs';

const { values } = parseArgs({ options: {
  target: { type: 'string', default: `${process.platform === 'darwin' ? 'mac' : 'win'}-${process.arch}` },
  unsigned: { type: 'boolean', default: false },
  'require-signing': { type: 'boolean', default: false },
} });
const target = targetFor(values.target);
if (process.platform !== (target.platform === 'mac' ? 'darwin' : 'win32') || process.arch !== target.arch) {
  throw new Error(`Package ${target.key} on a matching native host, found ${process.platform}-${process.arch}`);
}
if (values.unsigned) {
  const clean = unsignedEnvironment(process.env);
  for (const key of Object.keys(process.env)) if (!(key in clean)) delete process.env[key];
  Object.assign(process.env, clean);
}
const mode = signingMode(target.platform, process.env);
if (values['require-signing'] && mode === 'unsigned') throw new Error('Signing credentials are required by package:signed');
process.env.CSC_IDENTITY_AUTO_DISCOVERY = mode === 'unsigned' ? 'false' : 'true';
process.env.CSC_FOR_PULL_REQUEST = 'false';
if (mode === 'apple-api') {
  for (const name of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) delete process.env[name];
}
const output = resolve('release', target.key);
await mkdir(output, { recursive: true });
const platform = target.platform === 'mac' ? Platform.MAC : Platform.WINDOWS;
const signing = signingConfiguration(target.platform, mode, process.env);
const repository = process.env.GITHUB_REPOSITORY ?? 'ava-apple/vstudy-pro';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release repository');
if (target.platform === 'win') {
  const { default: sharp } = await import('sharp');
  const icon = join(output, 'icon.png');
  await sharp('build/icon.svg').resize(256, 256).png().toFile(icon);
  signing.win.icon = icon;
}
const packageApplication = () => build({
  targets: platform.createTarget(target.platform === 'mac' ? ['dmg', 'zip'] : ['nsis', 'zip'], Arch[target.arch]),
  publish: 'never',
  config: {
    ...signing,
    directories: { output },
    publish: { provider: 'generic', url: `https://github.com/${repository}/releases/latest/download` },
  },
});
if (mode === 'apple-api') await withAppleApiKey(process.env, packageApplication);
else await packageApplication();
const executable = packagedExecutable(target, output);
if (target.platform === 'mac') {
  const bundle = join(output, target.app);
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' });
  if (mode !== 'unsigned') {
    execFileSync('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=2', bundle], { stdio: 'inherit' });
    execFileSync('/usr/bin/xcrun', ['stapler', 'validate', bundle], { stdio: 'inherit' });
  }
} else if (mode !== 'unsigned') {
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$files = @($env:VSTUDY_SIGNED_EXE) + (Get-ChildItem -LiteralPath $env:VSTUDY_SIGNED_OUTPUT -Filter *.exe).FullName; foreach ($file in $files) { $s = Get-AuthenticodeSignature -LiteralPath $file; if ($s.Status -ne "Valid") { throw "Invalid Authenticode signature on $file" } }'],
  { stdio: 'inherit', env: { ...process.env, VSTUDY_SIGNED_EXE: executable, VSTUDY_SIGNED_OUTPUT: output } });
}
await writeFile(join(output, 'signing.json'), JSON.stringify({ schemaVersion: 1, target: target.key, mode, signed: mode !== 'unsigned', notarized: target.platform === 'mac' && mode !== 'unsigned' }, null, 2) + '\n');
console.log(`Packaged ${target.key}, signing mode ${mode}`);
