import { backfillMetadata } from "./metadata";
import { safeDocumentLabel } from "../security";
import { activeConversions } from "./conversion-state";
import { chmodSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateImport } from "./import-security";
import { containedPath, LibraryService } from "./library";
import { SearchService } from "./search";
import { ActivityService } from "./activity";
import { profileStage } from "../../../resources/converter/profile";
import { decodeHtmlEntities } from "../../shared/html";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { documentSchema, type Document } from "../../shared/domain";
import type { Store } from "../db";
import { MAX_MARKDOWN_BYTES, type ConverterRunner } from "../../../resources/converter";

export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
export { documentFormats } from "../../shared/document-formats";
import { documentFormats } from "../../shared/document-formats";

export class DocumentService {
  private readonly library: string;
  private operations: Promise<unknown> = Promise.resolve();
  private readonly jobs = new Map<Document["id"], Promise<void>>();
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private readonly metadata: Promise<void>;

  constructor(private readonly options: {
    store: Store;
    userData: string;
    convert: ConverterRunner;
    onProgress?: (documentId: Document["id"], message: string) => void;
  }) {
    this.library = join(options.userData, "library");
    mkdirSync(this.library, { recursive: true, mode: 0o700 });
    chmodSync(this.library, 0o700);
    this.metadata = backfillMetadata(options.store.db, this.library, () => this.stopped).catch(() => {
      console.error("Metadata backfill interrupted; pending startup recovery");
    });
    for (const document of this.list()) {
      if (document.status === "converting") this.enqueue(document);
    }
  }

  list(): Document[] { return this.options.store.documents.list(); }
  get(id: Document["id"]): Document | null { return this.options.store.documents.get(id); }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(() => {
      if (this.stopped) throw new Error("Document service is closed");
      return operation();
    });
    this.operations = result.catch(() => undefined);
    return result;
  }

  private reuseImport(id: Document["id"]): Document {
    new LibraryService(this.options.store, this.library).restore(id, 'import');
    this.resume(id);
    return this.require(id);
  }

  importPath(path: string): Promise<Document> {
    return this.serialize(async () => {
      const extension = extname(path).slice(1).toLowerCase();
      const mime = documentFormats[extension];
      if (!Object.hasOwn(documentFormats, extension) || !mime) throw new Error("Unsupported document type");
      path = resolve(path);
      const metadata = await stat(path);
      if (!metadata.isFile()) throw new Error("Import requires a regular file");
      if (metadata.size === 0) throw new Error('empty file');
      if (metadata.size > MAX_SOURCE_BYTES) throw new Error("Document exceeds 50 MiB");
      validateImport(path, extension);
      await mkdir(this.library, { recursive: true, mode: 0o700 });
      const staging = await mkdtemp(join(this.library, ".import-"));
      try {
        const source = join(staging, `source.${extension}`);
        const hash = createHash("sha256");
        let size = 0;
        const copied = profileStage("SHA-256 + source copy");
        await pipeline(createReadStream(path), new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            size += chunk.length;
            if (size > MAX_SOURCE_BYTES) return callback(new Error("Document exceeds 50 MiB"));
            hash.update(chunk);
            callback(null, chunk);
          },
        }), createWriteStream(source, { flags: "wx", mode: 0o600 }));
        copied();
        validateImport(source, extension);
        const sourceHash = hash.digest("hex");
        const existing = this.options.store.documents.findByHash(sourceHash);
        if (existing) return this.reuseImport(existing.id);
        const directory = join(this.library, sourceHash);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        // A hash names immutable bytes. Publish each source exclusively, including after a crash.
        try { await link(source, join(directory, `source.${extension}`)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        await rm(source, { force: true });
        const published = this.options.store.documents.findByHash(sourceHash);
        if (published) return this.reuseImport(published.id);
        let title = basename(path, extname(path));
        if (mime === "text/html") {
          const html = await readFile(join(directory, `source.${extension}`), "utf8");
          const raw = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1];
          if (raw?.trim()) title = decodeHtmlEntities(raw).replace(/\s+/g, " ").trim();
        }
        const raced = this.options.store.documents.findByHash(sourceHash);
        if (raced) return this.reuseImport(raced.id);
        const inserted = profileStage("DB insert");
        const document = this.options.store.documents.insert(documentSchema.parse({
          id: randomUUID(), title: safeDocumentLabel(title), sourceName: safeDocumentLabel(basename(path)),
          sourceHash, sourcePath: join(directory, `source.${extension}`), mime,
          markdownPath: join(directory, "content.md"), status: "converting", createdAt: new Date().toISOString(),
        }));
        this.options.store.db.prepare("UPDATE documents SET sizeBytes=?,metadataBackfilled=1 WHERE id=?").run(size, document.id);
        new ActivityService(this.options.store).record("import", document.id, 0, document.id);
        inserted();
        this.enqueue(document);
        return document;
      } finally { await rm(staging, { recursive: true, force: true }); }
    });
  }

  async read(id: Document["id"], version?:"original"|"ai"): Promise<string> {
    const document = this.require(id);
    if (document.status !== "ready" && document.status !== "converting") throw new Error("Document is not ready");
    const path = containedPath(this.library, document.status === "converting" ? `${document.markdownPath}.partial` : (version ?? document.activeVersion) === "ai" ? join(document.markdownPath, "..", "content.ai.md") : document.markdownPath);
    new ActivityService(this.options.store).opened(id);
    if ((await stat(path)).size > MAX_MARKDOWN_BYTES) throw new Error("Markdown exceeds 8 MiB");
    return readFile(path, "utf8");
  }

  reconvert(id: Document["id"]): Promise<Document> {
    return this.serialize(async()=>{const document=this.require(id);if(document.status==='converting')throw new Error('errors.conversion_in_progress');this.options.store.db.prepare("UPDATE documents SET activeVersion='original' WHERE id=?").run(id);const updated=this.options.store.documents.transition(id,{status:'converting'});this.enqueue(updated);return updated;});
  }
  retry(id: Document["id"]): Promise<Document> {
    return this.serialize(async () => {
      const document = this.require(id);
      if (document.status !== "failed") throw new Error("Only failed documents can be retried");
      const updated = this.options.store.documents.transition(id, { status: "converting" });
      this.enqueue(updated);
      return updated;
    });
  }

  delete(id: Document["id"]): Promise<void> {
    return this.serialize(async () => {
      const document = this.get(id);
      if (!document) return;
      // Let an in-flight writer finish before removing its directory.
      await this.jobs.get(id);
      await rm(join(this.library, document.sourceHash), { recursive: true, force: true });
      this.options.store.documents.delete(id);
    });
  }

  private require(id: Document["id"]): Document {
    const document = this.get(id);
    if (!document) throw new Error("Document not found");
    return document;
  }

  resume(id: Document["id"]): void {
    if (this.stopped) return;
    const document = this.get(id);
    if (document?.status === 'converting') this.enqueue(document);
  }
  private enqueue(document: Document): void {
    if (this.jobs.has(document.id)) return;
    activeConversions.add(document.id);
    const queued = profileStage("Queue wait");
    const job = this.queue.then(async () => {
      queued();
      if (this.stopped) return;
      try {
        const source = containedPath(this.library, document.sourcePath);
        validateImport(source, extname(source).slice(1).toLowerCase());
        let converter: Document["converter"] = "markitdown";
        const extension = extname(document.sourcePath).toLowerCase();
        if (extension === ".md" || extension === ".txt") {
          const content = await readFile(document.sourcePath);
          if (content.length > MAX_MARKDOWN_BYTES) throw new Error("Markdown exceeds 8 MiB");
          await writeFile(`${document.markdownPath}.tmp`, content, { mode: 0o600 });
          await rename(`${document.markdownPath}.tmp`, document.markdownPath);
        } else converter = await this.options.convert(document.sourcePath, document.markdownPath, message => this.options.onProgress?.(document.id, message)) ?? "markitdown";
        if ((await stat(document.markdownPath)).size > MAX_MARKDOWN_BYTES) throw new Error("Markdown exceeds 8 MiB");
        if (!this.stopped && this.options.store.documents.getIncludingDeleted(document.id)) {
          const saved = profileStage("DB ready transition");
          const content = await readFile(containedPath(this.library, document.markdownPath), "utf8");
          this.options.store.db.exec("SAVEPOINT finalize");
          try {
          this.options.store.documents.transition(document.id, { status: "ready", converter });
          this.options.store.db.prepare("UPDATE documents SET contentChars=?,pageCount=? WHERE id=?").run(content.length, (content.match(/<!--\s*page\b/gi) ?? []).length || null, document.id);
          new SearchService(this.options.store.db).update(document.id, content);
          this.options.store.db.exec("RELEASE finalize");
          } catch (error) { this.options.store.db.exec("ROLLBACK TO finalize; RELEASE finalize"); throw error; }
          saved();
          this.options.onProgress?.(document.id, "Conversion complete");
        }
      } catch (error) {
        if (!this.stopped && this.options.store.documents.getIncludingDeleted(document.id)) this.options.store.documents.transition(document.id, {
          status: "failed", error: 'VSTUDY_STATUS:' + JSON.stringify({code: error instanceof Error && /NO_TEXT_LAYER|no text layer|OCR/.test(error.message) ? 'errors.pdf_no_text' : error instanceof Error && /offline/.test(error.message) ? 'errors.converter_offline' : error instanceof Error && /Install uv|Python 3.10/.test(error.message) ? 'errors.converter_python' : 'errors.converter_failed',params:{}}),
        });
      }
    }).finally(() => { this.jobs.delete(document.id); activeConversions.delete(document.id); });
    const recovered = job.catch(() => {
      // Leave the durable converting marker for startup recovery; never log paths or converter output.
      console.error("Conversion finalization failed; pending startup recovery");
    });
    this.jobs.set(document.id, recovered);
    this.queue = recovered;
  }

  async waitForIdle(): Promise<void> { await this.operations; await this.queue; await this.metadata; }
  dispose(): void { this.stopped = true; }
}
