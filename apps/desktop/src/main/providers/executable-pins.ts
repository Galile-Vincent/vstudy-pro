import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { executableMetadata, executableIdentity, resolveInstalledExecutable, type ExecutableIdentity } from './trusted-executable';
const identitySchema = z.object({ path:z.string(), mtime:z.number(), hash:z.string() });
const pinsSchema = z.record(identitySchema);
export class ExecutablePins {
  private pins: Record<string, ExecutableIdentity> = {};
  private pending = new Map<string, Promise<string | null>>();
  constructor(private file: string, private confirm: (previous: ExecutableIdentity, current: ExecutableIdentity) => Promise<boolean>) {
    if (existsSync(file)) this.pins = pinsSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  }
  private save() {
    writeFileSync(this.file + '.tmp', JSON.stringify(this.pins), {mode:0o600});
    renameSync(this.file + '.tmp', this.file);
  }
  async choose(binary: string, path: string) {
    const identity = await executableIdentity(path);
    this.pins[binary] = identity;
    this.save();
    return identity.path;
  }
  describe(binary: string): Promise<string | null> { return this.pins[binary] ? executableMetadata(this.pins[binary]!.path).then(metadata=>metadata.path).catch(()=>null) : resolveInstalledExecutable(binary); }
  resolve(binary: string): Promise<string | null> {
    const pending = this.pending.get(binary);
    if (pending) return pending;
    const work = this.check(binary).finally(() => this.pending.delete(binary));
    this.pending.set(binary, work);
    return work;
  }
  private async check(binary: string) {
    const previous = this.pins[binary];
    const path = previous?.path ?? await resolveInstalledExecutable(binary);
    if (!path) return null;
    const current = await executableIdentity(path);
    if (previous && JSON.stringify(previous) !== JSON.stringify(current) && !await this.confirm(previous, current)) return null;
    this.pins[binary] = current;
    this.save();
    return current.path;
  }
}
let active: ExecutablePins | undefined;
export function setExecutablePins(pins: ExecutablePins) { active = pins; }
export function pinnedCli(binary: string) { return active ? active.resolve(binary) : resolveInstalledExecutable(binary); }

export function configuredCliPath(binary: string) { return active ? active.describe(binary) : resolveInstalledExecutable(binary); }
