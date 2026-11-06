/**
 * Keep private version directories immutable and activate only complete verified installations.
 * Active pointers change atomically. Retained versions are never garbage-collected by setup.
 * @packageDocumentation
 */
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { chmod, copyFile, mkdtemp, rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { cliPreferencesSchema, type CliPreferences, type CliProvider } from '../../../shared/ai-cli';
import { executableIdentity, type ExecutableIdentity } from '../trusted-executable';
import { extractExecutable } from './archive';
import { releaseSchema, SetupError, versionSchema, type Release } from './types';
import type { VendorNetwork } from './network';
const identitySchema = z.object({ path: z.string(), mtime: z.number(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const pointerSchema = z.object({ current: versionSchema, previous: versionSchema.nullable() }).strict();
const recordSchema = z.object({ release: releaseSchema, identity: identitySchema, completedAt: z.number() }).strict();
const cacheSchema = z.object({ preferences: cliPreferencesSchema, lastAttempt: z.number().nonnegative(), releases: z.record(releaseSchema), checkedAt: z.record(z.number().nonnegative()) }).strict();
export const defaultPreferences: CliPreferences = { updateChecks: false, autoUpdateWhenIdle: false, advancedShell: false };
export function privateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const info = lstatSync(path);
  if (!info.isDirectory() || info.isSymbolicLink() || process.platform !== 'win32' && (info.mode & 0o077)) throw new SetupError('permission-denied');
}
function writeJson(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(file, JSON.stringify(value)); fsyncSync(file); } finally { closeSync(file); }
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
export class SetupStore {
  private cache: z.infer<typeof cacheSchema> = { preferences: { ...defaultPreferences }, lastAttempt: 0, releases: {}, checkedAt: {} };
  readonly root: string;
  constructor(root: string) {
    privateDirectory(root); this.root = realpathSync(root);
    const cache = join(this.root, 'settings.json');
    if (existsSync(cache)) try { this.cache = cacheSchema.parse(JSON.parse(readFileSync(cache, 'utf8'))); } catch { /* Invalid cache never enables a preference. */ }
  }
  get preferences() { return { ...this.cache.preferences }; }
  setPreferences(preferences: CliPreferences) { this.cache.preferences = cliPreferencesSchema.parse(preferences); this.save(); return this.preferences; }
  get lastAttempt() { return this.cache.lastAttempt; }
  attempt(now: number) { this.cache.lastAttempt = now; this.save(); }
  cached(provider: CliProvider) { return this.cache.releases[provider] ?? null; }
  checkedAt(provider: CliProvider) { return this.cache.checkedAt[provider] ?? null; }
  remember(release: Release, now: number) { this.cache.releases[release.provider] = release; this.cache.checkedAt[release.provider] = now; this.save(); }
  private save() { writeJson(join(this.root, 'settings.json'), this.cache); }
  private providerRoot(provider: CliProvider) { const path = join(this.root, provider); privateDirectory(path); return path; }
  private pointer(provider: CliProvider) {
    try { return pointerSchema.parse(JSON.parse(readFileSync(join(this.providerRoot(provider), 'active.json'), 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw new SetupError('blocked'); }
  }
  installation(provider: CliProvider, version: string) {
    const directory = join(this.providerRoot(provider), versionSchema.parse(version));
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new SetupError('blocked');
    const record = recordSchema.parse(JSON.parse(readFileSync(join(directory, 'installed.json'), 'utf8')));
    const expected = join(directory, provider === 'agy' && process.platform === 'win32' ? 'agy.exe' : provider + (process.platform === 'win32' ? '.exe' : ''));
    if (record.release.provider !== provider || record.release.version !== version || record.identity.path !== expected) throw new SetupError('blocked');
    return record;
  }
  active(provider: CliProvider) {
    const pointer = this.pointer(provider);
    return pointer ? { ...this.installation(provider, pointer.current), previous: pointer.previous } : null;
  }
  identity(binary: string): ExecutableIdentity | null {
    if (!['claude', 'codex', 'agy'].includes(binary)) return null;
    return this.active(binary as CliProvider)?.identity ?? null;
  }
  async install(release: Release, network: VendorNetwork, signal: AbortSignal, progress: (bytes: number) => void, canActivate = () => true, validateVersion: (binary: string, version: string) => Promise<void> = async () => {}) {
    const parent = this.providerRoot(release.provider);
    const directory = join(parent, release.version);
    const stage = await mkdtemp(join(parent, '.staging-'));
    try {
      const payload = join(stage, 'payload');
      await network.download(release, payload, signal, progress);
      const binary = join(stage, release.provider + (process.platform === 'win32' ? '.exe' : ''));
      if (release.archive === 'binary') await copyFile(payload, binary);
      else await extractExecutable(payload, binary, release.executable, signal);
      await chmod(binary, 0o700);
      await validateVersion(binary, release.version);
      const identity = await executableIdentity(binary);
      signal.throwIfAborted();
      writeJson(join(stage, 'installed.json'), { release, identity: { ...identity, path: join(directory, basename(binary)) }, completedAt: Date.now() });
      await rm(payload);
      if (!canActivate()) throw new SetupError('busy');
      if (existsSync(directory)) {
        const record = this.installation(release.provider, release.version);
        const actual = await executableIdentity(record.identity.path);
        if (record.identity.hash !== identity.hash || actual.hash !== identity.hash) throw new SetupError('checksum');
      } else await this.promote(stage, directory);
      signal.throwIfAborted();
      if (!canActivate()) throw new SetupError('busy');
      const previous = this.pointer(release.provider)?.current ?? null;
      writeJson(join(parent, 'active.json'), { current: release.version, previous: previous === release.version ? this.pointer(release.provider)?.previous ?? null : previous });
      return this.active(release.provider)!;
    } finally { await rm(stage, { recursive: true, force: true }); }
  }
  private async promote(stage: string, directory: string) {
    for (let attempt = 0; ; attempt++) {
      try { await rename(stage, directory); return; }
      catch (error) {
        if (process.platform !== 'win32' || !['EBUSY', 'EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '') || attempt >= 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 30 * 2 ** attempt));
      }
    }
  }
  async rollback(provider: CliProvider) {
    const pointer = this.pointer(provider);
    if (!pointer?.previous) throw new SetupError('wrong-version');
    const previous = this.installation(provider, pointer.previous);
    const currentIdentity = await executableIdentity(previous.identity.path);
    if (currentIdentity.hash !== previous.identity.hash) throw new SetupError('checksum');
    writeJson(join(this.providerRoot(provider), 'active.json'), { current: pointer.previous, previous: pointer.current });
    return this.active(provider)!;
  }
}
