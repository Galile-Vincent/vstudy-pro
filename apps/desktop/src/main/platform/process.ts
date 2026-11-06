/** Native process launch policy. No shell or inherited provider secrets cross this boundary. */
import { execFile, type ChildProcess } from 'node:child_process';
import { homedir } from 'node:os';
import { join, win32 } from 'node:path';

export const macSandboxExecutable = '/usr/bin/sandbox-exec';

/** Use fixed installation locations rather than an inherited search path. */
export function executableDirectories(platform = process.platform, env = process.env, home = homedir()): string[] {
  if (platform !== 'win32') return [join(home, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', join(home, '.claude/local'), join(home, '.codex/bin')];
  const local = env.LOCALAPPDATA ?? win32.join(home, 'AppData', 'Local');
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files';
  return [win32.join(home, '.local', 'bin'), win32.join(home, '.cargo', 'bin'), win32.join(home, '.claude', 'local'),
    win32.join(home, '.codex', 'bin'), win32.join(local, 'agy', 'bin'), win32.join(local, 'Microsoft', 'WinGet', 'Links'),
    ...['314', '313', '312', '311', '310'].flatMap(version => [win32.join(local, 'Programs', 'Python', `Python${version}`), win32.join(programFiles, `Python${version}`)]),
  ];
}

/** Windows subprocesses require SystemRoot, including when the environment is scrubbed. */
export function systemExecutable(name: string): string {
  return win32.join(process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', name);
}

/** macOS denies native networking. Other platforms retain only the Python-level guards. */
export function pythonInvocation(python: string, args: string[], platform = process.platform) {
  return platform === 'darwin'
    ? { executable: macSandboxExecutable, args: ['-p', '(version 1)(allow default)(deny network*)', python, ...args] }
    : { executable: python, args };
}

/** Stop the process tree on Windows and the isolated process group on Unix. */
export async function terminateProcess(child: ChildProcess, signal: NodeJS.Signals): Promise<void> {
  if (process.platform === 'win32') {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      execFile(systemExecutable('taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, timeout: 5000}, () => {
        if (child.exitCode === null && child.signalCode === null) child.kill(signal);
        resolve();
      });
    });
    return;
  }
  try { if (child.pid) process.kill(-child.pid, signal); else child.kill(signal); }
  catch { /* The isolated process group may already have exited. */ }
}
