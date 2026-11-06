/** Build the missing Intel Mac cryptography wheel from verified sources before tests or packaging. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';

const resources = fileURLToPath(new URL('../resources/converter/', import.meta.url));
const cryptoVersion = '50.0.2';
const openssl = {
  version: '3.5.9',
  url: 'https://github.com/openssl/openssl/releases/download/openssl-3.5.9/openssl-3.5.9.tar.gz',
  sha256: '603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a',
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

/** Retain every upstream hash and add only the wheel built from that same locked package version. */
export function nativeRequirements(lock, version, wheelHash) {
  if (!/^[a-f0-9]{64}$/.test(wheelHash) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid native wheel identity');
  const header = `cryptography==${version} \\\n`;
  if (!lock.includes(header) || lock.split(header).length !== 2) throw new Error('Native wheel version must match the unique locked cryptography version');
  return lock.replace(header, `${header}    --hash=sha256:${wheelHash} \\\n`);
}

/** otool -L includes LC_ID_DYLIB before load dependencies; that self identity does not load another file. */
export function assertStaticLinkage(linkage, identity) {
  for (const line of linkage.split('\n').slice(1)) {
    const library = line.trim().split(' (compatibility version')[0];
    if (!library || library === identity) continue;
    if (!library.startsWith('/usr/lib/') && !library.startsWith('/System/Library/')) {
      throw new Error(`Native wheel has a non-system load dependency: ${library}`);
    }
  }
}

/** Packaging must never start a compiler after signing credentials enter its environment. */
export async function verifyNativeConverter(directory = resources) {
  const lock = await readFile(join(directory, 'requirements.lock.txt'), 'utf8');
  const buildLock = await readFile(join(directory, 'requirements-build.lock.txt'), 'utf8');
  const manifest = JSON.parse(await readFile(join(directory, 'wheels', 'native.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.version !== cryptoVersion || manifest.sourceLockSha256 !== digest(lock) || manifest.buildLockSha256 !== digest(buildLock) || manifest.openssl?.sha256 !== openssl.sha256 ||
      !/^cryptography-50\.0\.2-[\w.]+-[\w.]+-macosx_[\d_]+_x86_64\.whl$/.test(manifest.file)) throw new Error('Native converter build is stale or invalid');
  const wheel = await readFile(join(directory, 'wheels', manifest.file));
  if (digest(wheel) !== manifest.sha256 || await readFile(join(directory, 'requirements.native.lock.txt'), 'utf8') !== nativeRequirements(lock, cryptoVersion, manifest.sha256)) {
    throw new Error('Native converter wheel or lock checksum mismatch');
  }
  return manifest;
}

async function download(url, expected) {
  const response = await globalThis.fetch(url);
  if (!response.ok) throw new Error(`Native source download failed with HTTP ${response.status}`);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 128 * 1024 * 1024) throw new Error('Native source archive exceeds limit');
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  if (digest(archive) !== expected) throw new Error('Native source archive checksum mismatch');
  return archive;
}

async function buildNativeConverter() {
  if (process.platform !== 'darwin' || process.arch !== 'x64') {
    console.log('No supplemental converter wheel is needed for this host.');
    return;
  }
  try { await verifyNativeConverter(); console.log('Verified existing Intel Mac converter wheel.'); return; }
  catch { /* A changed source lock requires a fresh native wheel and hash overlay. */ }
  const lock = await readFile(join(resources, 'requirements.lock.txt'), 'utf8');
  const entry = /^cryptography==50\.0\.2[^\n]*\n(?:[ \t]+[^\n]*\n)*/m.exec(lock)?.[0];
  if (!entry) throw new Error('Update the native wheel builder when updating cryptography');
  const metadata = await globalThis.fetch(`https://pypi.org/pypi/cryptography/${cryptoVersion}/json`).then(response => {
    if (!response.ok) throw new Error('Could not read the pinned cryptography source metadata');
    return response.json();
  });
  const source = metadata.urls.find(item => item.packagetype === 'sdist');
  const sourceUrl = source && new URL(source.url);
  if (!sourceUrl || sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'files.pythonhosted.org' || sourceUrl.port || sourceUrl.username || sourceUrl.password || !entry.includes(`--hash=sha256:${source.digests.sha256}`)) {
    throw new Error('The cryptography source must match an upstream hash already in the runtime lock');
  }
  const rust = execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim();
  const root = await mkdtemp(join(tmpdir(), 'vstudy-converter-build-'));
  const wheels = join(resources, 'wheels');
  const environment = { ...process.env, MACOSX_DEPLOYMENT_TARGET: '13.0', CARGO_BUILD_JOBS: '2',
    OPENSSL_DIR: join(root, 'openssl'), OPENSSL_STATIC: '1', CFLAGS: '-mmacosx-version-min=13.0 -march=x86-64', RUSTFLAGS: '-C target-cpu=x86-64' };
  const execute = (command, args, cwd = root) => execFileSync(command, args, { cwd, env: environment, stdio: 'inherit', timeout: 20 * 60 * 1000 });
  let uv;
  for (const candidate of [join(homedir(), '.local', 'bin', 'uv'), '/usr/local/bin/uv', '/opt/homebrew/bin/uv']) {
    if (await access(candidate, constants.X_OK).then(() => true, () => false)) { uv = candidate; break; }
  }
  if (!uv) throw new Error('Install uv in its standard user or Homebrew location before building the native converter');
  try {
    const [cryptoArchive, opensslArchive] = await Promise.all([download(source.url, source.digests.sha256), download(openssl.url, openssl.sha256)]);
    const cryptoSource = join(root, 'cryptography.tar.gz');
    const opensslSource = join(root, 'openssl.tar.gz');
    await writeFile(cryptoSource, cryptoArchive);
    await writeFile(opensslSource, opensslArchive);
    execute('/usr/bin/tar', ['-xzf', opensslSource, '-C', root]);
    const sourceDirectory = join(root, `openssl-${openssl.version}`);
    execute(join(sourceDirectory, 'Configure'), ['darwin64-x86_64-cc', 'no-shared', 'no-tests', 'no-module', 'no-autoload-config', `--prefix=${environment.OPENSSL_DIR}`], sourceDirectory);
    execute('/usr/bin/make', ['-j2'], sourceDirectory);
    execute('/usr/bin/make', ['install_sw'], sourceDirectory);
    const builder = join(root, 'builder');
    const python = join(builder, 'bin', 'python');
    execute(uv, ['--no-config', 'venv', '--python', '3.10', builder]);
    execute(uv, ['--no-config', 'pip', 'install', '--require-hashes', '--python', python, '-r', join(resources, 'requirements-build.lock.txt')]);
    await rm(wheels, { recursive: true, force: true });
    await mkdir(wheels, { recursive: true });
    execute(uv, ['--no-config', 'build', '--wheel', '--python', python, '--no-build-isolation', '--out-dir', wheels, cryptoSource]);
    const files = (await readdir(wheels)).filter(file => file.endsWith('.whl'));
    if (files.length !== 1 || !/^cryptography-50\.0\.2-[\w.]+-[\w.]+-macosx_[\d_]+_x86_64\.whl$/.test(files[0])) throw new Error('Expected exactly one native Intel Mac cryptography wheel');
    const wheelPath = join(wheels, files[0]);
    const binary = join(root, 'cryptography.so');
    const members = execFileSync('/usr/bin/unzip', ['-Z1', wheelPath], { encoding: 'utf8' }).split('\n');
    const member = members.find(file => /^cryptography\/hazmat\/bindings\/_rust\.[\w.-]+\.so$/.test(file));
    if (!member) throw new Error('Native wheel does not contain the expected cryptography binding');
    await writeFile(binary, execFileSync('/usr/bin/unzip', ['-p', wheelPath, member], { maxBuffer: 64 * 1024 * 1024 }));
    const linkage = execFileSync('/usr/bin/otool', ['-L', binary], { encoding: 'utf8' });
    const identity = execFileSync('/usr/bin/otool', ['-D', binary], { encoding: 'utf8' }).split('\n').slice(1).map(line => line.trim()).find(Boolean);
    assertStaticLinkage(linkage, identity);
    const wheelHash = digest(await readFile(wheelPath));
    const manifest = { schemaVersion: 1, file: files[0], version: cryptoVersion, sha256: wheelHash,
      sourceLockSha256: digest(lock), buildLockSha256: digest(await readFile(join(resources, 'requirements-build.lock.txt'))),
      sourceSha256: source.digests.sha256, openssl, minimumMacOS: '13.0', linkage, rust };
    await writeFile(join(resources, 'requirements.native.lock.txt'), nativeRequirements(lock, cryptoVersion, wheelHash));
    await writeFile(join(wheels, 'native.json'), JSON.stringify(manifest, null, 2) + '\n');
    await verifyNativeConverter();
    console.log(`Verified static Intel Mac cryptography ${cryptoVersion} wheel ${files[0]}.`);
  } finally { await rm(root, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildNativeConverter();
