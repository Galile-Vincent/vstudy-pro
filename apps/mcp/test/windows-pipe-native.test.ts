/** Windows kernel acceptance for the production connector. Fixtures never start Electron or contact a school. @packageDocumentation */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { win32 } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { currentWindowsSid, windowsPipeName } from '../../desktop/src/main/mcp/endpoint';
import { createWindowsPipeConnector } from '../src/windows-pipe';

const processes: ChildProcessWithoutNullStreams[] = [];
afterEach(() => { for (const child of processes.splice(0)) child.kill(); });
const serverScript = String.raw`
$ErrorActionPreference = 'Stop'
$pipe = $null
try {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = [System.IO.Pipes.PipeSecurity]::new()
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-5-2'), [System.IO.Pipes.PipeAccessRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Deny))
  $acl.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new($sid, [System.IO.Pipes.PipeAccessRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow))
  if ($env:VSTUDY_TEST_UNSAFE -eq '1') {
    $acl.AddAccessRule([System.IO.Pipes.PipeAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'), [System.IO.Pipes.PipeAccessRights]::ReadWrite, [System.Security.AccessControl.AccessControlType]::Allow))
  }
  $pipe = [System.IO.Pipes.NamedPipeServerStream]::new($env:VSTUDY_TEST_PIPE, [System.IO.Pipes.PipeDirection]::InOut, 1, [System.IO.Pipes.PipeTransmissionMode]::Byte, [System.IO.Pipes.PipeOptions]::Asynchronous, 65536, 65536, $acl)
  [Console]::Out.WriteLine('SERVER_READY')
  [Console]::Out.Flush()
  $pipe.WaitForConnection()
  $bytes = [byte[]]::new(4)
  $count = 0
  while ($count -lt 4) {
    $read = $pipe.Read($bytes, $count, 4 - $count)
    if ($read -eq 0) { break }
    $count += $read
  }
  if ($count -gt 0) {
    $script:peerSid = ''
    $script:peerLevel = ''
    $pipe.RunAsClient([System.IO.Pipes.PipeStreamImpersonationWorker]{
      $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
      $script:peerSid = $identity.User.Value
      $script:peerLevel = [string]$identity.ImpersonationLevel
    })
    [Console]::Out.WriteLine('PEER:' + $script:peerSid + ':' + $script:peerLevel)
    $pipe.Write($bytes, 0, $count)
    $pipe.Flush()
  } else { [Console]::Out.WriteLine('NO_CLIENT_BYTES') }
} catch {
  [Console]::Out.WriteLine('SERVER_CLOSED')
} finally { if ($null -ne $pipe) { $pipe.Dispose() } }
`;

async function server(unsafe: boolean) {
  const sid = currentWindowsSid(); const path = windowsPipeName(sid);
  const child = spawn(win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(serverScript, 'utf16le').toString('base64')],
    {windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'], env: {...process.env, VSTUDY_TEST_PIPE: path.slice('\\\\.\\pipe\\'.length), VSTUDY_TEST_UNSAFE: unsafe ? '1' : '0'}});
  processes.push(child);
  let output = '';
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Native fixture readiness timed out.')); }, 30_000);
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.includes('SERVER_READY\n') || output.includes('SERVER_READY\r\n')) {clearTimeout(timer); resolve();} });
    child.once('error', () => {clearTimeout(timer); reject(new Error('Native fixture could not start.'));});
    child.once('exit', () => {clearTimeout(timer); if (!output.includes('SERVER_READY')) reject(new Error('Native fixture did not create its pipe.'));});
  });
  child.stderr.resume();
  const closed = new Promise<void>(resolve => child.once('exit', () => resolve()));
  await ready;
  return {sid, path, closed, output: () => output};
}

describe.skipIf(process.platform !== 'win32').sequential('production Windows pipe connector', () => {
  it('round-trips bytes and lets the server identify the client only at Identification level', async () => {
    const h = await server(false);
    const {stream, serverSid} = await createWindowsPipeConnector()({path: h.path, expectedServerSid: h.sid, impersonationLevel: 'identification'});
    expect(serverSid).toBe(h.sid);
    const reply = new Promise<Buffer>((resolve, reject) => {stream.once('data', resolve); stream.once('error', reject);});
    stream.write(Buffer.from([0, 255, 10, 128]));
    expect(await reply).toEqual(Buffer.from([0, 255, 10, 128]));
    stream.destroy(); await h.closed;
    expect(h.output()).toContain(`PEER:${h.sid}:Identification`);
  }, 60_000);

  it('rejects an actual connected pipe with a foreign allow ACE before sending bytes', async () => {
    const h = await server(true);
    await expect(createWindowsPipeConnector()({path: h.path, expectedServerSid: h.sid, impersonationLevel: 'identification'})).rejects.toMatchObject({code: 'DENIED'});
    await h.closed;
    expect(h.output()).not.toContain('PEER:');
    expect(h.output()).toMatch(/NO_CLIENT_BYTES|SERVER_CLOSED/);
  }, 60_000);
});
