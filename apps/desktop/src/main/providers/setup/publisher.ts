/** Verify Claude release signatures using the application-pinned publisher key fingerprint. @packageDocumentation */
import { createMessage, readKey, readSignature, verify } from 'openpgp';
import { SetupError } from './types';
export const claudeFingerprint = '31DDDE24DDFAB679F42D7BD2BAA929FF1A7ECACE';
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
