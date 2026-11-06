/**
 * Regression coverage for services secrets.
 * Owned by main/services.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSecretStore, type Encryption } from "./secrets";
const paths: string[] = [];
afterEach(() => {
  vi.useRealTimers();
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
  if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
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

it("does not touch Keychain on construction or presence checks and reports a denied request", async () => {
  const { file } = fixture();
  let calls = 0;
  const encryption: Encryption = {
    isAsyncEncryptionAvailable: async () => { calls++; return true; },
    encryptStringAsync: async () => { throw new Error('denied'); },
    decryptStringAsync: async () => { throw new Error('denied'); },
  };
  const store = createSecretStore(file, encryption);
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
it('binds compatible unlocks to their configured origin',async()=>{
 const {file,encryption,store:initial}=fixture();await initial.set('openai-compatible','old-origin');
 const gate=deferred<{result:string}>(),started=deferred<void>();
 encryption.decryptStringAsync=()=>{started.resolve();return gate.promise;};
 const store=createSecretStore(file,encryption);store.bindCompatibleOrigin('https://old.example/v1');
 const pending=store.getInMainOnly('openai-compatible');await started.promise;
 store.bindCompatibleOrigin('https://new.example/v1');gate.resolve({result:'old-origin'});
 expect(await pending).toBeNull();expect(store.isUnlocked('openai-compatible')).toBe(false);expect(store.has('openai-compatible')).toBe(false);
});
it('only invokes OS encryption on an explicit save or unlock, even with a persisted key', async () => {
  const { file } = fixture();
  const calls: string[] = [];
  const encryption: Encryption = {
    isAsyncEncryptionAvailable: async () => { calls.push('available'); return true; },
    encryptStringAsync: async () => { calls.push('encrypt'); return Buffer.from('ciphertext'); },
    decryptStringAsync: async () => { calls.push('decrypt'); return {result:'test-key'}; },
  };
  const first = createSecretStore(file, encryption);
  expect(calls).toEqual([]);
  await first.set('openai-api','test-key');
  expect(calls).toEqual(['available','encrypt']);
  calls.length = 0;
  const restarted = createSecretStore(file, encryption);
  expect(restarted.has('openai-api')).toBe(true);
  expect(restarted.isUnlocked('openai-api')).toBe(false);
  expect(calls).toEqual([]);
  expect(await restarted.getInMainOnly('openai-api')).toBe('test-key');
  expect(calls).toEqual(['available','decrypt']);
});

it("waits for human permission beyond ten seconds without losing the save", async () => {
  vi.useFakeTimers();
  const { store, encryption } = fixture();
  let release!: (value: Buffer) => void;
  encryption.encryptStringAsync = () => new Promise(resolve => { release = resolve; });
  let state = 'pending';
  const saving = store.set('openai-api', 'key').then(() => { state = 'saved'; }, () => { state = 'failed'; });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(state).toBe('pending');
  release(Buffer.from('encrypted'));
  await saving;
  expect(state).toBe('saved');
  expect(await store.getInMainOnly('openai-api')).toBe('key');
});

it('coalesces and caches successful preflight for this app run', async () => {
  const {store, encryption, file} = fixture();
  const encrypt = vi.spyOn(encryption, 'encryptStringAsync');
  const decrypt = vi.spyOn(encryption, 'decryptStringAsync');
  await Promise.all([store.preflight(),store.preflight()]);
  await store.preflight();
  expect(encrypt).toHaveBeenCalledTimes(1);
  expect(decrypt).toHaveBeenCalledTimes(1);
  expect(() => readFileSync(file)).toThrow();
});
it.each(['denied','unavailable'])('permits retry after %s preflight without plaintext persistence', async failure => {
  const {store,encryption,file} = fixture(failure !== 'unavailable');
  const original = encryption.encryptStringAsync;
  if (failure === 'denied') encryption.encryptStringAsync = async () => {throw new Error('denied');};
  await expect(store.preflight()).rejects.toThrow('keychain_unavailable');
  expect(() => readFileSync(file)).toThrow();
  encryption.isAsyncEncryptionAvailable = async () => true;
  encryption.encryptStringAsync = original;
  await expect(store.preflight()).resolves.toBeUndefined();
});
it('keeps session tokens readable throughout a delayed save', async () => {
  const {store,encryption} = fixture();
  store.useInSession('openai-api','verified');
  const gate = deferred<Buffer>();
  encryption.encryptStringAsync = () => gate.promise;
  const saving = store.set('openai-api','verified');
  expect(await store.getInMainOnly('openai-api')).toBe('verified');
  gate.resolve(Buffer.from('encrypted'));
  await saving;
});
