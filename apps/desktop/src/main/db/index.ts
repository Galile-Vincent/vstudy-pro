import { usageMigration, usageRepository } from "./usage";
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

const migrations = [
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
    markdownPath: z.string(),
    createdAt: z.string(),
  })
  .transform(({ error, ...rest }) =>
    documentSchema.parse(error === null ? rest : { ...rest, error }),
  );
const conversationRow = z.object({ options: z.string().nullable() }).passthrough().transform(({ options, ...row }) => conversationSchema.parse({ ...row, ...(options ? { options: JSON.parse(options) } : {}) }));
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
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
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
          db.prepare("SELECT * FROM documents ORDER BY createdAt,id").all(),
        );
    },
    transition(id: Document["id"], next: DocumentTransition): Document {
      const current = documents.get(id);
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
  return {
    close: () => db.close(),
    usage: usageRepository(db),
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
          "INSERT INTO conversations(id,documentId,providerId,modelId,createdAt,options) VALUES (?,?,?,?,?,?)",
        ).run(c.id, c.documentId, c.providerId, c.modelId, c.createdAt, c.options ? JSON.stringify(c.options) : null);
        return c;
      },
      get(id: Conversation["id"]): Conversation | null {
        const row = db
          .prepare("SELECT * FROM conversations WHERE id=?")
          .get(id);
        return row ? conversationRow.parse(row) : null;
      },
      list(documentId: Document["id"]): Conversation[] {
        return z
          .array(conversationRow)
          .parse(
            db
              .prepare(
                "SELECT * FROM conversations WHERE documentId=? ORDER BY createdAt DESC,id DESC",
              )
              .all(documentId),
          );
      },
      delete(id: Conversation["id"]): void {
        db.prepare("DELETE FROM conversations WHERE id=?").run(id);
      },
    },
    messages: {
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
                "SELECT * FROM messages WHERE conversationId=? ORDER BY createdAt,id",
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
