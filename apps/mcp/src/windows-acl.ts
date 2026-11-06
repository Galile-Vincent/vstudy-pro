/** Enforce current-SID-only owner and DACL on newly created app-owned private storage. @packageDocumentation */
import { execFileSync } from 'node:child_process';
import { win32 } from 'node:path';
import { currentWindowsSid, windowsPipeName } from '../../desktop/src/main/mcp/endpoint';

export class WindowsAclError extends Error {
  readonly code = 'DENIED';
  constructor() { super('Windows private storage ACL enforcement is unavailable or unsafe.'); }
}
export interface WindowsAclOptions {
  sid?: string;
  environment?: NodeJS.ProcessEnv;
  execute?: (executable: string, args: string[], options: { encoding: 'utf8'; timeout: number; maxBuffer: number; windowsHide: boolean; stdio: ['ignore', 'pipe', 'pipe']; env: NodeJS.ProcessEnv }) => string;
}

const script = String.raw`
$ErrorActionPreference = 'Stop'
$path = $env:VSTUDY_ACL_PATH
$sid = [System.Security.Principal.SecurityIdentifier]::new($env:VSTUDY_ACL_SID)
$isDirectory = $env:VSTUDY_ACL_DIRECTORY -eq '1'
$item = Get-Item -LiteralPath $path -Force
if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 -or $item.PSIsContainer -ne $isDirectory) { throw 'Unsafe path' }
$acl = Get-Acl -LiteralPath $path
if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'Unsafe owner' }
if ($env:VSTUDY_ACL_OPERATION -eq 'protect') {
  if ($isDirectory) { $acl = [System.Security.AccessControl.DirectorySecurity]::new() }
  else { $acl = [System.Security.AccessControl.FileSecurity]::new() }
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
  if ($isDirectory) { $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit' }
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, [System.Security.AccessControl.FileSystemRights]::FullControl, $inheritance, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $path -AclObject $acl
}
$acl = Get-Acl -LiteralPath $path
if ($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or -not $acl.AreAccessRulesProtected) { throw 'Unsafe ACL' }
$raw = [System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(), 0)
if ($raw.DiscretionaryAcl.Count -ne 1) { throw 'Foreign or missing ACE' }
$ace = $raw.DiscretionaryAcl[0]
$flags = [System.Security.AccessControl.AceFlags]::None
if ($isDirectory) { $flags = [System.Security.AccessControl.AceFlags]'ContainerInherit, ObjectInherit' }
if (-not ($ace -is [System.Security.AccessControl.CommonAce]) -or $ace.IsCallback -or $ace.SecurityIdentifier.Value -ne $sid.Value -or $ace.AceQualifier -ne [System.Security.AccessControl.AceQualifier]::AccessAllowed -or $ace.AccessMask -ne [int][System.Security.AccessControl.FileSystemRights]::FullControl -or $ace.AceFlags -ne $flags) { throw 'Unsafe ACE' }
[Console]::Out.Write('VSTUDY_ACL_OK')
`;

/** The caller may protect only a path it just created, never an existing user config directory. */
export function protectWindowsPath(path: string, directory: boolean, options: WindowsAclOptions = {}): void {
  windowsAcl(path, directory, 'protect', options);
}
export function verifyWindowsPath(path: string, directory: boolean, options: WindowsAclOptions = {}): void {
  windowsAcl(path, directory, 'verify', options);
}
function windowsAcl(path: string, directory: boolean, operation: 'protect' | 'verify', options: WindowsAclOptions): void {
  try {
    const environment = options.environment ?? process.env;
    const sid = options.sid ?? currentWindowsSid();
    const system = environment.SystemRoot ?? String.raw`C:\Windows`;
    windowsPipeName(sid);
    if (!win32.isAbsolute(path) || !/^[a-z]:/i.test(path) || path.slice(2).includes(':')
      || [...path].some(character => character.charCodeAt(0) < 32)
      || !win32.isAbsolute(system) || !/^[a-z]:/i.test(system)) throw new WindowsAclError();
    const executable = win32.join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const output = (options.execute ?? execFileSync)(executable,
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { encoding: 'utf8', timeout: 5000, maxBuffer: 8192, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...environment,
        VSTUDY_ACL_PATH: path, VSTUDY_ACL_SID: sid, VSTUDY_ACL_DIRECTORY: directory ? '1' : '0', VSTUDY_ACL_OPERATION: operation } });
    if (typeof output !== 'string' || output.trim() !== 'VSTUDY_ACL_OK') throw new WindowsAclError();
  } catch { throw new WindowsAclError(); }
}
