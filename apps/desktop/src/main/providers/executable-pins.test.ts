/** Explicit executable choice survives managed installs and still rechecks file identity before use. */
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { ExecutablePins } from './executable-pins';
import { executableIdentity } from './trusted-executable';

it('honors a chosen executable until a verified managed activation is requested', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vstudy-pins-'));
  try {
    const custom = join(root, "custom cli 'quoted'.exe"), managed = join(root, 'managed.exe'), file = join(root, 'pins.json');
    await writeFile(custom, 'MZ custom fixture', { mode: 0o700 });
    await writeFile(managed, 'MZ managed fixture', { mode: 0o700 });
    const identity = await executableIdentity(managed), confirm = vi.fn(async () => false);
    const pins = new ExecutablePins(file, confirm); pins.setManagedResolver(() => identity, () => identity.path);
    await pins.choose('claude', custom);
    expect(await pins.describe('claude')).toBe(await realpath(custom));
    expect(await pins.resolve('claude')).toBe(await realpath(custom));
    const restored = new ExecutablePins(file, confirm); restored.setManagedResolver(() => identity, () => identity.path);
    expect(await restored.resolve('claude')).toBe(await realpath(custom));
    expect(confirm).not.toHaveBeenCalled();
    await writeFile(custom, 'MZ changed executable');
    expect(await restored.resolve('claude')).toBeNull();
    expect(confirm).toHaveBeenCalledTimes(1);
    restored.activateManaged('claude', identity);
    expect(await restored.resolve('claude')).toBe(identity.path);
    expect(JSON.parse(await readFile(file, 'utf8')).claude.source).toBe('managed');
  } finally { await rm(root, { recursive: true, force: true }); }
});
