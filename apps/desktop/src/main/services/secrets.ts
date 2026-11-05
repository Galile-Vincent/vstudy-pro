import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import { providerIdSchema } from "../../shared/domain";

type ProviderId = z.infer<typeof providerIdSchema>;
const secretIdSchema = z.union([providerIdSchema, z.string().regex(/^moodle:[0-9a-f-]{36}$/).refine(value => z.string().uuid().safeParse(value.slice(7)).success)]);
type SecretId = ProviderId | `moodle:${string}`;
export const moodleSecretId = (accountId: string): `moodle:${string}` => `moodle:${z.string().uuid().parse(accountId)}`;
export interface Encryption {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string }>;
}
export function createSecretStore(file: string, encryption: Encryption) {
  if (existsSync(file)) chmodSync(file, 0o600);
  function read(): Record<string, string> {
    if (!existsSync(file)) return {};
    chmodSync(file, 0o600);
    return z
      .record(secretIdSchema, z.string())
      .parse(JSON.parse(readFileSync(file, "utf8")));
  }
  function write(values: Record<string, string>): void {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(values), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, file);
  }
  async function access<T>(operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch { throw new Error('errors.keychain_unavailable'); }
  }
  let preflight: Promise<void> | undefined;

  const unlocked = new Map<SecretId, string>();
  let compatibleOrigin: string | undefined;
  const generations = new Map<SecretId, number>();
  const bump = (id: SecretId) => { const next = (generations.get(id) ?? 0) + 1; generations.set(id, next); unlocked.delete(id); return next; };
  return {
    preflight(): Promise<void> {
      preflight ??= access(async () => {
        if (!await encryption.isAsyncEncryptionAvailable()) throw new Error('unavailable');
        const canary = randomBytes(32).toString('hex');
        const ciphertext = await encryption.encryptStringAsync(canary);
        try {
          if ((await encryption.decryptStringAsync(ciphertext)).result !== canary) throw new Error('round trip failed');
        } finally { ciphertext.fill(0); }
      }).catch(error => { preflight = undefined; throw error; });
      return preflight;
    },
    bindCompatibleOrigin(origin: string): void {
      const canonical = new URL(origin).origin;
      if (compatibleOrigin === canonical) return;
      bump('openai-compatible');
      if (compatibleOrigin !== undefined) {
        const values = read(); delete values['openai-compatible']; write(values);
      }
      compatibleOrigin = canonical;
    },
    async set(providerId: SecretId, key: string): Promise<void> {
      secretIdSchema.parse(providerId);
      z.string().min(1).max(16384).parse(key);
      const previous = unlocked.get(providerId);
      const generation = bump(providerId);
      if (previous !== undefined) unlocked.set(providerId, previous);
      if (!await access(() => encryption.isAsyncEncryptionAvailable()))
        throw new Error("errors.keychain_unavailable");
      if (generations.get(providerId) !== generation) return;
      const ciphertext = await access(() => encryption.encryptStringAsync(key));
      if (generations.get(providerId) !== generation) return;
      write({ ...read(), [providerId]: ciphertext.toString("base64") });
      unlocked.set(providerId, key);
    },
    useInSession(providerId: SecretId, key: string): void { secretIdSchema.parse(providerId); bump(providerId); unlocked.set(providerId, z.string().min(1).max(16384).parse(key)); },
    isUnlocked(providerId: SecretId): boolean { return unlocked.has(providerId); },
    has(providerId: SecretId): boolean {
      return Object.hasOwn(read(), secretIdSchema.parse(providerId));
    },
    delete(providerId: SecretId): void {
      bump(providerId);
      const values = read();
      delete values[secretIdSchema.parse(providerId)];
      write(values);
    },
    async getInMainOnly(providerId: SecretId): Promise<string | null> {
      if (unlocked.has(providerId)) return unlocked.get(providerId)!;
      const generation = generations.get(providerId) ?? 0;
      const current = () => (generations.get(providerId) ?? 0) === generation;
      const value = read()[secretIdSchema.parse(providerId)];
      if (value === undefined) return null;
      if (!await access(() => encryption.isAsyncEncryptionAvailable()))
        throw new Error("errors.keychain_unavailable");
      if (!current()) return null;
      const ciphertext = Buffer.from(value, "base64");
      try { const result = (await access(() => encryption.decryptStringAsync(ciphertext))).result; if (!current()) return null; unlocked.set(providerId, result); return result; } finally { ciphertext.fill(0); }
    },
  };
}
export type SecretStore = ReturnType<typeof createSecretStore>;
