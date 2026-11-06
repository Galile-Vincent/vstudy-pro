/** Diagnose local installation without pairing, launching the app, or exposing grant values. @packageDocumentation */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { clientConfig, findExecutable, installableClients, type ClientOptions } from './client-config';
import { Credentials } from './credentials';
import { credentialPath, bridgePath, appDataPath } from './paths';
import { parseConfig } from './config-edit';
import { readLocal } from './files';
import { pingBridge } from './bridge';
import { MCP_PROTOCOL_VERSION } from './contract';

export interface DoctorOptions extends Omit<ClientOptions, 'client'> { client?: ClientOptions['client']; userData?: string }
export interface DoctorResult { ok: boolean; checks: { name: string; ok: boolean; detail: string }[] }

export function detectClients(options: Omit<ClientOptions, 'client'> = {}) {
  const home = options.home ?? homedir();
  return installableClients.map(client => {
    const config = clientConfig({ ...options, client });
    const binary = client === 'claude-desktop' ? undefined : findExecutable(client, options.environment);
    const app = { claude: 'Claude', codex: 'Codex', agy: 'Antigravity', 'claude-desktop': 'Claude', cursor: 'Cursor' }[client];
    const detected = !!binary || existsSync(`/Applications/${app}.app`) || existsSync(join(home, `Applications/${app}.app`));
    return { client, detected, configPath: config.path, command: String(config.entry.command) };
  });
}

async function binaryVersion(path: string): Promise<string | undefined> {
  return new Promise(resolve => {
    execFile(path, ['--version'], { timeout: 2000, maxBuffer: 4096, windowsHide: true }, (error, stdout) => {
      resolve(error ? undefined : stdout.match(/\b\d+\.\d+\.\d+(?:[.-][a-zA-Z0-9]+)*\b/)?.[0]);
    });
  });
}

export async function doctor(options: DoctorOptions = {}): Promise<DoctorResult> {
  const checks: DoctorResult['checks'] = [];
  const home = options.home ?? homedir();
  const userData = options.userData ?? process.env.VSTUDY_USER_DATA ?? appDataPath(home);
  const clients = options.client ? [options.client] : installableClients;
  const node = options.command ?? findExecutable('node', options.environment);
  const nodeVersion = node ? await binaryVersion(node) : undefined;
  checks.push({ name: 'node', ok: !!nodeVersion && Number(nodeVersion.split('.')[0]) >= 24,
    detail: nodeVersion ? `Node ${nodeVersion}; version 24 or later required.` : 'Node.js is unavailable. Install Node.js 24 or later.' });
  const appInstalled = existsSync('/Applications/VStudy Pro.app') || existsSync(join(home, 'Applications/VStudy Pro.app'));
  checks.push({ name: 'app-installed', ok: appInstalled, detail: appInstalled ? 'VStudy Pro app bundle detected.' : 'VStudy Pro was not found in Applications.' });
  try {
    const version = await pingBridge(bridgePath(userData));
    checks.push({ name: 'bridge', ok: version === MCP_PROTOCOL_VERSION, detail: `Running bridge protocol ${version}.` });
  } catch {
    checks.push({ name: 'bridge', ok: false, detail: 'No compatible private bridge answered. Open VStudy Pro and enable Settings > Agents.' });
  }
  for (const client of clients) {
    try {
      const config = clientConfig({ ...options, client });
      const text = readLocal(config.path);
      if (text === undefined) checks.push({ name: `${client}-config`, ok: false, detail: 'Client configuration is absent.' });
      else {
        const root = parseConfig(text, config.format);
        const map = root[config.format === 'toml' ? 'mcp_servers' : 'mcpServers'];
        const installed = !!map && typeof map === 'object' && Object.hasOwn(map, 'vstudy');
        checks.push({ name: `${client}-config`, ok: installed, detail: installed ? 'Configuration parsed and a vstudy entry exists. Launch acceptance is not established.' : 'Configuration parsed; no vstudy entry exists.' });
      }
      const identity = new Credentials(credentialPath(client, home)).read();
      const valid = !!identity?.grant && !!identity.expiresAt && Date.parse(identity.expiresAt) > Date.now();
      checks.push({ name: `${client}-grant`, ok: valid, detail: valid ? 'Private local grant exists and is unexpired. Revocation is checked by the app on use.' : 'No unexpired local grant. The first tool call requests pairing.' });
    } catch {
      checks.push({ name: `${client}-config-or-grant`, ok: false, detail: 'Configuration or local grant failed validation. No private contents were printed.' });
    }
  }
  return { ok: checks.every(check => check.ok), checks };
}
