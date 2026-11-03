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
    isAsyncEncryptionAvailable: async () => available,
    encryptStringAsync: async (value) =>
      Buffer.from(Buffer.from(value).map((byte) => byte ^ 42)),
    decryptStringAsync: async (value) => ({ result: Buffer.from(value.map((byte) => byte ^ 42)).toString() }),
  };
  return { file, store: createSecretStore(file, encryption), encryption };
}
it("encrypts, persists with 0600, replaces, and deletes keys", async () => {
  const { store, file, encryption } = fixture();
  expect(store.has("openai-api")).toBe(false);
  expect(await store.getInMainOnly("openai-api")).toBeNull();
  await store.set("openai-api", "secret-api-key");
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(readFileSync(file, "utf8")).not.toContain("secret-api-key");
  expect(await createSecretStore(file, encryption).getInMainOnly("openai-api")).toBe(
    "secret-api-key",
  );
  await store.set("openai-api", "replacement");
  expect(await store.getInMainOnly("openai-api")).toBe("replacement");
  store.delete("openai-api");
  expect(store.has("openai-api")).toBe(false);
});
it("fails closed when OS encryption is unavailable", async () => {
  const { store } = fixture(false);
  await expect(store.set("openai-api", "key")).rejects.toThrow("unavailable");
  expect(store.has("openai-api")).toBe(false);
});

it("does not touch Keychain on construction or presence checks and bounds a slow/denied request", async () => {
  const { file } = fixture();
  let calls = 0;
  const encryption: Encryption = {
    isAsyncEncryptionAvailable: () => { calls++; return new Promise(() => {}); },
    encryptStringAsync: async () => { throw new Error('denied'); },
    decryptStringAsync: async () => { throw new Error('denied'); },
  };
  const store = createSecretStore(file, encryption, 10);
  expect(store.has('openai-api')).toBe(false);
  expect(calls).toBe(0);
  await expect(store.set('openai-api', 'key')).rejects.toThrow('keychain_unavailable');
  expect(store.has('openai-api')).toBe(false);
  encryption.isAsyncEncryptionAvailable = async () => true;
  await expect(store.set('openai-api', 'key')).rejects.toThrow('keychain_unavailable');
});

it.each(['delete', 'session', 'replace'] as const)('invalidates delayed decrypt on %s', async (change) => {
  const { file, encryption, store: initial } = fixture();
  await initial.set('openai-compatible', 'old-key');
  const gate = deferred<{result:string}>();
  const started = deferred<void>();
  encryption.decryptStringAsync = () => { started.resolve(); return gate.promise; };
  const store = createSecretStore(file, encryption);
  const pending = store.getInMainOnly('openai-compatible');
  await started.promise;
  if (change === 'delete') store.delete('openai-compatible');
  else if (change === 'session') store.useInSession('openai-compatible','new-key');
  else await store.set('openai-compatible','new-key');
  gate.resolve({result:'old-key'});
  expect(await pending).toBeNull();
  expect(await store.getInMainOnly('openai-compatible')).toBe(change === 'delete' ? null : 'new-key');
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise,resolve};
}
