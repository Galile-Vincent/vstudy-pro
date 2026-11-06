/** Define verified global client formats and argv-only stdio launch entries. @packageDocumentation */
import { homedir } from 'node:os';
import { delimiter, win32, posix } from 'node:path';
import { accessSync, constants, statSync } from 'node:fs';
import type { ClientKind } from './contract';
import { LocalFileError } from './files';

export const installableClients = ['claude', 'codex', 'agy', 'claude-desktop', 'cursor'] as const;
export type InstallableClient = typeof installableClients[number];
export interface ClientOptions {
  client: ClientKind;
  home?: string;
  environment?: NodeJS.ProcessEnv;
  command?: string;
  binPath?: string;
  dryRun?: boolean;
  platform?: NodeJS.Platform;
}
export interface StdioEntry {
  command: string;
  args: [string, '--client', InstallableClient];
  type?: 'stdio';
  timeout?: number;
  tool_timeout_sec?: number;
  timeoutSeconds?: number;
}
export interface ClientConfig {
  client: InstallableClient;
  path: string;
  format: 'json' | 'jsonc' | 'toml';
  entry: StdioEntry;
}

export function findExecutable(name: string, environment = process.env, platform = process.platform): string | undefined {
  const paths = platform === 'win32' ? win32 : posix;
  for (const directory of (environment.PATH ?? '').split(platform === 'win32' ? ';' : delimiter)) {
    if (!paths.isAbsolute(directory)) continue;
    const names = platform === 'win32' && !name.includes('.') ? [name + '.exe', ...(name === 'node' ? [] : [name + '.cmd', name + '.bat'])] : [name];
    for (const candidate of names) {
      const path = paths.join(directory, candidate);
      try { accessSync(path, constants.X_OK); if (statSync(path).isFile()) return path; } catch { continue; }
    }
  }
  return undefined;
}

export function clientConfig(options: ClientOptions): ClientConfig {
  if (options.client === 'generic') throw new LocalFileError('Generic clients require manual configuration. Choose a supported client.');
  const client = options.client;
  const platform = options.platform ?? process.platform;
  const paths = platform === 'win32' ? win32 : posix;
  const env = options.environment ?? process.env;
  const home = paths.resolve(options.home ?? (platform === 'win32' ? env.USERPROFILE : undefined) ?? homedir());
  const path = {
    claude: env.CLAUDE_CONFIG_DIR ? paths.join(paths.resolve(env.CLAUDE_CONFIG_DIR), '.claude.json') : paths.join(home, '.claude.json'),
    codex: paths.join(env.CODEX_HOME ? paths.resolve(env.CODEX_HOME) : paths.join(home, '.codex'), 'config.toml'),
    agy: paths.join(home, '.gemini', 'config', 'mcp_config.json'),
    'claude-desktop': platform === 'win32' ? paths.join(env.APPDATA ?? paths.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json') : paths.join(home, 'Library/Application Support/Claude/claude_desktop_config.json'),
    cursor: paths.join(home, '.cursor', 'mcp.json'),
  }[client];
  const command = options.command ?? findExecutable('node', env, platform);
  const binPath = options.binPath ?? paths.resolve(__dirname, 'vstudy-mcp.cjs');
  if (!command || !paths.isAbsolute(command) || !paths.isAbsolute(binPath)) throw new LocalFileError('Install Node.js and use absolute runtime and vstudy-mcp paths.');
  // Clients interpolate ${...} before launching; literal dollar signs in paths cannot round-trip safely.
  if ([command, binPath].some(value => value.includes('${') || /[\r\n\0]/.test(value))) {
    throw new LocalFileError('Client interpolation or control characters in launcher paths are unsupported.');
  }
  const entry: StdioEntry = { command, args: [binPath, '--client', client] };
  const timeout = platform === 'win32' ? 600 : 300;
  if (client === 'claude') { entry.type = 'stdio'; entry.timeout = timeout * 1000; }
  if (client === 'codex') entry.tool_timeout_sec = timeout;
  if (client === 'agy') entry.timeoutSeconds = timeout;
  return { client, path, entry, format: client === 'codex' ? 'toml' : client === 'cursor' ? 'jsonc' : 'json' };
}
