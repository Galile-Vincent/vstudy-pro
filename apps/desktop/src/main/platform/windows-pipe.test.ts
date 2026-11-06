/** Run the actual ACL pipe host on Windows. Other hosts cannot validate the Windows kernel boundary. */
import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { systemExecutable } from './process';

it.skipIf(process.platform !== 'win32')('round-trips bytes only through the current-SID ACL and rejects an existing pipe owner', async () => {
  const name = 'vstudy-' + randomBytes(16).toString('hex');
  const executable = systemExecutable('WindowsPowerShell/v1.0/powershell.exe');
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve('resources/mcp/windows-pipe.ps1'), '-PipeName', name];
  const child = spawn(executable, args, {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  const closed = once(child, 'close');
  const lines = createInterface({input: child.stdout});
  let diagnostics = '';
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + String(chunk)).slice(-8192); });
  const ready = new Promise<string>((accept, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Pipe host startup timed out')); }, 25000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); reject(new Error(`Pipe host failed (${code}): ${diagnostics}`)); });
    lines.on('line', line => {
      if (line.startsWith('ready:')) { clearTimeout(timer); accept(line); }
      const data = /^data:([a-f0-9]{32}):([A-Za-z0-9+/=]+)$/.exec(line);
      if (data) child.stdin.write(`${data[1]}:${data[2]}\n`);
    });
  });
  try {
    const startup = await ready;
    const [, sid, encoded] = startup.split(':');
    expect(sid).toMatch(/^S-1-\d+(?:-\d+)+$/);
    const acl = Buffer.from(encoded!, 'base64').toString('utf8');
    expect(acl).toContain('D:P');
    expect(acl).toContain(sid);
    expect(acl).not.toMatch(/\(A;[^)]*;;;(?:WD|AU|BU)\)/);
    // Connect after readiness. There is no permissive Node server in this test.
    const peer = createConnection(`\\\\.\\pipe\\${name}`);
    try {
      const response = once(peer, 'data');
      peer.write(Buffer.from('VSTUDY_PIPE_ROUND_TRIP'));
      const [bytes] = await response;
      expect(bytes.toString()).toBe('VSTUDY_PIPE_ROUND_TRIP');
      const duplicate = spawn(executable, args, {windowsHide: true, stdio: 'ignore'});
      const [code] = await once(duplicate, 'close');
      expect(code).not.toBe(0);
    } finally { peer.destroy(); }
  } finally {
    child.stdin.end();
    await closed;
    lines.close();
  }
}, 60000);
