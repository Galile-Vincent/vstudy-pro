import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSecretStore, type Encryption } from "./secrets";
const paths: string[] = [];
afterEach(() => {
  for (const path of paths.splice(0))
    rmSync(path, { recursive: true, force: true });
});
function fixture(available = true) {
  const path = mkdtempSync(join(tmpdir(), "vstudy-secret-"));
  paths.push(path);
  const file = join(path, "secrets.json");
  const encryption: Encryption = {
    isEncryptionAvailable: () => available,
    encryptString: (value) =>
      Buffer.from(Buffer.from(value).map((byte) => byte ^ 42)),
    decryptString: (value) =>
      Buffer.from(value.map((byte) => byte ^ 42)).toString(),
  };
  return { file, store: createSecretStore(file, encryption), encryption };
}
it("encrypts, persists with 0600, replaces, and deletes keys", () => {
  const { store, file, encryption } = fixture();
  expect(store.has("openai-api")).toBe(false);
  expect(store.getInMainOnly("openai-api")).toBeNull();
  store.set("openai-api", "secret-api-key");
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(readFileSync(file, "utf8")).not.toContain("secret-api-key");
  expect(createSecretStore(file, encryption).getInMainOnly("openai-api")).toBe(
    "secret-api-key",
  );
  store.set("openai-api", "replacement");
  expect(store.getInMainOnly("openai-api")).toBe("replacement");
  store.delete("openai-api");
  expect(store.has("openai-api")).toBe(false);
});
it("fails closed when OS encryption is unavailable", () => {
  const { store } = fixture(false);
  expect(() => store.set("openai-api", "key")).toThrow("unavailable");
  expect(store.has("openai-api")).toBe(false);
});
