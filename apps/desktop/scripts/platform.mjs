/** Portable developer-tool commands and evidence paths. No shell command interpolation. */
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';

export const temporaryPath = name => join(tmpdir(), name);
export const pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
export const venvPython = root => join(root, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

/** pnpm.cmd cannot be spawned without a shell. Run the inherited package-manager JavaScript. */
export function pnpmInvocation(args) {
  const runner = process.env.npm_execpath;
  if (runner && /\.[cm]?js$/i.test(runner)) return {command: process.execPath, args: [runner, ...args]};
  if (runner && !/\.(?:cmd|bat|ps1)$/i.test(runner)) return {command: runner, args};
  if (process.platform === 'win32') throw new Error('Run this command through pnpm so npm_execpath is available.');
  return {command: 'pnpm', args};
}

/** Return native process metadata for lifecycle tests without parsing Windows tasklist columns. */
export function listProcesses() {
  if (process.platform === 'win32') {
    const powershell = win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const output = execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine | ConvertTo-Json -Compress'], {encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024});
    const rows = JSON.parse(output);
    return rows.map(row => ({pid: row.ProcessId, ppid: row.ParentProcessId, rssKiB: Number(row.WorkingSetSize) / 1024, command: row.CommandLine ?? ''}));
  }
  return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,rss=,command='], {encoding: 'utf8'}).trim().split('\n').map(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return {pid: Number(match[1]), ppid: Number(match[2]), rssKiB: Number(match[3]), command: match[4]};
  });
}
