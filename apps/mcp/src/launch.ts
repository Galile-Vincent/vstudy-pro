/** Resolve installed desktop launchers and use native argv without interpreting registry commands. @packageDocumentation */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, lstatSync } from 'node:fs';
import { win32 } from 'node:path';
import { BridgeError } from './errors';

export interface LaunchOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  query?: (executable: string, args: string[]) => string;
  isFile?: (path: string) => boolean;
  run?: (executable: string, args: string[], detached: boolean) => Promise<void>;
}
const unavailable = () => new BridgeError('DISCONNECTED', 'Install or open VStudy Pro and enable Settings > Agents.');

export function registryAppPaths(text: string, environment: NodeJS.ProcessEnv): string[] {
  const paths: string[] = [];
  for (const record of text.split(/(?=^HKEY_)/m)) {
    const values: Record<string, string> = {};
    for (const line of record.split(/\r?\n/)) {
      const match = line.match(/^\s+(DisplayName|InstallLocation|DisplayIcon)\s+REG_(?:EXPAND_)?SZ\s+(.+)$/);
      if (match) values[match[1]!] = match[2]!.trim();
    }
    if (values.DisplayName !== 'VStudy Pro') continue;
    if (values.InstallLocation) paths.push(win32.join(values.InstallLocation.replace(/^"|"$/g, ''), 'VStudy Pro.exe'));
    const icon = values.DisplayIcon?.match(/^"([^"]+\.exe)"(?:,-?\d+)?$|^(.+\.exe)(?:,-?\d+)?$/i);
    if (icon) paths.push(icon[1] ?? icon[2]!);
  }
  return paths.map(path => path.replace(/%([^%]+)%/g, (_, name: string) => environment[name] ?? `%${name}%`));
}

export function resolveWindowsApp(options: LaunchOptions = {}): string | undefined {
  const environment = options.environment ?? process.env;
  const system = environment.SystemRoot ?? String.raw`C:\Windows`;
  if (!win32.isAbsolute(system) || !/^[a-z]:/i.test(system)) throw unavailable();
  const registry = win32.join(system, 'System32', 'reg.exe');
  const query = options.query ?? ((executable, args) => execFileSync(executable, args, { encoding: 'utf8', timeout: 2000, maxBuffer: 2 * 1024 * 1024, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
  const isFile = options.isFile ?? (path => existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  const installed = (paths: string[]) => paths.find(path => win32.isAbsolute(path) && /^[a-z]:/i.test(path)
    && ![...path].some(character => character.charCodeAt(0) < 32)
    && win32.basename(path).toLowerCase() === 'vstudy pro.exe' && isFile(path));
  const fromRegistry = (key: string) => {
    try { return installed(registryAppPaths(query(registry, ['query', key, '/s']), environment)); }
    catch { return undefined; }
  };
  const currentUser = fromRegistry(String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`);
  if (currentUser) return currentUser;
  const standard = environment.LOCALAPPDATA && installed([win32.join(environment.LOCALAPPDATA, 'Programs', 'VStudy Pro', 'VStudy Pro.exe')]);
  if (standard) return standard;
  return fromRegistry(String.raw`HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall`)
    ?? fromRegistry(String.raw`HKLM\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`);

}

function run(executable: string, args: string[], detached: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!detached) {
      execFile(executable, args, { timeout: 5000, windowsHide: true }, error => error ? reject(unavailable()) : resolve());
      return;
    }
    const environment = { ...process.env };
    delete environment.ELECTRON_RUN_AS_NODE; delete environment.NODE_OPTIONS; delete environment.NODE_PATH;
    const child = spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: true, shell: false, env: environment });
    child.once('error', () => reject(unavailable()));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export async function launchApplication(options: LaunchOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const execute = options.run ?? run;
  if (platform === 'darwin') return execute('/usr/bin/open', ['-g', '-j', '-a', 'VStudy Pro', '--args', '--mcp-background'], false);
  if (platform !== 'win32') throw unavailable();
  const executable = resolveWindowsApp(options);
  if (!executable) throw unavailable();
  return execute(executable, ['--mcp-background'], true);
}
