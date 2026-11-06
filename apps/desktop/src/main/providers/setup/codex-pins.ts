/**
 * Reviewed SHA-256 pins for audited native Codex archives and executables.
 * Authentication uses these values independently of release-feed digests.
 * @packageDocumentation
 */
export const codexPins: Readonly<Record<string, Readonly<Record<string, { archiveSha256: string; binarySha256: string }>>>> = {
  '0.166.0': {
    'aarch64-apple-darwin': {
      archiveSha256: 'c48824462fc57681eafb0925d97b11b589010475613904f570b42fea53e240d5',
      binarySha256: '39acf979729dd290f9a24ee38b2914e036c91b65952872e28ae2a6b88a7db7c1',
    },
    'x86_64-apple-darwin': {
      archiveSha256: 'db0c38713c36199b12e7c8d1629386c35a4ce8f99e1c9ce72f1725a74df67b57',
      binarySha256: '1361e18268866b7f9f5e8703fabcea0a2a990a439eedcce03940abb4ba9eaaeb',
    },
  },
};
