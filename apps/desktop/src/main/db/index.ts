/**
 * Open the shared SQLite connection and expose validated document, chat, usage, and settings repositories.
 * Owned by main/db.
 * Applied SQL remains immutable; repositories share one connection and use bound query values.
 * @packageDocumentation
 */
import { migrations } from './migrations';
import { migrate } from "./migrate";
import { chatHistoryRepository } from './chat-history';
import { chmodSync, existsSync, statSync } from "node:fs";
import { usageRepository } from "./usage";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  conversationSchema,
  defaultSettings,
  documentSchema,
  messageSchema,
  settingsSchema,
  transitionDocument,
  type Conversation,
  type Document,
  type DocumentTransition,
  type Message,
  type Settings,
} from "../../shared/domain";

const documentRow = z
  .object({
    id: z.string(),
    title: z.string(),
    sourceName: z.string(),
    sourceHash: z.string(),
    sourcePath: z.string(),
    mime: z.string(),
    converter: z.enum(["pdf_md", "markitdown"]),
    status: z.string(),
    error: z.string().nullable(),
    activeVersion:z.enum(["original","ai"]),
    markdownPath: z.string(),
    createdAt: z.string(),
  })
  .transform(({ error, ...rest }) =>
    documentSchema.parse(error === null ? rest : { ...rest, error }),
  );
const conversationRow = z.object({ options: z.string().nullable() }).passthrough().transform(({ options, ...row }) => {
  const {id,scope,documentId,courseId,providerId,modelId,createdAt} = row;
  return conversationSchema.parse({id,providerId,modelId,createdAt,...(scope === 'course' ? {scope,courseId} : scope === 'general' ? {scope} : {documentId}),...(options ? {options:JSON.parse(options)} : {})});
});
const messageRow = z
  .object({
    id: z.string(),
    conversationId: z.string(),
    role: z.string(),
    parts: z.string(),
    createdAt: z.string(),
  })
  .transform((row) =>
    messageSchema.parse({ ...row, parts: JSON.parse(row.parts) }),
  );

/** Open and migrate a private SQLite store; the caller must close it after dependent work settles. */
export function openStore(path: string) {
  if (path !== ':memory:') for (const suffix of ['', '-wal', '-shm', '.before-v5.bak']) {
    if (existsSync(path + suffix)) chmodSync(path + suffix, 0o600);
  }
  const recovering = path !== ":memory:" && existsSync(`${path}-wal`) && statSync(`${path}-wal`).size > 0;
  const fresh = path === ":memory:" || !existsSync(path);
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  try {
    if (fresh) db.exec("PRAGMA auto_vacuum=INCREMENTAL");
    db.exec(
      "PRAGMA synchronous=FULL; PRAGMA temp_store=MEMORY; PRAGMA mmap_size=268435456; PRAGMA cache_size=-16384; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    migrate(db, migrations, fresh ? ":memory:" : path);
  } catch (error) {
    db.close();
    throw error;
  }
  if (path !== ':memory:') for (const suffix of ['-wal', '-shm']) if (existsSync(path + suffix)) chmodSync(path + suffix, 0o600);
  if (recovering && db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok") { db.close(); throw new Error("Database integrity check failed"); }
  const documents = {
    insert(input: Document): Document {
      const d = documentSchema.parse(input);
      db.prepare(
        "INSERT INTO documents(id,title,sourceName,sourceHash,sourcePath,mime,status,error,markdownPath,createdAt,converter) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        d.id,
        d.title,
        d.sourceName,
        d.sourceHash,
        d.sourcePath,
        d.mime,
        d.status,
        d.status === "failed" ? d.error : null,
        d.markdownPath,
        d.createdAt,
        d.converter,
      );
      return d;
    },
    get(id: Document["id"]): Document | null {
      const row = db.prepare("SELECT * FROM documents WHERE id=? AND deletedAt IS NULL").get(id);
      return row ? documentRow.parse(row) : null;
    },
    getIncludingDeleted(id: Document["id"]): Document | null {
      const row = db.prepare("SELECT * FROM documents WHERE id=?").get(id);
      return row ? documentRow.parse(row) : null;
    },
    findByHash(hash: string): Document | null {
      const row = db
        .prepare("SELECT * FROM documents WHERE sourceHash=?")
        .get(hash);
      return row ? documentRow.parse(row) : null;
    },
    list(): Document[] {
      return z
        .array(documentRow)
        .parse(
          db.prepare("SELECT * FROM documents WHERE deletedAt IS NULL ORDER BY createdAt,id").all(),
        );
    },
    transition(id: Document["id"], next: DocumentTransition): Document {
      const current = documents.getIncludingDeleted(id);
      if (!current) throw new Error("Document not found");
      const updated = transitionDocument(current, next);
      db.prepare("UPDATE documents SET status=?,error=?,converter=? WHERE id=?").run(
        updated.status,
        updated.status === "failed" ? updated.error : null,
        updated.converter,
        id,
      );
      return updated;
    },
    delete(id: Document["id"]): void {
      db.prepare("DELETE FROM documents WHERE id=?").run(id);
    },
  };
  const maintenance = setInterval(() => { try { db.exec("PRAGMA optimize; PRAGMA incremental_vacuum(128)"); } catch { console.error("Database maintenance deferred"); } }, 300_000);
  maintenance.unref();
  return {
    db,
    integrityCheck: () => db.prepare("PRAGMA integrity_check").all(),
    close: () => { clearInterval(maintenance); db.exec("PRAGMA optimize"); db.close(); },
    usage: usageRepository(db),
    chatHistory: chatHistoryRepository(db),
    documents,
    conversations: {
      setModel(id: Conversation['id'], providerId: Conversation['providerId'], modelId: string): Conversation {
        if (db.prepare('SELECT 1 FROM messages WHERE conversationId=? LIMIT 1').get(id)) throw new Error('Only empty conversations can change models');
        db.prepare('UPDATE conversations SET providerId=?,modelId=?,options=? WHERE id=?').run(providerId,modelId,'{}',id);
        return conversationRow.parse(db.prepare('SELECT * FROM conversations WHERE id=?').get(id));
      },
      setOptions(id: Conversation["id"], options: Conversation["options"]) { db.prepare("UPDATE conversations SET options=? WHERE id=?").run(JSON.stringify(options ?? {}), id); },
      insert(input: Conversation): Conversation {
        const c = conversationSchema.parse(input);
        db.prepare(
          "INSERT INTO conversations(id,scope,documentId,courseId,providerId,modelId,createdAt,options,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)",
        ).run(c.id, c.scope ?? "document", c.scope === "course" || c.scope === "general" ? null : c.documentId, c.scope === "course" ? c.courseId : null, c.providerId, c.modelId, c.createdAt, c.options ? JSON.stringify(c.options) : null, c.createdAt);
        return c;
      },
      get(id: Conversation["id"]): Conversation | null {
        const row = db
          .prepare("SELECT * FROM conversations WHERE id=? AND deletedAt IS NULL")
          .get(id);
        return row ? conversationRow.parse(row) : null;
      },
      list(scope: Document["id"] | import("../../shared/domain").ConversationScope): Conversation[] {
        return z
          .array(conversationRow)
          .parse(
            db
              .prepare(
                `SELECT * FROM conversations WHERE ${typeof scope !== "string" && scope.scope === "general" ? "scope" : typeof scope !== "string" && scope.scope === "course" ? "courseId" : "documentId"}=? AND deletedAt IS NULL AND archived=0 ORDER BY createdAt DESC,id DESC`,
              )
              .all(typeof scope === "string" ? scope : scope.scope === "course" ? scope.courseId : scope.scope === "general" ? "general" : scope.documentId),
          );
      },
      delete(id: Conversation["id"]): void {
        db.prepare("DELETE FROM conversations WHERE id=?").run(id);
      },
    },
    messages: {
      page(conversationId: Conversation["id"], limit: number, cursor?: { createdAt: string; id: string }) {
        const size = Math.min(100, Math.max(1, Math.floor(limit)));
        const rows = db.prepare(`SELECT * FROM messages WHERE conversationId=? AND supersededBy IS NULL ${cursor ? 'AND (createdAt,id)>(?,?)' : ''} ORDER BY createdAt,id LIMIT ?`).all(conversationId,...(cursor ? [cursor.createdAt,cursor.id] : []),size+1);
        const items=rows.slice(0,size).map(r=>messageRow.parse(r));
        const last=items.at(-1);
        return {items,nextCursor:rows.length>size&&last?{createdAt:last.createdAt,id:last.id}:null};
      },
      supersede(ids: Message['id'][], replacementId: string) {
        const update = db.prepare('UPDATE messages SET supersededBy=? WHERE id=? AND supersededBy IS NULL');
        db.exec('SAVEPOINT supersede');
        try { for (const id of ids) update.run(replacementId,id); db.exec('RELEASE supersede'); }
        catch (error) { db.exec('ROLLBACK TO supersede; RELEASE supersede'); throw error; }
      },
      link(id: string, parentId: string) { db.prepare('UPDATE messages SET parentMessageId=? WHERE id=?').run(parentId,id); },
      excludeFromContext(ids: Message['id'][]) {
        const update = db.prepare("UPDATE messages SET parts=? WHERE id=?");
        for (const id of ids) { const row = db.prepare("SELECT * FROM messages WHERE id=?").get(id); if (row) { const m = messageRow.parse(row); update.run(JSON.stringify(m.parts.map(p => ({ ...p, contextExcluded: true }))), id); } }
      },
      insert(input: Message): Message {
        const m = messageSchema.parse(input);
        db.prepare(
          "INSERT INTO messages(id,conversationId,role,parts,createdAt) VALUES (?,?,?,?,?)",
        ).run(
          m.id,
          m.conversationId,
          m.role,
          JSON.stringify(m.parts),
          m.createdAt,
        );
        return m;
      },
      list(conversationId: Conversation["id"]): Message[] {
        return z
          .array(messageRow)
          .parse(
            db
              .prepare(
                "SELECT * FROM messages WHERE conversationId=? AND supersededBy IS NULL ORDER BY createdAt,id",
              )
              .all(conversationId),
          );
      },
    },
    settings: {
      get(): Settings {
        const row = db
          .prepare("SELECT value FROM settings WHERE key=?")
          .get("app");
        return row
          ? settingsSchema.parse(
              JSON.parse(z.object({ value: z.string() }).parse(row).value),
            )
          : { ...defaultSettings };
      },
      set(input: import("zod").input<typeof settingsSchema>): Settings {
        const value = settingsSchema.parse(input);
        db.prepare(
          "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run("app", JSON.stringify(value));
        return value;
      },
    },
  };
}
export type Store = ReturnType<typeof openStore>;
