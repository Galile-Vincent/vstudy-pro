/** Import the Developer ID certificate into a private keychain this job owns, then hand its identity to electron-builder. */
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const security = (...args) => execFileSync('/usr/bin/security', args, { encoding: 'utf8' });

export function identityName(output) {
  const match = /"Developer ID Application: ([^"\n]+)"/.exec(output);
  if (!match) throw new Error('No Developer ID Application identity was found in the private keychain');
  return match[1];
}

export function certificateBytes(value) {
  if (existsSync(value)) return readFileSync(value);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 64) throw new Error('CSC_LINK must be a base64 P12 or an existing P12 path');
  return bytes;
}

export function installSigningKeychain(env) {
  const link = env.CSC_LINK ?? '', password = env.CSC_KEY_PASSWORD ?? '';
  if (!link && !password) return null;
  if (!link || !password) throw new Error('Incomplete certificate credentials; CSC_LINK and CSC_KEY_PASSWORD are both required');
  if (!env.GITHUB_ENV) throw new Error('GITHUB_ENV is required to pass the identity to the packaging step');
  const directory = mkdtempSync(join(env.RUNNER_TEMP || tmpdir(), 'vstudy-signing-'));
  const keychain = join(directory, 'signing.keychain-db');
  const certificate = join(directory, 'certificate.p12');
  const keychainPassword = randomBytes(24).toString('base64');
  try {
    writeFileSync(certificate, certificateBytes(link), { mode: 0o600 });
    security('create-keychain', '-p', keychainPassword, keychain);
    security('set-keychain-settings', '-lut', '21600', keychain);
    security('unlock-keychain', '-p', keychainPassword, keychain);
    security('import', certificate, '-k', keychain, '-P', password, '-T', '/usr/bin/codesign', '-T', '/usr/bin/productbuild');
    security('set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-s', '-k', keychainPassword, keychain);
    const existing = security('list-keychains', '-d', 'user').split('\n').map(line => line.trim().replace(/^"|"$/g, '')).filter(Boolean);
    security('list-keychains', '-d', 'user', '-s', keychain, ...existing.filter(path => path !== keychain));
    const name = identityName(security('find-identity', '-v', '-p', 'codesigning', keychain));
    appendFileSync(env.GITHUB_ENV, `CSC_NAME=${name}\nCSC_KEYCHAIN=${keychain}\n`);
    return { name, keychain };
  } finally {
    rmSync(certificate, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = installSigningKeychain(process.env);
  console.log(result ? `Developer ID identity ready: ${result.name}` : 'No certificate credentials; leaving signing to the packaging contract');
}
