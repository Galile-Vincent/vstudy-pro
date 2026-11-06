/** Share app data and SID-derived endpoints with main while keeping grants per configured client. @packageDocumentation */
import { homedir } from 'node:os';
import { join, resolve, win32 } from 'node:path';
import { defaultAppDataPath, type AppDataOptions } from '../../desktop/src/main/platform/app-data';
import { resolveMcpEndpoint } from '../../desktop/src/main/mcp/endpoint';
import type { ClientKind } from './contract';

export function appDataPath(home = homedir(), options: AppDataOptions = {}): string { return defaultAppDataPath({ ...options, home }); }

export function bridgePath(userData?: string, options: AppDataOptions & { userIdentity?: string } = {}): string {
  return resolveMcpEndpoint(userData ?? process.env.VSTUDY_USER_DATA ?? defaultAppDataPath(options), options.platform, options.userIdentity).path;
}

export function credentialPath(client: ClientKind, home = homedir(), options: AppDataOptions = {}): string {
  if ((options.platform ?? process.platform) === 'win32') {
    const environment = options.environment ?? process.env;
    return win32.join(environment.APPDATA ?? win32.join(home, 'AppData', 'Roaming'), '@vstudy', 'mcp-clients', `${client}.json`);
  }
  return join(resolve(home), '.config/vstudy-mcp', `${client}.json`);
}
