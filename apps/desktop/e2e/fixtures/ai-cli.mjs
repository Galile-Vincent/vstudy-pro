/** Claude uses a signed fixture publisher. Other fake CLIs require explicit executable selection. */
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createMessage, generateKey, readKey, readPrivateKey, sign } from 'openpgp';

const claudeBase = 'https://downloads.claude.ai/claude-code-releases';
const agyBase = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app';
const codexBase = 'https://api.github.com/repos/openai/codex/releases';
function archive(name, bytes) {
  const header = Buffer.alloc(512);
  header.write(name); header.write('0000700\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
  header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257);
  header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  return gzipSync(Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512 + 1024)]));
}
function worker(provider, version, root) {
  return Buffer.from(`#!${process.execPath}
const fs = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');
const root = ${JSON.stringify(root)}, provider = ${JSON.stringify(provider)}, version = ${JSON.stringify(version)};
const auth = path.join(root, provider + '-signed-in');
fs.appendFileSync(path.join(root, 'launches.jsonl'), JSON.stringify({ provider, version, pid: process.pid, binary: process.argv[1], args: process.argv.slice(2) }) + '\\n');
const send = value => process.stdout.write(JSON.stringify(provider === 'agy' ? { jsonrpc: '2.0', ...value } : value) + '\\n');
const args = process.argv.slice(2);
if (args.includes('--version')) { console.log(provider === 'claude' ? version + ' (Claude Code)' : provider === 'codex' ? 'codex-cli ' + version : version); process.exit(0); }
if (args.includes('status')) { if (provider === 'claude') send({ loggedIn: fs.existsSync(auth) }); else console.log(fs.existsSync(auth) ? 'Logged in using ChatGPT' : 'Not logged in'); process.exit(fs.existsSync(auth) ? 0 : 1); }
if (args.includes('acp')) {
 readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line);
  if (request.method === 'initialize') send({ id: request.id, result: { protocolVersion: 1, agentInfo: { name: 'Local fixture', version }, agentCapabilities: {} } });
  else if (request.method === 'session/new') send(fs.existsSync(auth) ? { id: request.id, result: { sessionId: 'fixture-session', models: { availableModels: [{ modelId: 'gemini-3.8-flash-high', name: 'Fixture model' }] } } } : { id: request.id, error: { code: -32000, message: 'Not logged in' } });
  else if (request.method === 'session/set_model') send({ id: request.id, result: {} });
  else if (request.method === 'session/prompt') { send({ method: 'session/update', params: { sessionId: 'fixture-session', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OK from Antigravity ' + version } } } }); send({ id: request.id, result: { stopReason: 'end_turn' } }); }
 });
} else if (args.includes('login') || provider === 'agy') {
 console.log('Local sign-in fixture. No real account or network is used.');
 console.log('https://example.com/ai-cli-device'); console.log('Device code: LOCAL-1234'); console.log('Type approve and press Enter.');
 let input = ''; process.stdin.on('data', chunk => { input += chunk; if (/approve[\\r\\n]/.test(input)) { fs.writeFileSync(auth, 'yes'); console.log('Sign-in complete.'); process.exit(0); } });
} else if (args[0] === 'debug') { console.log(JSON.stringify({ models: [] })); process.exit(0); }
else {
 let input = ''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => {
  if (input.includes('control_request')) { send({ type: 'control_response', response: { response: { models: [{ value: 'fixture-model', displayName: 'Fixture model' }] } } }); return; }
  if (!fs.existsSync(auth)) { console.error('Not logged in'); process.exit(1); }
  const text = value => provider === 'claude' ? send({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: value } } }) : send({ type: 'item.completed', item: { type: 'agent_message', text: value } });
  const done = () => { send({ type: provider === 'claude' ? 'result' : 'turn.completed' }); process.exit(0); };
  if (input.includes('Hold the old version')) {
   text('Old version ' + version + ' is still answering.'); fs.writeFileSync(path.join(root, 'held.json'), JSON.stringify({ pid: process.pid, binary: process.argv[1], version }));
   const timer = setInterval(() => { fs.writeFileSync(path.join(root, 'heartbeat'), String(Date.now())); if (fs.existsSync(path.join(root, 'release-held'))) { clearInterval(timer); text('The old session finished.'); done(); } }, 50);
  } else { text('OK from ' + provider + ' ' + version); done(); }
 });
}
`);
}
export async function createCliFixtures(root) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const files = {}, executables = {}, fixtureFile = join(root, 'network.json');
  const key = await generateKey({ type: 'ecc', curve: 'ed25519Legacy', userIDs: [{ name: 'VStudy isolated test fixture' }], format: 'armored' });
  const privateKey = await readPrivateKey({ armoredKey: key.privateKey });
  const fingerprint = (await readKey({ armoredKey: key.publicKey })).getFingerprint().toUpperCase();
  const add = async (url, bytes, name) => { const file = join(root, name); await writeFile(file, bytes, { mode: 0o600 }); files[url] = file; return file; };
  const claudeLatest = await add(`${claudeBase}/latest`, '1.0.0', 'claude-latest');
  await add('https://downloads.claude.ai/keys/claude-code.asc', key.publicKey, 'publisher.asc');
  const codexTarget = process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
  const makeRelease = async (provider, version) => {
    const payload = worker(provider, version, root);
    if (provider !== 'claude') {
      const file = join(root, `${provider}-${version}`);
      await writeFile(file, payload, { mode: 0o700 }); executables[provider] = file;
    }
    if (provider === 'claude') {
      const manifest = JSON.stringify({ version, platforms: { [`darwin-${process.arch}`]: { binary: 'claude', checksum: createHash('sha256').update(payload).digest('hex'), size: payload.length } } });
      const signature = await sign({ message: await createMessage({ binary: Buffer.from(manifest) }), signingKeys: privateKey, detached: true });
      await add(`${claudeBase}/${version}/manifest.json`, manifest, `claude-${version}.json`);
      await add(`${claudeBase}/${version}/manifest.json.sig`, signature, `claude-${version}.sig`);
      await add(`${claudeBase}/${version}/darwin-${process.arch}/claude`, payload, `claude-${version}.bin`);
    } else if (provider === 'agy') {
      const tar = archive('antigravity', payload), url = `https://storage.googleapis.com/antigravity-public/antigravity-cli/${version}/fixture.tar.gz`;
      await add(url, tar, `agy-${version}.tar.gz`);
      await add(`${agyBase}/manifests/darwin_${process.arch === 'x64' ? 'amd64' : 'arm64'}.json`, JSON.stringify({ version, url, sha512: createHash('sha512').update(tar).digest('hex') }), 'agy-latest.json');
    } else {
      const name = `codex-${codexTarget}`, tar = archive(name, payload), url = `https://github.com/openai/codex/releases/download/rust-v${version}/${name}.tar.gz`;
      await add(url, tar, `codex-${version}.tar.gz`);
      const release = JSON.stringify({ tag_name: `rust-v${version}`, html_url: `https://github.com/openai/codex/releases/tag/rust-v${version}`, assets: [{ name: `${name}.tar.gz`, browser_download_url: url, digest: 'sha256:' + createHash('sha256').update(tar).digest('hex'), size: tar.length }] });
      await add(`${codexBase}/tags/rust-v${version}`, release, `codex-${version}.json`);
      files[`${codexBase}/latest`] = files[`${codexBase}/tags/rust-v${version}`];
    }
  };
  await makeRelease('claude', '1.0.0'); await makeRelease('claude', '1.1.0');
  await makeRelease('agy', '1.0.0'); await makeRelease('codex', '0.166.0');
  await writeFile(fixtureFile, JSON.stringify({ files, claudeFingerprint: fingerprint, loginInterpreters: [process.execPath] }), { mode: 0o600 });
  return { fixtureFile, executables, update: () => writeFile(claudeLatest, '1.1.0'), root };
}
