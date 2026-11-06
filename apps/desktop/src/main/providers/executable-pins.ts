/**
 * Persist approved CLI executable identities and reject unconfirmed changes.
 * Owned by main/providers.
 * Integrations are opt-in; subprocesses use argv arrays and release resources on cancellation.
 * @packageDocumentation
 */
import { atomicWriteSync } from "../storage/atomic";
import { readFileSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { executableMetadata, executableIdentity, resolveInstalledExecutable, type ExecutableIdentity } from './trusted-executable';
const identitySchema = z.object({ path:z.string(), mtime:z.number(), hash:z.string(), source:z.enum(['custom', 'managed']).optional() });
const pinsSchema = z.record(identitySchema);
/** Persist user-approved executable hashes and require renewed approval when files change. */
export class ExecutablePins {
  private pins: Record<string, ExecutableIdentity & { source?: 'custom' | 'managed' | undefined }> = {};
  private managed: (binary: string) => Promise<ExecutableIdentity | null> | ExecutableIdentity | null = () => null;
  private managedPath: (binary: string) => string | null = () => null;
  setManagedResolver(resolve: (binary: string) => Promise<ExecutableIdentity | null> | ExecutableIdentity | null, describe: (binary: string) => string | null) { this.managed = resolve; this.managedPath = describe; }
  private pending = new Map<string, Promise<string | null>>();
  constructor(private file: string, private confirm: (previous: ExecutableIdentity, current: ExecutableIdentity) => Promise<boolean>) {
    if (existsSync(file)) this.pins = pinsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  }
  private save() {
    atomicWriteSync(this.file, JSON.stringify(this.pins));
  }
  async choose(binary: string, path: string) {
    const identity = await executableIdentity(path);
    this.pins[binary] = { ...identity, source: 'custom' };
    this.save();
    return identity.path;
  }
  activateManaged(binary: string, identity: ExecutableIdentity) {
    this.pins[binary] = { ...identity, source: 'managed' }; this.save();
  }
  describe(binary: string): Promise<string | null> { const pin = this.pins[binary]; const path = pin?.source === 'custom' ? pin.path : this.managedPath(binary) ?? pin?.path; return path ? executableMetadata(path).then(metadata=>metadata.path).catch(()=>null) : resolveInstalledExecutable(binary); }
  resolve(binary: string): Promise<string | null> {
    const managed = this.pins[binary]?.source === 'custom' ? null : this.managedPath(binary);
    const key = `${binary}:${managed ?? this.pins[binary]?.path ?? ''}`;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const work = this.check(binary, managed).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }
  private async check(binary: string, managed: string | null) {
    const pin = this.pins[binary];
    const previous = pin;
    const path = managed ?? previous?.path ?? await resolveInstalledExecutable(binary);
    if (!path) return null;
    const current = await executableIdentity(path);
    const expected = previous ? { path: previous.path, mtime: previous.mtime, hash: previous.hash } : null;
    if (expected && JSON.stringify(expected) !== JSON.stringify(current) && !await this.confirm(expected, current)) return null;
    if (managed || pin?.source === 'managed') {
      const verified = await this.managed(binary);
      if (!verified || verified.path !== current.path || verified.hash !== current.hash || verified.mtime !== current.mtime) return null;
    }
    if (this.pins[binary] === pin) {
      this.pins[binary] = { ...current, source: managed ? 'managed' : pin?.source };
      this.save();
    }
    return current.path;
  }
}
let active: ExecutablePins | undefined;
/** Install the application-owned executable trust store for CLI resolution. */
export function setExecutablePins(pins: ExecutablePins) { active = pins; }
/** Resolve an executable only when its current identity matches user approval. */
export function pinnedCli(binary: string) { return active ? active.resolve(binary) : resolveInstalledExecutable(binary); }

/** Read an explicit CLI path without executing the configured binary. */
export function configuredCliPath(binary: string) { return active ? active.describe(binary) : resolveInstalledExecutable(binary); }
