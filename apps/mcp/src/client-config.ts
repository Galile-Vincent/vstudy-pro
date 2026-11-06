/** Define verified global client formats and argv-only stdio launch entries. @packageDocumentation */
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
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
}
export interface ClientConfig {
  client: InstallableClient;
  path: string;
  format: 'json' | 'jsonc' | 'toml';
  entry: Record<string, unknown>;
}

export function findExecutable(name: string, environment = process.env): string | undefined {
  for (const directory of (environment.PATH ?? '').split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const path = join(directory, name);
    try { accessSync(path, constants.X_OK); if (statSync(path).isFile()) return path; } catch { continue; }
  }
  return undefined;
}

export function clientConfig(options: ClientOptions): ClientConfig {
  if (options.client === 'generic') throw new LocalFileError('Generic clients require manual configuration. Choose a supported client.');
  const client = options.client;
  const home = resolve(options.home ?? homedir());
  const env = options.environment ?? process.env;
  const path = {
    claude: env.CLAUDE_CONFIG_DIR ? join(resolve(env.CLAUDE_CONFIG_DIR), '.claude.json') : join(home, '.claude.json'),
    codex: join(env.CODEX_HOME ? resolve(env.CODEX_HOME) : join(home, '.codex'), 'config.toml'),
    agy: join(home, '.gemini/config/mcp_config.json'),
    'claude-desktop': join(home, 'Library/Application Support/Claude/claude_desktop_config.json'),
    cursor: join(home, '.cursor/mcp.json'),
  }[client];
  const command = options.command ?? findExecutable('node', env);
  const binPath = options.binPath ?? resolve(__dirname, 'vstudy-mcp.cjs');
  if (!command || !isAbsolute(command) || !isAbsolute(binPath)) throw new LocalFileError('Install Node.js and use absolute runtime and vstudy-mcp paths.');
  // Clients interpolate ${...} before launching; literal dollar signs in paths cannot round-trip safely.
  if ([command, binPath].some(value => value.includes('${') || /[\r\n\0]/.test(value))) {
    throw new LocalFileError('Client interpolation or control characters in launcher paths are unsupported.');
  }
  const entry: Record<string, unknown> = { command, args: [binPath, '--client', client] };
  if (client === 'claude') { entry.type = 'stdio'; entry.timeout = 300_000; }
  if (client === 'codex') entry.tool_timeout_sec = 300;
  if (client === 'agy') entry.timeoutSeconds = 300;
  return { client, path, entry, format: client === 'codex' ? 'toml' : client === 'cursor' ? 'jsonc' : 'json' };
}
