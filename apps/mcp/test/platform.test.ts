/** Exercise Windows path and native-argv decisions as fixtures on macOS, without claiming Windows acceptance. @packageDocumentation */
import { describe, expect, it, vi } from 'vitest';
import { Socket } from 'node:net';
import { editConfig, parseConfig } from '../src/config-edit';
import { clientConfig } from '../src/client-config';
import { detectClients } from '../src/doctor';
import { appDataPath, bridgePath, credentialPath } from '../src/paths';
import { connectLocalSocket } from '../src/connection';
import { launchApplication, registryAppPaths, resolveWindowsApp } from '../src/launch';
import { protectWindowsPath, verifyWindowsPath, WindowsAclError, type WindowsAclOptions } from '../src/windows-acl';
import { windowsPipeName } from '../../desktop/src/main/mcp/endpoint';

const sid = 'S-1-5-21-100-200-300-1001';
const environment = {
  USERPROFILE: String.raw`C:\Users\Student Name`, APPDATA: String.raw`D:\Roaming Profile`,
  LOCALAPPDATA: String.raw`C:\Users\Student Name\AppData\Local`, SystemRoot: String.raw`C:\Windows`,
};
const command = String.raw`C:\Program Files\nodejs\node.exe`;
const binPath = String.raw`C:\Program Files\VStudy Pro\resources\mcp\dist\vstudy-mcp.cjs`;
const options = { platform: 'win32' as const, environment, command, binPath };

describe('Windows client configuration fixtures', () => {
  for (const [client, expected] of [
    ['claude', String.raw`C:\Users\Student Name\.claude.json`],
    ['codex', String.raw`C:\Users\Student Name\.codex\config.toml`],
    ['agy', String.raw`C:\Users\Student Name\.gemini\config\mcp_config.json`],
    ['claude-desktop', String.raw`D:\Roaming Profile\Claude\claude_desktop_config.json`],
    ['cursor', String.raw`C:\Users\Student Name\.cursor\mcp.json`],
  ] as const) {
    it(`maps ${client} to its global Windows file`, () => {
      const config = clientConfig({ ...options, client });
      expect(config.path).toBe(expected);
      expect(config.entry.command).toBe(command);
      expect(config.entry.args).toEqual([binPath, '--client', client]);
      if (client === 'claude') expect(config.entry.timeout).toBe(600_000);
      if (client === 'codex') expect(config.entry.tool_timeout_sec).toBe(600);
      if (client === 'agy') expect(config.entry.timeoutSeconds).toBe(600);
      const edited = editConfig(undefined, config, false);
      const parsed = parseConfig(edited.text, config.format);
      const servers = parsed[client === 'codex' ? 'mcp_servers' : 'mcpServers'] as Record<string, { args: string[] }>;
      expect(servers.vstudy?.args).toEqual([binPath, '--client', client]);
    });
  }
  it('honors custom client homes and constructs a PowerShell install command', () => {
    expect(clientConfig({ ...options, client: 'codex', environment: { ...environment, CODEX_HOME: String.raw`E:\Custom Codex` } }).path)
      .toBe(String.raw`E:\Custom Codex\config.toml`);
    expect(clientConfig({ ...options, client: 'claude', environment: { ...environment, CLAUDE_CONFIG_DIR: String.raw`E:\Custom Claude` } }).path)
      .toBe(String.raw`E:\Custom Claude\.claude.json`);
    const result = detectClients({ ...options, binPath: String.raw`C:\Student's files\vstudy-mcp.cjs` });
    expect(result.find(client => client.client === 'codex')?.command)
      .toBe("& 'C:\\Program Files\\nodejs\\node.exe' 'C:\\Student''s files\\vstudy-mcp.cjs' 'install' '--client' 'codex'");
  });
  it('shares app-data and SID-derived pipe resolution with main', () => {
    expect(appDataPath(environment.USERPROFILE, options)).toBe(String.raw`D:\Roaming Profile\@vstudy\desktop`);
    expect(bridgePath(String.raw`D:\App Data`, { platform: 'win32', userIdentity: sid }))
      .toBe("\\\\.\\pipe\\vstudy-ebead97e1d40fa148f22dcd495581555");
    expect(credentialPath('codex', environment.USERPROFILE, options))
      .toBe(String.raw`D:\Roaming Profile\@vstudy\mcp-clients\codex.json`);
  });
});

describe('platform connection and launch fixtures', () => {
  it('rejects a predictable pipe name when no same-handle authenticated connector exists', async () => {
    const connect = vi.fn(() => new Socket());
    await expect(connectLocalSocket(windowsPipeName(sid), { platform: 'win32', connect, authenticatedPipe: null }))
      .rejects.toMatchObject({ code: 'UNSUPPORTED' });
    expect(connect).not.toHaveBeenCalled();
  });
  it('exposes only a same-handle authenticated stream with Identification-level impersonation', async () => {
    const socket = new Socket();
    const checkUnix = vi.fn(() => { throw new Error('Unix stat must not run.'); });
    const connect = vi.fn(() => { throw new Error('Bare Node pipe connection must not run.'); });
    const authenticatedPipe = vi.fn(async () => ({ stream: socket, serverSid: sid }));
    expect(await connectLocalSocket(windowsPipeName(sid), { platform: 'win32', checkUnix, connect, authenticatedPipe, currentSid: () => sid })).toBe(socket);
    expect(authenticatedPipe).toHaveBeenCalledWith({ path: windowsPipeName(sid), expectedServerSid: sid, impersonationLevel: 'identification' });
    expect(checkUnix).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); socket.destroy();
  });
  it('destroys a foreign-owned connected handle before exposing it to framed RPC', async () => {
    const socket = new Socket();
    const write = vi.spyOn(socket, 'write');
    await expect(connectLocalSocket(windowsPipeName(sid), { platform: 'win32', currentSid: () => sid,
      authenticatedPipe: async () => ({ stream: socket, serverSid: 'S-1-5-21-999-999-999-1001' }) }))
      .rejects.toMatchObject({ code: 'DENIED' });
    expect(socket.destroyed).toBe(true); expect(write).not.toHaveBeenCalled();
  });
  it('rejects remote pipe hosts and arbitrary local names before connecting', async () => {
    const connect = vi.fn(() => new Socket());
    for (const path of [String.raw`\attacker\pipe\vstudy-ebead97e1d40fa148f22dcd495581555`, String.raw`\.\pipe\other`, 'localhost:8080']) {
      await expect(connectLocalSocket(path, { platform: 'win32', connect })).rejects.toMatchObject({ code: 'DENIED' });
    }
    expect(connect).not.toHaveBeenCalled();
  });
  it('uses Mac LaunchServices argv unchanged', async () => {
    const run = vi.fn(async () => {});
    await launchApplication({ platform: 'darwin', run });
    expect(run).toHaveBeenCalledWith('/usr/bin/open', ['-g', '-j', '-a', 'VStudy Pro', '--args', '--mcp-background'], false);
  });
  it('resolves only the named app from uninstall metadata and spawns only its background flag', async () => {
    const exe = String.raw`C:\Student's files & notes\VStudy Pro.exe`;
    const text = 'HKEY_CURRENT_USER\\Software\\fixture\n    DisplayName    REG_SZ    VStudy Pro\n    DisplayIcon    REG_SZ    "' + exe + '",0\n    UninstallString    REG_SZ    malicious --delete\n';
    const query = vi.fn(() => text);
    const run = vi.fn(async () => {});
    await launchApplication({ platform: 'win32', environment, query, isFile: path => path === exe, run });
    expect(query.mock.calls[0]).toEqual([String.raw`C:\Windows\System32\reg.exe`, ['query', String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`, '/s']]);
    expect(run).toHaveBeenCalledWith(exe, ['--mcp-background'], true);
    expect(registryAppPaths(text, environment)).toEqual([exe]);
  });
  it('uses the known per-user installation path after registry lookup fails', () => {
    const expected = String.raw`C:\Users\Student Name\AppData\Local\Programs\VStudy Pro\VStudy Pro.exe`;
    expect(resolveWindowsApp({ environment, query: () => { throw new Error('Unavailable'); }, isFile: path => path === expected })).toBe(expected);
    expect(registryAppPaths('HKEY_CURRENT_USER\\x\n    DisplayName    REG_SZ    Other App\n    InstallLocation    REG_SZ    C:\\Other\n', environment)).toEqual([]);
  });
  it.each(['0.2.2', '0.3.0-rc.1+build.2'])('discovers a custom path from versioned NSIS metadata %s', async version => {
    const exe = String.raw`E:\Student's custom install\VStudy Pro.exe`;
    const query = () => 'HKEY_CURRENT_USER\\Software\\fixture\n    DisplayName    REG_SZ    VStudy Pro ' + version + '\n    DisplayIcon    REG_SZ    "' + exe + '",0\n';
    const run = vi.fn(async () => {});
    await launchApplication({platform: 'win32', environment, query, isFile: path => path === exe, run});
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(exe, ['--mcp-background'], true);
  });
  it('rejects similarly named registry products and command-shaped display names', () => {
    for (const name of ['VStudy Pro Tools', 'VStudy Pro 0.2.2 helper', 'VStudy Pro 0.2.2 & other.exe', 'Other VStudy Pro 0.2.2']) {
      expect(registryAppPaths('HKEY_CURRENT_USER\\x\n    DisplayName    REG_SZ    ' + name + '\n    DisplayIcon    REG_SZ    C:\\Other\\VStudy Pro.exe\n', environment)).toEqual([]);
    }
  });
  it('prefers a custom HKCU InstallLocation over the standard per-user directory', () => {
    const directory = 'E:\\Custom VStudy';
    const custom = directory + '\\VStudy Pro.exe';
    const query = vi.fn(() => 'HKEY_CURRENT_USER\\Software\\fixture\n    DisplayName    REG_SZ    VStudy Pro\n    InstallLocation    REG_SZ    ' + directory + '\n');
    expect(resolveWindowsApp({ environment, query, isFile: () => true })).toBe(custom);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('prefers the standard per-user directory before probing legacy machine-wide installs', () => {
    const query = vi.fn(() => '');
    const expected = 'C:\\Users\\Student Name\\AppData\\Local\\Programs\\VStudy Pro\\VStudy Pro.exe';
    expect(resolveWindowsApp({ environment, query, isFile: path => path === expected })).toBe(expected);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('does not launch missing apps or registry command text', async () => {
    const run = vi.fn(async () => {});
    await expect(launchApplication({ platform: 'win32', environment, query: () => '', isFile: () => false, run })).rejects.toMatchObject({ code: 'DISCONNECTED' });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('Windows ACL command fixtures', () => {
  it('keeps a constant encoded script and passes metacharacters only in environment values', () => {
    const calls: Parameters<NonNullable<WindowsAclOptions['execute']>>[] = [];
    const execute: NonNullable<WindowsAclOptions['execute']> = (...args) => { calls.push(args); return 'VSTUDY_ACL_OK'; };
    const path = String.raw`C:\Student's files\$(never-execute); [notes]\codex.json`;
    protectWindowsPath(path, false, { environment, sid, execute });
    verifyWindowsPath(path, false, { environment, sid, execute });
    const [protect, verify] = calls;
    expect(protect?.[0]).toBe(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`);
    expect(protect?.[1]).toEqual(verify?.[1]);
    expect(protect?.[1].join(' ')).not.toContain(path);
    expect(protect?.[2].env).toMatchObject({ VSTUDY_ACL_PATH: path, VSTUDY_ACL_SID: sid, VSTUDY_ACL_OPERATION: 'protect', VSTUDY_ACL_DIRECTORY: '0' });
    expect(verify?.[2].env.VSTUDY_ACL_OPERATION).toBe('verify');
    expect(protect?.[2].stdio).toEqual(['ignore', 'pipe', 'pipe']);
    expect(protect?.[2]).not.toHaveProperty('shell');
  });
  it('fails closed for missing native enforcement, unsafe results, remote paths, and malformed SID', () => {
    const execute = vi.fn(() => { throw new Error('must-not-escape'); });
    expect(() => protectWindowsPath(String.raw`C:\private`, true, { environment, sid, execute })).toThrow(WindowsAclError);
    expect(() => verifyWindowsPath(String.raw`C:\private`, true, { environment, sid, execute: () => 'FOREIGN ACL' })).toThrow(WindowsAclError);
    for (const path of [String.raw`\server\share\private`, String.raw`C:\private:stream`, 'relative']) {
      const untouched = vi.fn(() => 'VSTUDY_ACL_OK');
      expect(() => protectWindowsPath(path, true, { environment, sid, execute: untouched })).toThrow(WindowsAclError);
      expect(untouched).not.toHaveBeenCalled();
    }
    expect(() => verifyWindowsPath(String.raw`C:\private`, true, { environment, sid: 'username', execute: () => 'VSTUDY_ACL_OK' })).toThrow(WindowsAclError);
  });
});
