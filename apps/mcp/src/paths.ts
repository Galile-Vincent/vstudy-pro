/** Locate local bridge and per-client opaque grants without accepting secrets in argv. @packageDocumentation */
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ClientKind } from './contract';

export function appDataPath(home = homedir()): string {
  return process.platform === 'darwin' ? join(home, 'Library/Application Support/@vstudy/desktop')
    : join(home, '.config/@vstudy/desktop');
}

export function bridgePath(userData = process.env.VSTUDY_USER_DATA || appDataPath()): string {
  return join(resolve(userData), 'mcp/bridge.sock');
}

export function credentialPath(client: ClientKind, home = homedir()): string {
  return join(resolve(home), '.config/vstudy-mcp', `${client}.json`);
}
