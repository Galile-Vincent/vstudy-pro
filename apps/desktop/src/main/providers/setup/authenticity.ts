/** Independent execution authority. Feed-provided checksums and installation JSON never grant trust. @packageDocumentation */
import { z } from 'zod';
import { executableIdentity } from '../trusted-executable';
import { codexPins } from './codex-pins';
import { claudeFingerprint, verifyClaudeManifest } from './publisher';
import { claudePublisherKey } from './publisher-key';
import { SetupError, type Release } from './types';

export type VerifyArtifact = (release: Release, binary: string, signal: AbortSignal) => Promise<void>;
const signedManifest = z.object({ version: z.string(), platforms: z.record(z.object({ binary: z.string(), checksum: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().positive() })) });
const evidenceSchema = z.object({ manifest: z.string().max(2_000_000), signature: z.string().max(200_000), key: z.string().max(100_000).optional() });
export const codexTarget = (platform: string, arch: string) => platform === 'darwin' && ['arm64', 'x64'].includes(arch) ? `${arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin` : '';
export function codexPin(version: string, platform = process.platform, arch = process.arch) {
  return codexPins[version]?.[codexTarget(platform, arch)] ?? null;
}
export function manualInstallation(provider: Release['provider'], release?: Release | null, platform = process.platform, arch = process.arch) {
  if (provider === 'claude') return false;
  if (provider === 'agy') return true;
  const pin = codexPin(release?.version ?? '0.166.0', platform, arch);
  return !pin || !!release && (release.algorithm !== 'sha256' || release.digest !== pin.archiveSha256);
}

/** The default verifier also runs when a managed record is loaded for a provider launch. */
export function artifactVerifier(fingerprint = claudeFingerprint): VerifyArtifact {
  return async (release, binary, signal) => {
    signal.throwIfAborted();
    const identity = await executableIdentity(binary);
    signal.throwIfAborted();
    if (release.provider === 'codex') {
      const pin = codexPin(release.version);
      if (!pin) throw new SetupError('manual-install-required');
      if (release.algorithm !== 'sha256' || release.digest !== pin.archiveSha256 || identity.hash !== pin.binarySha256) throw new SetupError('signature');
    } else if (release.provider === 'claude') {
      try {
        const evidence = evidenceSchema.parse(JSON.parse(release.evidence));
        await verifyClaudeManifest(evidence.manifest, Buffer.from(evidence.signature, 'base64'), evidence.key ?? claudePublisherKey, fingerprint);
        const manifest = signedManifest.parse(JSON.parse(evidence.manifest));
        const entry = manifest.platforms[`${process.platform}-${process.arch}`];
        if (!entry || manifest.version !== release.version || entry.binary !== (process.platform === 'win32' ? 'claude.exe' : 'claude') || release.archive !== 'binary' || release.algorithm !== 'sha256' || entry.checksum !== release.digest || identity.hash !== entry.checksum) throw new Error('Artifact differs from signed manifest');
      } catch { throw new SetupError('signature'); }
    } else throw new SetupError('manual-install-required');
    signal.throwIfAborted();
  };
}
