import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { providerIdSchema } from "../../shared/domain";

type ProviderId = z.infer<typeof providerIdSchema>;
export interface Encryption {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string }>;
}
export function createSecretStore(file: string, encryption: Encryption, timeoutMs = 10_000) {
  if (existsSync(file)) chmodSync(file, 0o600);
  function read(): Record<string, string> {
    if (!existsSync(file)) return {};
    chmodSync(file, 0o600);
    return z
      .record(providerIdSchema, z.string())
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('errors.keychain_unavailable')), timeoutMs);
      })]);
    } catch { throw new Error('errors.keychain_unavailable'); }
    finally { clearTimeout(timer); }
  }
  const unlocked = new Map<ProviderId, string>();
  let compatibleOrigin: string | undefined;
  const generations = new Map<ProviderId, number>();
  const bump = (id: ProviderId) => { const next = (generations.get(id) ?? 0) + 1; generations.set(id, next); unlocked.delete(id); return next; };
  return {
    bindCompatibleOrigin(origin: string): void {
      const canonical = new URL(origin).origin;
      if (compatibleOrigin === canonical) return;
      bump('openai-compatible');
      if (compatibleOrigin !== undefined) {
        const values = read(); delete values['openai-compatible']; write(values);
      }
      compatibleOrigin = canonical;
    },
    async set(providerId: ProviderId, key: string): Promise<void> {
      providerIdSchema.parse(providerId);
      z.string().min(1).max(16384).parse(key);
      const generation = bump(providerId);
      if (!await access(() => encryption.isAsyncEncryptionAvailable()))
        throw new Error("errors.keychain_unavailable");
      if (generations.get(providerId) !== generation) return;
      const ciphertext = await access(() => encryption.encryptStringAsync(key));
      if (generations.get(providerId) !== generation) return;
      write({ ...read(), [providerId]: ciphertext.toString("base64") });
      unlocked.set(providerId, key);
    },
    useInSession(providerId: ProviderId, key: string): void { bump(providerId); unlocked.set(providerIdSchema.parse(providerId), z.string().min(1).max(16384).parse(key)); },
    isUnlocked(providerId: ProviderId): boolean { return unlocked.has(providerId); },
    has(providerId: ProviderId): boolean {
      return Object.hasOwn(read(), providerIdSchema.parse(providerId));
    },
    delete(providerId: ProviderId): void {
      bump(providerId);
      const values = read();
      delete values[providerIdSchema.parse(providerId)];
      write(values);
    },
    async getInMainOnly(providerId: ProviderId): Promise<string | null> {
      if (unlocked.has(providerId)) return unlocked.get(providerId)!;
      const generation = generations.get(providerId) ?? 0;
      const current = () => (generations.get(providerId) ?? 0) === generation;
      const value = read()[providerIdSchema.parse(providerId)];
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
