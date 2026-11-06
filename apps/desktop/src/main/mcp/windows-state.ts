/** Persist MCP state only through a current-SID ACL check and atomic flushed replacement. @packageDocumentation */
import { app } from 'electron';
import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join, resolve, win32 } from 'node:path';
import { TextDecoder } from 'node:util';
import { systemExecutable } from '../platform/process';
import { cliEnvironment } from '../providers/cli-transport';

const maximum = 8 * 1024 * 1024;
interface StateExecution {
  encoding: 'utf8'; input?: string; env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number;
  windowsHide: boolean; shell: false; stdio: ['pipe', 'pipe', 'pipe'];
}
interface WindowsStateOptions {
  platform?: NodeJS.Platform;
  script?: string;
  present?: (path: string) => boolean;
  execute?: (executable: string, args: string[], options: StateExecution) => string;
}

class WindowsStateError extends Error {
  readonly code = 'DENIED';
  constructor() { super('Windows MCP state permissions or atomic storage could not be verified.'); }
}

function statePresent(path: string): boolean {
  try {
    const file = lstatSync(path);
    if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || file.size > maximum) throw new WindowsStateError();
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw new WindowsStateError();
  }
}

/** Matches the synchronous persistence interface; authorization and JSON schema checks stay in the shared engine. */
export function createWindowsStatePersistence(options: WindowsStateOptions = {}) {
  const check = (userData: string) => {
    if ((options.platform ?? process.platform) !== 'win32' || !win32.isAbsolute(userData) ||
        !/^[a-z]:\\/i.test(userData) || userData.slice(2).includes(':') || [...userData].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new WindowsStateError();
    return win32.join(userData, 'mcp', 'state.json');
  };
  const run: NonNullable<WindowsStateOptions['execute']> = options.execute ?? ((executable, args, execution) => execFileSync(executable, args, execution));
  const execute = (userData: string, operation: 'read' | 'write', input?: string) => {
    const script = options.script ?? (app.isPackaged ? join(process.resourcesPath, 'mcp', 'windows-state.ps1') : resolve(__dirname, '../../resources/mcp/windows-state.ps1'));
    try {
      return run(systemExecutable('WindowsPowerShell/v1.0/powershell.exe'),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-UserData', userData, '-Operation', operation],
        { encoding: 'utf8', ...(input === undefined ? {} : {input}), env: cliEnvironment(), timeout: 30000, maxBuffer: 12 * 1024 * 1024,
          windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch { throw new WindowsStateError(); }
  };
  return {
    read(userData: string): string | undefined {
      const path = check(userData);
      if (!(options.present ?? statePresent)(path)) return undefined;
      const result = execute(userData, 'read');
      if (result === 'missing') return undefined;
      if (!/^state:[A-Za-z0-9+/]*={0,2}$/.test(result)) throw new WindowsStateError();
      const bytes = Buffer.from(result.slice(6), 'base64');
      if (bytes.length > maximum || bytes.toString('base64') !== result.slice(6)) throw new WindowsStateError();
      try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
      catch { throw new WindowsStateError(); }
    },
    write(userData: string, text: string): void {
      const path = check(userData);
      (options.present ?? statePresent)(path);
      if (Buffer.byteLength(text) > maximum) throw new WindowsStateError();
      if (execute(userData, 'write', Buffer.from(text, 'utf8').toString('base64')) !== 'ok') throw new WindowsStateError();
    },
  };
}
