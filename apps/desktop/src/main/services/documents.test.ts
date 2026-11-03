import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openStore } from "../db";
import { DocumentService, MAX_SOURCE_BYTES } from "./documents";
import type { ConverterRunner } from "../../../resources/converter";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function setup(convert: ConverterRunner = async (_source, output) => { await writeFile(output, "Converted fixture"); }) {
  const userData = await mkdtemp(join(tmpdir(), "vstudy-documents-test-"));
  const store = openStore(":memory:");
  const service = new DocumentService({ userData, store, convert });
  cleanups.push(async () => { await service.waitForIdle(); service.dispose(); store.close(); await rm(userData, { recursive: true, force: true }); });
  return { service, store, userData, convert };
}
const fixture = (extension: string) => resolve("test-fixtures/converter", `sample.${extension}`);

describe("DocumentService", () => {
  it("copies originals, deduplicates simultaneous imports, and passes md/txt through without Python", async () => {
    let calls = 0;
    const { service } = await setup(async () => { calls++; throw new Error("Python should not run"); });
    const [first, duplicate] = await Promise.all([service.importPath(fixture("md")), service.importPath(fixture("md"))]);
    expect(first.id).toBe(duplicate.id);
    const text = await service.importPath(fixture("txt"));
    await service.waitForIdle();
    expect(service.list()).toHaveLength(2);
    expect(await service.read(first.id)).toBe(await readFile(fixture("md"), "utf8"));
    expect(await service.read(text.id)).toContain("Plain text passthrough");
    expect(await readFile(first.sourcePath)).toEqual(await readFile(fixture("md")));
    expect(calls).toBe(0);
  });

  it("queues conversions with concurrency one and stores failures for retry", async () => {
    let active = 0;
    let maximum = 0;
    let fail = true;
    const { service } = await setup(async (_source, output) => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (fail) throw new Error("fixture failure");
      await writeFile(output, "Recovered");
    });
    const first = await service.importPath(fixture("html"));
    const second = await service.importPath(fixture("csv"));
    await service.waitForIdle();
    expect(service.get(first.id)).toMatchObject({ status: "failed", error: expect.stringContaining("errors.converter_failed") });
    await expect(service.read(first.id)).rejects.toThrow("not ready");
    fail = false;
    expect((await service.retry(first.id)).status).toBe("converting");
    await service.retry(second.id);
    await service.waitForIdle();
    expect(maximum).toBe(1);
    expect(service.get(first.id)).toMatchObject({ status: "ready" });
    expect(service.get(first.id)).not.toHaveProperty("error");
    expect(await service.read(first.id)).toBe("Recovered");
    await expect(service.retry(first.id)).rejects.toThrow("Only failed");
  });

  it("deletes during conversion without leaving files or rows and supports reimport", async () => {
    let finish: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const { service } = await setup(async (_source, output) => { await pending; await writeFile(output, "done"); });
    const document = await service.importPath(fixture("html"));
    const deleted = service.delete(document.id);
    finish?.();
    await deleted;
    expect(service.get(document.id)).toBeNull();
    await expect(stat(document.sourcePath)).rejects.toThrow();
    await service.delete(document.id);
    expect((await service.importPath(fixture("html"))).id).not.toBe(document.id);
  });

  it("recovers converting documents at startup", async () => {
    const { service, store, userData, convert } = await setup();
    const first = await service.importPath(fixture("csv"));
    await service.waitForIdle();
    store.documents.delete(first.id);
    store.documents.insert(first);
    const restarted = new DocumentService({ store, userData, convert });
    await restarted.waitForIdle();
    expect(restarted.get(first.id)?.status).toBe("ready");
    restarted.dispose();
  });

  it("rejects unsupported extensions, directories, oversized sources and oversized Markdown", async () => {
    const { service, userData } = await setup();
    await expect(service.importPath(join(userData, "danger.exe"))).rejects.toThrow("Unsupported");
    await expect(service.importPath(join(userData, "danger.constructor"))).rejects.toThrow("Unsupported");
    const directory = join(userData, "directory.txt");
    await mkdir(directory);
    await expect(service.importPath(directory)).rejects.toThrow("regular file");
    const oversized = join(userData, "large.txt");
    await writeFile(oversized, "");
    await truncate(oversized, MAX_SOURCE_BYTES + 1);
    await expect(service.importPath(oversized)).rejects.toThrow("50 MiB");
    await writeFile(oversized, "a".repeat(8 * 1024 * 1024 + 1));
    const document = await service.importPath(oversized);
    await service.waitForIdle();
    expect(service.get(document.id)).toMatchObject({ status: "failed", error: expect.stringContaining("errors.converter_failed") });
  });
});
it("uses the decoded HTML title instead of the import filename", async () => {
  const { service, userData } = await setup();
  const source = join(userData, "page.html");
  await writeFile(source, "<html><head><title>Quantum &amp; Gardening &#49;</title></head><body>Hello</body></html>");
  const doc = await service.importPath(source);
  expect(doc.title).toBe("Quantum & Gardening 1");
});

it('re-converts a ready document while retaining its original and identity',async()=>{const {service}=await setup();const doc=await service.importPath(fixture('md'));await service.waitForIdle();expect((await service.reconvert(doc.id)).id).toBe(doc.id);await service.waitForIdle();expect(service.get(doc.id)?.status).toBe('ready');expect(await service.read(doc.id)).toContain('VStudy fixture');});

it.each([false,true])('finalizes hidden conversion before undo (failure=%s)', async (fail) => {
  const gate = Promise.withResolvers<void>();
  const { service, store } = await setup(async (_source, output) => { await gate.promise; if (fail) throw new Error('offline'); await writeFile(output,'finished'); });
  const document = await service.importPath(fixture('html'));
  store.db.prepare('UPDATE documents SET deletedAt=? WHERE id=?').run(new Date().toISOString(),document.id);
  gate.resolve();
  await service.waitForIdle();
  expect(store.db.prepare('SELECT status FROM documents WHERE id=?').get(document.id)?.status).toBe(fail ? 'failed' : 'ready');
  expect(store.db.prepare('SELECT * FROM document_fts WHERE documentId=?').all(document.id)).toHaveLength(0);
  store.db.prepare('UPDATE documents SET deletedAt=NULL WHERE id=?').run(document.id);
  expect(service.get(document.id)?.status).toBe(fail ? 'failed' : 'ready');
});
