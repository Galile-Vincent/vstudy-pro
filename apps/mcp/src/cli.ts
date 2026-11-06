/** Run stdio by default; explicit administration commands never read school credentials. @packageDocumentation */
import { parseArgs } from 'node:util';
import { clientKindSchema } from './contract';
import { BridgeClient } from './bridge';
import { Credentials } from './credentials';
import { bridgePath, credentialPath } from './paths';
import { serve } from './server';
import { installClient, uninstallClient } from './installer';
import { doctor } from './doctor';
import { WindowsAclError } from './windows-acl';
import { LocalFileError } from './files';

const help = `vstudy-mcp 0.2.0
Usage:
  vstudy-mcp [--client claude|codex|agy|claude-desktop|cursor|generic]
  vstudy-mcp install --client <client> [--dry-run] [--json]
  vstudy-mcp uninstall --client <client> [--dry-run] [--json]
  vstudy-mcp doctor [--client <client>] [--json]
  vstudy-mcp reset --client <client> [--dry-run] [--json]

Stdio pairs only on the first tool or resource read. Approve access in VStudy.
Install and uninstall print only VStudy's entry and keep private backups.
Reset clears only the local bearer and expiry, preserves identity, and never pairs or revokes app state.
Node.js 24 or later is required. No school credentials or grants belong in argv.
`;

async function main(): Promise<void> {
  const parsed = parseArgs({ options: {
    client: { type: 'string' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
  }, allowPositionals: true, strict: true });
  if (parsed.values.help) { process.stdout.write(help); return; }
  if (parsed.values.version) { process.stdout.write('0.2.0\n'); return; }
  const [command, ...rest] = parsed.positionals;
  if (rest.length || (command && !['install', 'uninstall', 'doctor', 'reset'].includes(command))) throw new LocalFileError('Unknown command. Run vstudy-mcp --help.');
  const client = clientKindSchema.safeParse(parsed.values.client ?? 'generic');
  if (!client.success) throw new LocalFileError('Unknown client. Run vstudy-mcp --help.');
  if (!command) {
    if (parsed.values.json || parsed.values['dry-run']) throw new LocalFileError('Administrative flags require a command.');
    await serve(new BridgeClient({ socketPath: bridgePath(), credentials: new Credentials(credentialPath(client.data)),
      clientName: `VStudy ${client.data}`, stderr: text => { process.stderr.write(text); } }));
    return;
  }
  if (command === 'reset') {
    if (!parsed.values.client) throw new LocalFileError('Reset requires an explicit --client.');
    const changed = new Credentials(credentialPath(client.data)).reset(parsed.values['dry-run'] ?? false);
    const result = { changed, diff: changed ? `${parsed.values['dry-run'] ? 'Would clear the local grant' : 'Local grant cleared'} for ${client.data}. Restart the agent server, then call a tool to request consent.` : 'No stored local grant to reset.' };
    process.stdout.write(parsed.values.json ? JSON.stringify(result) + '\n' : result.diff + '\n');
    return;
  }
  if (command === 'doctor') {
    if (parsed.values['dry-run']) throw new LocalFileError('Doctor is read-only and does not accept --dry-run.');
    const result = await doctor(parsed.values.client ? { client: client.data } : {});
    process.stdout.write(parsed.values.json ? JSON.stringify(result) + '\n'
      : result.checks.map(check => `${check.ok ? 'OK' : 'CHECK'} ${check.name}: ${check.detail}`).join('\n') + '\n');
    if (!result.ok) process.exitCode = 1;
    return;
  }
  if (!parsed.values.client || client.data === 'generic') throw new LocalFileError('Install and uninstall require a supported --client.');
  const options = { client: client.data, dryRun: parsed.values['dry-run'] ?? false };
  const result = command === 'install' ? installClient(options) : uninstallClient(options);
  process.stdout.write(parsed.values.json ? JSON.stringify(result) + '\n'
    : `${result.configPath}\n${result.diff}\n${result.backupPath ? `Backup ${result.backupPath}\n` : ''}`);
}

void main().catch(error => {
  process.stderr.write((error instanceof LocalFileError || error instanceof WindowsAclError) ? `${error.message}\n` : 'VStudy MCP failed. Run vstudy-mcp doctor and check Settings > Agents.\n');
  process.exitCode = 1;
});
