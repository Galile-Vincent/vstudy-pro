import { analyticsMigration } from './analytics-migration';
/**
 * Keep the immutable, ordered SQL registry used to upgrade existing databases.
 * Owned by main/db.
 * Applied SQL remains immutable; repositories share one connection and use bound query values.
 * @packageDocumentation
 */
import { studyMigration } from './study-migration';
import { plannerMigration } from './planner-migration';
import { storageMigration } from '../cache/migration';
import { chatHistoryMigration } from './chat-history-migration';
import { moodleMigration, moodleSiteMigration, moodleCapabilitiesMigration, moodleCourseDetailsMigration } from './moodle-migration';
import { aiParseMigration, aiParseRollupRepair } from './ai-parse-migration';
import { libraryMigration } from './library-migration';
import { usageMigration, usageRollupMigration } from './usage';

/** Forward migrations applied transactionally by the store opener. */
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
  { version:19, sql:storageMigration },
  { version:20, sql:"CREATE INDEX IF NOT EXISTS conversations_course_page ON conversations(courseId,createdAt DESC,id DESC);" },
  { version:21, sql:plannerMigration },
  { version:22, sql:analyticsMigration },
  { version:23, sql:studyMigration },
];
