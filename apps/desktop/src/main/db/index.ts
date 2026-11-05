import { chatHistoryMigration } from './chat-history-migration';
import { chatHistoryRepository } from './chat-history';
import { moodleMigration, moodleSiteMigration, moodleCapabilitiesMigration, moodleCourseDetailsMigration } from './moodle-migration';
import { aiParseMigration, aiParseRollupRepair } from './ai-parse-migration';
import { chmodSync, copyFileSync, existsSync, statSync } from "node:fs";
import { libraryMigration } from "./library-migration";
import { usageMigration, usageRollupMigration, usageRepository } from "./usage";
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

export const migrations = [
  {
    version: 1,
    sql: `
 CREATE TABLE documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, sourceName TEXT NOT NULL, sourceHash TEXT NOT NULL UNIQUE, sourcePath TEXT NOT NULL, mime TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('converting','ready','failed')), error TEXT, markdownPath TEXT NOT NULL, createdAt TEXT NOT NULL, CHECK((status = 'failed' AND error IS NOT NULL) OR (status != 'failed' AND error IS NULL)));
 CREATE TABLE conversations (id TEXT PRIMARY KEY, documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE, providerId TEXT NOT NULL, modelId TEXT NOT NULL, createdAt TEXT NOT NULL);
 CREATE TABLE messages (id TEXT PRIMARY KEY, conversationId TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('user','assistant','system')), parts TEXT NOT NULL CHECK(json_valid(parts)), createdAt TEXT NOT NULL);
 CREATE INDEX conversations_document ON conversations(documentId);
 CREATE INDEX messages_conversation ON messages(conversationId, createdAt);
 CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
`,
  },
  { version: 2, sql: "ALTER TABLE documents ADD COLUMN converter TEXT NOT NULL DEFAULT 'markitdown' CHECK(converter IN ('pdf_md','markitdown'));" },
  { version: 3, sql: usageMigration },
  { version: 4, sql: "ALTER TABLE conversations ADD COLUMN options TEXT;" },
  { version: 5, sql: libraryMigration },
  { version: 6, sql: `
    CREATE INDEX usage_page ON usage_events(createdAt,id);
    CREATE INDEX messages_page ON messages(conversationId,createdAt,id);
    CREATE INDEX documents_all_manual ON documents(position,id) WHERE deletedAt IS NULL;
    CREATE INDEX documents_all_name ON documents(title COLLATE NOCASE,id) WHERE deletedAt IS NULL;
    CREATE INDEX documents_size ON documents(sizeBytes,id) WHERE deletedAt IS NULL;
    CREATE INDEX documents_type ON documents(mime,id) WHERE deletedAt IS NULL;
    CREATE INDEX documents_converter ON documents(converter,createdAt,id) WHERE deletedAt IS NULL;
    CREATE INDEX documents_folder_size ON documents(folderId,sizeBytes,id) WHERE deletedAt IS NULL;
    CREATE INDEX documents_folder_type ON documents(folderId,mime,id) WHERE deletedAt IS NULL;
  ` },
  { version: 7, sql: `
    ALTER TABLE messages ADD COLUMN parentMessageId TEXT DEFAULT NULL;
    ALTER TABLE messages ADD COLUMN supersededBy TEXT DEFAULT NULL;
    CREATE INDEX messages_active ON messages(conversationId,createdAt,id) WHERE supersededBy IS NULL;
  ` },
  { version: 8, sql: usageRollupMigration },
  { version: 9, sql: `
    CREATE INDEX activity_document ON activity_events(documentId);
    CREATE INDEX documents_folder_fk ON documents(folderId);
    CREATE INDEX documents_opened_normalized ON documents(coalesce(lastOpenedAt,''),id) WHERE deletedAt IS NULL;
  ` },
  { version: 10, sql: `
    DROP INDEX documents_size;
    DROP INDEX documents_folder_size;
    ALTER TABLE documents RENAME COLUMN sizeBytes TO legacySizeBytes;
    ALTER TABLE documents RENAME COLUMN contentChars TO legacyContentChars;
    ALTER TABLE documents ADD COLUMN sizeBytes INTEGER;
    ALTER TABLE documents ADD COLUMN contentChars INTEGER;
    ALTER TABLE documents ADD COLUMN metadataBackfilled INTEGER NOT NULL DEFAULT 0;
    UPDATE documents SET sizeBytes=nullif(legacySizeBytes,0),contentChars=nullif(legacyContentChars,0);
    CREATE INDEX documents_size ON documents(sizeBytes,id) WHERE deletedAt IS NULL;
    CREATE INDEX documents_folder_size ON documents(folderId,sizeBytes,id) WHERE deletedAt IS NULL;
  ` },
  { version:11, sql:aiParseMigration },
  // Repairs databases that applied an earlier v11 draft without the parse rollup table/trigger.
  { version:12, sql:aiParseRollupRepair },
  { version:13, sql:moodleMigration },
  { version:14, sql: `
    CREATE TABLE conversations_scoped (
      id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN ('document','course')),
      documentId TEXT REFERENCES documents(id) ON DELETE CASCADE,
      courseId TEXT REFERENCES moodle_courses(id) ON DELETE CASCADE,
      providerId TEXT NOT NULL, modelId TEXT NOT NULL, createdAt TEXT NOT NULL,
      options TEXT, updatedAt TEXT,
      CHECK((scope='document' AND documentId IS NOT NULL AND courseId IS NULL) OR
            (scope='course' AND courseId IS NOT NULL AND documentId IS NULL))
    );
    INSERT INTO conversations_scoped SELECT id,'document',documentId,NULL,providerId,modelId,createdAt,options,updatedAt FROM conversations;
    DROP TRIGGER conversation_touch;
    CREATE TABLE messages_backup AS SELECT * FROM messages;
    DELETE FROM messages;
    DROP TABLE conversations;
    ALTER TABLE conversations_scoped RENAME TO conversations;
    INSERT INTO messages SELECT * FROM messages_backup;
    DROP TABLE messages_backup;
    CREATE TRIGGER conversation_touch AFTER INSERT ON messages BEGIN UPDATE conversations SET updatedAt=NEW.createdAt WHERE id=NEW.conversationId; END;
    CREATE INDEX conversations_document ON conversations(documentId);
    CREATE INDEX conversations_course ON conversations(courseId);
    CREATE INDEX conversations_updated ON conversations(documentId,updatedAt DESC,id);
  ` },
  { version:15, sql:moodleSiteMigration },
  { version:16, sql:moodleCapabilitiesMigration },
  { version:17, sql:moodleCourseDetailsMigration },
  { version:18, sql:chatHistoryMigration },
];
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
      "PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA mmap_size=268435456; PRAGMA cache_size=-16384; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
    db.exec(
      "CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)",
    );
    const versions = z
      .array(z.object({ version: z.number() }))
      .parse(
        db.prepare("SELECT version FROM migrations ORDER BY version").all(),
      )
      .map((row) => row.version);
    if (
      versions.some((version) => !migrations.some((m) => m.version === version))
    )
      throw new Error("Database version is newer than this application");
    for (const migration of migrations) {
      if (versions.includes(migration.version)) continue;
      if (!fresh && [5,8,18].includes(migration.version)) {
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
        copyFileSync(path, `${path}.before-v${migration.version}.bak`);
        chmodSync(`${path}.before-v${migration.version}.bak`, 0o600);
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(migration.sql);
        db.prepare(
          "INSERT INTO migrations(version, appliedAt) VALUES (?, ?)",
        ).run(migration.version, new Date().toISOString());
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
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
  const maintenance = setInterval(() => { db.exec("PRAGMA optimize; PRAGMA incremental_vacuum(128)"); }, 300_000);
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
