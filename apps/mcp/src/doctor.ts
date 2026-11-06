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
import { pingWire } from './bridge';
import { Wire } from './transport';
import { BridgeError } from './errors';
import { MCP_PROTOCOL_VERSION, toolResultSchema, type McpErrorCode } from './contract';

export interface DoctorOptions extends Omit<ClientOptions, 'client'> { client?: ClientOptions['client']; userData?: string }
export interface DoctorResult { ok: boolean; checks: { name: string; ok: boolean; detail: string }[] }

export function detectClients(options: Omit<ClientOptions, 'client'> = {}) {
  const home = options.home ?? homedir();
  return installableClients.map(client => {
    const config = clientConfig({ ...options, client });
    const binary = client === 'claude-desktop' ? undefined : findExecutable(client, options.environment);
    const app = { claude: 'Claude', codex: 'Codex', agy: 'Antigravity', 'claude-desktop': 'Claude', cursor: 'Cursor' }[client];
    const detected = !!binary || existsSync(`/Applications/${app}.app`) || existsSync(join(home, `Applications/${app}.app`));
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    const command = [config.entry.command, config.entry.args[0], 'install', '--client', client].map(quote).join(' ');
    return { client, detected, configPath: config.path, command };
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
  let wire: Wire | undefined;
  try {
    wire = await Wire.connect(bridgePath(userData));
    const { version, enabled } = await pingWire(wire);
    checks.push({ name: 'bridge', ok: version === MCP_PROTOCOL_VERSION, detail: `Running bridge protocol ${version}.` });
    checks.push({ name: 'bridge-enabled', ok: enabled, detail: enabled ? 'Agent access is enabled.' : 'DISABLED. Agent access is switched off in VStudy.' });
  } catch {
    wire?.close(); wire = undefined;
    checks.push({ name: 'bridge', ok: false, detail: 'No compatible private bridge answered. Open VStudy Pro and enable Settings > Agents.' });
  }
  try {
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
      } catch {
        checks.push({ name: `${client}-config`, ok: false, detail: 'Configuration failed validation. No private contents were printed.' });
      }
      try {
        const identity = new Credentials(credentialPath(client, home)).read();
        if (!identity?.grant) {
          checks.push({ name: `${client}-grant`, ok: false, detail: 'No stored local bearer. Doctor does not initiate pairing.' });
          continue;
        }
        const localExpiryValid = !!identity.expiresAt && Date.parse(identity.expiresAt) > Date.now();
        if (!wire || wire.closed) {
          checks.push({ name: `${client}-grant`, ok: false, detail: 'Stored bearer exists, but app authorization could not be checked. Doctor does not launch the app or pair.' });
          continue;
        }
        let code: McpErrorCode | null;
        try {
          const result = toolResultSchema.parse(await wire.rpc({ method: 'tools.call', params: { grant: identity.grant, name: 'list_accounts', args: {} } }, 5000));
          code = result.ok ? null : result.error.code;
        } catch (error) { code = error instanceof BridgeError ? error.code : 'INTERNAL'; }
        checks.push({ name: `${client}-grant`, ok: code === null && localExpiryValid,
          detail: code ? grantStatus(code) : localExpiryValid
            ? 'Stored bearer accepted by the app through list_accounts. Returned account content was discarded.'
            : 'App accepted the bearer, but the local expiry has elapsed. Reconnect this client in VStudy.' });
      } catch {
        checks.push({ name: `${client}-grant`, ok: false, detail: 'Local grant failed validation. No private contents were printed.' });
      }
    }
  } finally { wire?.close(); }
  return { ok: checks.every(check => check.ok), checks };
}

function grantStatus(code: McpErrorCode): string {
  const details: Partial<Record<McpErrorCode, string>> = {
    DENIED: 'The app rejected the stored bearer. It may be revoked or access may be denied.',
    EXPIRED: 'The app reports that the stored grant has expired.',
    DISABLED: 'Agent access is switched off in the app.',
    UNPAIRED: 'The app does not recognize the stored bearer.',
    SCOPE_REQUIRED: 'The app recognized the bearer, but its scopes do not allow the list_accounts probe.',
  };
  return `${code}. ${details[code] ?? 'The app authorization probe did not succeed.'} Doctor did not pair or launch the app.`;
}
