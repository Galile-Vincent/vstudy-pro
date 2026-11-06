/** Install, launch, and uninstall NSIS under a non-administrator token on a disposable hosted Windows runner. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { assetNames, targetFor } from './release-contract.mjs';

const { values } = parseArgs({ options: {
  target: { type: 'string' }, output: { type: 'string' }, 'user-token': { type: 'boolean', default: false },
} });
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw new Error('Installer smoke requires a disposable GitHub-hosted Windows runner');
}
const target = targetFor(values.target);
if (target.platform !== 'win' || target.arch !== process.arch) throw new Error('Installer smoke requires a native Windows target');
const output = resolve(values.output ?? join('release', 'smoke', target.key));
await mkdir(output, { recursive: true });
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const query = command => execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 30000 }).trim();
const administrator = query('([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)') === 'True';
if (administrator && !values['user-token']) {
  const stdout = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File',
    fileURLToPath(new URL('windows-user-process.ps1', import.meta.url)), '-Executable', process.execPath,
    '-Script', fileURLToPath(import.meta.url), '-Target', target.key, '-Output', output], { encoding: 'utf8', timeout: 630000 });
  await writeFile(join(output, 'restricted-launch.log'), stdout);
  process.exit(0);
}
if (administrator) throw new Error('Installer smoke refused an enabled administrator token');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const installer = resolve('release', target.key, assetNames(target, version).installer);
const installDirectory = join(process.env.LOCALAPPDATA, 'Programs', 'VStudy Pro');
const executable = join(installDirectory, 'VStudy Pro.exe');
const uninstaller = join(installDirectory, 'Uninstall VStudy Pro.exe');
const shortcut = join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'VStudy Pro.lnk');
if (existsSync(installDirectory) || existsSync(shortcut)) throw new Error('Installer smoke requires no previous VStudy installation');
const report = { schemaVersion: 1, target: target.key, administrator, installDirectory, ok: false, installed: false, launched: false, uninstalled: false, startMenu: false,
  protocolRegistered: false, mcpStartup: {disabled: false, enabled: false} };
async function run(exe, args, name, timeout = 180000) {
  try {
    const stdout = execFileSync(exe, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 1024 * 1024 });
    await writeFile(join(output, `${name}.log`), stdout ?? '');
  } catch (error) {
    await writeFile(join(output, `${name}.stderr.log`), error.stderr ?? error.message);
    throw new Error(`${name} failed: ${error.message}`, { cause: error });
  }
}
let failure;
try {
  await run(installer, ['/S', '/currentuser'], 'install');
  await access(executable);
  await access(uninstaller);
  await access(shortcut);
  const protocol = query("$key=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Classes\\vstudymoodle\\shell\\open\\command'); if($null -eq $key){throw 'Protocol missing'}; try{[Console]::Out.Write($key.GetValue(''))}finally{$key.Dispose()}");
  const registered = /^"([^"]+)"\s+(.+)$/.exec(protocol);
  if (!registered || registered[1].toLowerCase() !== executable.toLowerCase() || !registered[2].includes('%1')) throw new Error('Per-user sign-in protocol does not point to the installed executable');
  report.protocolRegistered = true;
  report.installed = true;
  report.startMenu = true;
  await run(process.execPath, [fileURLToPath(new URL('distribution-smoke.mjs', import.meta.url)), '--target', target.key,
    '--executable', executable, '--output', output], 'installed-app', 120000);
  report.launched = true;
  report.mcpStartup.disabled = true;
  await run(process.execPath, [fileURLToPath(new URL('distribution-smoke.mjs', import.meta.url)), '--target', target.key,
    '--executable', executable, '--output', join(output, 'mcp-enabled'), '--mcp-enabled'], 'installed-app-mcp-enabled', 120000);
  report.mcpStartup.enabled = true;
} catch (error) { failure = error; }
try {
  if (existsSync(uninstaller)) await run(uninstaller, ['/S', '/currentuser'], 'uninstall');
  const deadline = Date.now() + 30000;
  while ((existsSync(executable) || existsSync(shortcut)) && Date.now() < deadline) await setTimeout(200);
  if (existsSync(executable) || existsSync(shortcut)) throw new Error('Uninstall left the application executable or Start menu shortcut');
  report.uninstalled = report.installed;
  report.ok = report.installed && report.launched && report.startMenu && report.uninstalled && report.protocolRegistered && report.mcpStartup.disabled && report.mcpStartup.enabled;
  if (report.uninstalled) await rm(installDirectory, { recursive: true, force: true });
} catch (error) { failure ??= error; }
if (failure) report.error = String(failure);
await writeFile(join(output, 'installer-smoke.json'), JSON.stringify(report, null, 2) + '\n');
if (failure) throw failure;
