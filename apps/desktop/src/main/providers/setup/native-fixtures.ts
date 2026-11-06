/** Platform-correct test images and explicit Node argv. Never imported by production code. @packageDocumentation */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node-pty';
import { cliEnvironment } from '../cli-transport';
import { captureCommand } from './captured';
import { ActionPty } from './pty';
import { SetupError } from './types';

/** A one-section PE32+ image with a return-zero entry point and fixture text outside the image. */
export function windowsFixtureImage(text: string | Buffer, arch = process.arch): Buffer {
  const image = Buffer.alloc(1024), arm = arch === 'arm64';
  image.write('MZ'); image.writeUInt32LE(0x80, 0x3c);
  image.write('PE\0\0', 0x80); image.writeUInt16LE(arm ? 0xaa64 : 0x8664, 0x84);
  image.writeUInt16LE(1, 0x86); image.writeUInt16LE(240, 0x94); image.writeUInt16LE(0x23, 0x96);
  const optional = 0x98;
  image.writeUInt16LE(0x20b, optional); image.writeUInt32LE(512, optional + 4);
  image.writeUInt32LE(0x1000, optional + 16); image.writeUInt32LE(0x1000, optional + 20);
  image.writeBigUInt64LE(0x140000000n, optional + 24);
  image.writeUInt32LE(0x1000, optional + 32); image.writeUInt32LE(512, optional + 36);
  image.writeUInt16LE(6, optional + 40); image.writeUInt16LE(6, optional + 48);
  image.writeUInt32LE(0x2000, optional + 56); image.writeUInt32LE(512, optional + 60);
  image.writeUInt16LE(3, optional + 68); image.writeUInt16LE(0x100, optional + 70);
  for (const offset of [72, 88]) image.writeBigUInt64LE(0x100000n, optional + offset);
  for (const offset of [80, 96]) image.writeBigUInt64LE(0x1000n, optional + offset);
  image.writeUInt32LE(16, optional + 108);
  const section = optional + 240, code = Buffer.from(arm ? '00008052c0035fd6' : '31c0c3', 'hex');
  image.write('.text', section); image.writeUInt32LE(code.length, section + 8);
  image.writeUInt32LE(0x1000, section + 12); image.writeUInt32LE(512, section + 16);
  image.writeUInt32LE(512, section + 20); image.writeUInt32LE(0x60000020, section + 36);
  code.copy(image, 512);
  return Buffer.concat([image, Buffer.from(text)]);
}

/** Preserve Unix fixture bytes; Windows metadata tests receive a PE image rather than a shebang. */
export const fixtureBinary = (unix: string | Buffer) => process.platform === 'win32' ? windowsFixtureImage(unix) : Buffer.from(unix);
export const fixtureExecutableName = (name: string) => name + (process.platform === 'win32' ? '.exe' : '');

/** Windows service tests execute the fixture's JS through Node, never a PE stub as a real CLI. */
function fixtureNodeCommand(binary: string, args: readonly string[]) {
  const image = readFileSync(binary);
  if (image.toString('ascii', 0, 2) !== 'MZ' || image.toString('ascii', 0x80, 0x84) !== 'PE\0\0') throw new Error('Expected a test PE image');
  return { executable: process.execPath, args: ['-e', image.subarray(1024).toString('utf8'), '--', binary, ...args] };
}
export function fixturePty(platform = process.platform) {
  return platform === 'win32'
    ? new ActionPty((binary, args, options) => { const command = fixtureNodeCommand(binary, args); return spawn(command.executable, command.args, options); })
    : new ActionPty();
}
export async function fixtureVersion(binary: string, _provider: string, expected: string | null, cwd: string, signal: AbortSignal) {
  const command = fixtureNodeCommand(binary, ['--version']);
  const env = Object.fromEntries(Object.entries(cliEnvironment()).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  const result = await captureCommand({ ...command, cwd, env }, signal);
  const version = result.output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
  if (result.exitCode !== 0 || !version || expected && expected !== version) throw new SetupError('wrong-version');
  return version;
}

let transportImage: Buffer | undefined;
function windowsTransportImage(): Buffer {
  if (transportImage) return transportImage;
  const directory = mkdtempSync(join(tmpdir(), 'vstudy-transport-fixture-'));
  try {
    const source = join(directory, 'transport.cs'), executable = join(directory, 'transport.exe');
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? 'C:\\Windows';
    const compiler = ['Framework64', 'Framework'].map(arch => join(systemRoot, 'Microsoft.NET', arch, 'v4.0.30319', 'csc.exe')).find(existsSync);
    if (!compiler) throw new Error('Windows transport fixture requires the .NET Framework compiler');
    writeFileSync(source, 'class Transport { static void Main(string[] args) { System.Console.WriteLine(args[0]); System.Threading.Thread.Sleep(System.Threading.Timeout.Infinite); } }');
    execFileSync(compiler, ['/nologo', '/optimize+', '/target:exe', `/out:${executable}`, source], {env: cliEnvironment(), windowsHide: true, timeout: 20000});
    transportImage = readFileSync(executable);
    return transportImage;
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

/** A small real process keeps each managed path leased without copying the complete Node runtime. */
export function transportFixture(label: string): { bytes: Buffer; args: string[] } {
  const record = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: label } } });
  if (process.platform === 'win32') return { bytes: windowsTransportImage(), args: [record] };
  return { bytes: Buffer.from(`#!/bin/sh\nprintf '%s\\n' '${record}'\nwhile :; do /bin/sleep 1; done\n`), args: [] };
}
