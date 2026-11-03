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
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export function createSecretStore(file: string, encryption: Encryption) {
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
  return {
    set(providerId: ProviderId, key: string): void {
      providerIdSchema.parse(providerId);
      z.string().min(1).max(16384).parse(key);
      if (!encryption.isEncryptionAvailable())
        throw new Error("Secure key storage is unavailable");
      write({
        ...read(),
        [providerId]: encryption.encryptString(key).toString("base64"),
      });
    },
    has(providerId: ProviderId): boolean {
      return Object.hasOwn(read(), providerIdSchema.parse(providerId));
    },
    delete(providerId: ProviderId): void {
      const values = read();
      delete values[providerIdSchema.parse(providerId)];
      write(values);
    },
    getInMainOnly(providerId: ProviderId): string | null {
      const value = read()[providerIdSchema.parse(providerId)];
      if (value === undefined) return null;
      if (!encryption.isEncryptionAvailable())
        throw new Error("Secure key storage is unavailable");
      const ciphertext = Buffer.from(value, "base64");
      try { return encryption.decryptString(ciphertext); } finally { ciphertext.fill(0); }
    },
  };
}
export type SecretStore = ReturnType<typeof createSecretStore>;
