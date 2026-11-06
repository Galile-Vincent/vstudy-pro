/**
 * Parse publisher release metadata and verify Claude's detached signature before trusting hashes.
 * Codex installation remains pinned to the audited macOS transport version.
 * @packageDocumentation
 */
import { createMessage, readKey, readSignature, verify } from 'openpgp';
import { z } from 'zod';
import type { CliProvider } from '../../../shared/ai-cli';
import { VendorNetwork, vendorUrl } from './network';
import { releaseSchema, SetupError, versionSchema, type Release } from './types';
export const claudeFingerprint = '31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE';
const claudeBase = 'https://downloads.claude.ai/claude-code-releases';
const agyBase = 'https://antigravity-cli-auto-updater-974169037036.us-central1.run.app';
const codexBase = 'https://api.github.com/repos/openai/codex/releases';
export const auditedCodex = '0.166.0';
export async function verifyClaudeManifest(manifest: string, signature: string | Uint8Array, armoredKey: string, fingerprint = claudeFingerprint) {
  try {
    const key = await readKey({ armoredKey });
    if (key.getFingerprint().toUpperCase() !== fingerprint) throw new Error('Key fingerprint');
    const armored = typeof signature === 'string' ? signature : Buffer.from(signature).toString('utf8');
    const detached = armored.startsWith('-----BEGIN PGP SIGNATURE-----') ? await readSignature({ armoredSignature: armored }) : await readSignature({ binarySignature: typeof signature === 'string' ? Buffer.from(signature) : signature });
    const result = await verify({ message: await createMessage({ binary: Buffer.from(manifest) }), signature: detached, verificationKeys: key });
    if (!result.signatures.length) throw new Error('No signature');
    for (const entry of result.signatures) await entry.verified;
  } catch { throw new SetupError('signature'); }
}
export function platformKey(provider: CliProvider, platform: string, arch: string) {
  if (!['darwin', 'linux', 'win32'].includes(platform) || !['arm64', 'x64'].includes(arch)) throw new SetupError('unsupported');
  if (provider === 'codex') {
    if (platform !== 'darwin') throw new SetupError('unsupported');
    return `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
  }
  return provider === 'claude' ? `${platform}-${arch}` : `${platform === 'win32' ? 'windows' : platform}_${arch === 'x64' ? 'amd64' : 'arm64'}`;
}
const assetSchema = z.object({ name: z.string(), browser_download_url: z.string().url(), digest: z.string().nullable(), size: z.number().int().positive() });
const githubSchema = z.object({ tag_name: z.string(), html_url: z.string().url(), assets: z.array(assetSchema) });
export class ReleaseSource {
  constructor(readonly network: VendorNetwork, readonly platform = process.platform, readonly arch = process.arch, private readonly fingerprint = claudeFingerprint) {}
  async latest(provider: CliProvider, signal: AbortSignal): Promise<Release> {
    try {
      if (provider === 'claude') return await this.claude(signal);
      if (provider === 'agy') return await this.agy(signal);
      return await this.codex(signal, false);
    } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) throw new SetupError('wrong-version'); throw error; }
  }
  async installable(provider: CliProvider, signal: AbortSignal): Promise<Release> {
    return provider === 'codex' ? this.codex(signal, true) : this.latest(provider, signal);
  }
  private async claude(signal: AbortSignal) {
    const version = versionSchema.parse((await this.network.text('claude', `${claudeBase}/latest`, signal, 200)).trim());
    const manifest = await this.network.text('claude', `${claudeBase}/${version}/manifest.json`, signal);
    const signature = await this.network.bytes('claude', `${claudeBase}/${version}/manifest.json.sig`, signal, 100_000);
    const key = await this.network.text('claude', 'https://downloads.claude.ai/keys/claude-code.asc', signal, 100_000);
    await verifyClaudeManifest(manifest, signature, key, this.fingerprint);
    const data = z.object({ version: versionSchema, platforms: z.record(z.object({ binary: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive() })) }).parse(JSON.parse(manifest));
    const platform = platformKey('claude', this.platform, this.arch);
    const entry = data.platforms[platform];
    if (!entry) throw new SetupError('unsupported');
    if (data.version !== version || entry.binary !== (this.platform === 'win32' ? 'claude.exe' : 'claude')) throw new SetupError('wrong-version');
    return releaseSchema.parse({ provider: 'claude', version, url: `${claudeBase}/${version}/${platform}/${entry.binary}`, notes: 'https://code.claude.com/docs/en/changelog', algorithm: 'sha256', digest: entry.checksum, size: entry.size, archive: 'binary', executable: entry.binary, evidence: JSON.stringify({ manifest, signature: signature.toString('base64'), fingerprint: this.fingerprint }) });
  }
  private async agy(signal: AbortSignal) {
    const raw = await this.network.text('agy', `${agyBase}/manifests/${platformKey('agy', this.platform, this.arch)}.json`, signal);
    const data = z.object({ version: versionSchema, url: z.string().url(), sha512: z.string().regex(/^[a-f0-9]{128}$/) }).parse(JSON.parse(raw));
    const url = vendorUrl('agy', data.url);
    const archive = new URL(url).pathname.endsWith('.tar.gz') ? 'tar.gz' : 'binary';
    if (this.platform !== 'win32' && archive !== 'tar.gz' || this.platform === 'win32' && !new URL(url).pathname.endsWith('.exe')) throw new SetupError('unsupported');
    return releaseSchema.parse({ provider: 'agy', version: data.version, url, notes: 'https://antigravity.google/docs/changelog', algorithm: 'sha512', digest: data.sha512, size: null, archive, executable: this.platform === 'win32' ? 'agy.exe' : 'antigravity', evidence: raw });
  }
  private async codex(signal: AbortSignal, audited: boolean) {
    const platform = platformKey('codex', this.platform, this.arch);
    const raw = await this.network.text('codex', `${codexBase}/${audited ? `tags/rust-v${auditedCodex}` : 'latest'}`, signal);
    const data = githubSchema.parse(JSON.parse(raw));
    const version = versionSchema.parse(data.tag_name.replace(/^rust-v/, ''));
    if (audited && version !== auditedCodex) throw new SetupError('wrong-version');
    const executable = `codex-${platform}`;
    const asset = data.assets.find(a => a.name === `${executable}.tar.gz`);
    if (!asset?.digest?.match(/^sha256:[a-f0-9]{64}$/)) throw new SetupError('checksum');
    return releaseSchema.parse({ provider: 'codex', version, url: vendorUrl('codex', asset.browser_download_url), notes: vendorUrl('codex', data.html_url), algorithm: 'sha256', digest: asset.digest.slice(7), size: asset.size, archive: 'tar.gz', executable, evidence: raw });
  }
}
