/**
 * Define immutable SQL for library persistence upgrades.
 * Owned by main/db.
 * Applied SQL remains immutable; repositories share one connection and use bound query values.
 * @packageDocumentation
 */
export const libraryMigration = `
CREATE TABLE folders(id TEXT PRIMARY KEY,parentId TEXT REFERENCES folders(id),name TEXT NOT NULL COLLATE NOCASE,color TEXT,icon TEXT,position REAL NOT NULL DEFAULT 0,pinned INTEGER NOT NULL DEFAULT 0,pinnedAt TEXT,createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);
CREATE UNIQUE INDEX folder_siblings ON folders(ifnull(parentId,''),name COLLATE NOCASE);
CREATE INDEX folder_parent ON folders(parentId,position,id);
CREATE INDEX folder_pins ON folders(pinned,pinnedAt,id);
ALTER TABLE documents ADD COLUMN folderId TEXT REFERENCES folders(id);
ALTER TABLE documents ADD COLUMN position REAL NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN pinnedAt TEXT;
ALTER TABLE documents ADD COLUMN lastOpenedAt TEXT;
ALTER TABLE documents ADD COLUMN pageCount INTEGER;
ALTER TABLE documents ADD COLUMN sizeBytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN contentChars INTEGER NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN deletedAt TEXT;
ALTER TABLE conversations ADD COLUMN updatedAt TEXT;
UPDATE conversations SET updatedAt=createdAt;
CREATE INDEX conversations_updated ON conversations(documentId,updatedAt DESC,id);
CREATE TRIGGER conversation_touch AFTER INSERT ON messages BEGIN UPDATE conversations SET updatedAt=NEW.createdAt WHERE id=NEW.conversationId; END;
CREATE INDEX documents_manual ON documents(folderId,position,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_name ON documents(folderId,title COLLATE NOCASE,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_created ON documents(createdAt,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_folder_created ON documents(folderId,createdAt,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_opened ON documents(lastOpenedAt DESC,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_folder_opened ON documents(folderId,lastOpenedAt,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_pins ON documents(pinned,pinnedAt DESC,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_status ON documents(status,createdAt,id) WHERE deletedAt IS NULL;
CREATE INDEX documents_deleted ON documents(deletedAt) WHERE deletedAt IS NOT NULL;
CREATE TABLE tags(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,color TEXT);
CREATE TABLE document_tags(documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,tagId TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,PRIMARY KEY(documentId,tagId));
CREATE INDEX tag_documents ON document_tags(tagId,documentId);
CREATE TABLE saved_filters(id TEXT PRIMARY KEY,name TEXT NOT NULL,queryJson TEXT NOT NULL CHECK(json_valid(queryJson)),position REAL NOT NULL);
CREATE TABLE activity_days(date TEXT PRIMARY KEY,chatCount INTEGER NOT NULL DEFAULT 0,readSeconds INTEGER NOT NULL DEFAULT 0,importCount INTEGER NOT NULL DEFAULT 0);
CREATE TABLE activity_events(id TEXT PRIMARY KEY,documentId TEXT REFERENCES documents(id) ON DELETE CASCADE,kind TEXT NOT NULL,createdAt TEXT NOT NULL);
CREATE INDEX activity_recent ON activity_events(createdAt DESC,id);
CREATE TABLE usage_daily(date TEXT NOT NULL,providerId TEXT NOT NULL,modelId TEXT NOT NULL,documentId TEXT NOT NULL DEFAULT '',inputTokens INTEGER NOT NULL,outputTokens INTEGER NOT NULL,costUsd REAL NOT NULL,calls INTEGER NOT NULL,PRIMARY KEY(date,providerId,modelId,documentId));
CREATE INDEX usage_daily_document ON usage_daily(documentId,date);
CREATE INDEX usage_provider_model ON usage_events(providerId,modelId,createdAt,id);
CREATE INDEX usage_document_date ON usage_events(documentId,createdAt,id);
INSERT INTO usage_daily SELECT date(createdAt,'localtime'),providerId,modelId,ifnull(documentId,''),sum(inputTokens),sum(outputTokens),sum(ifnull(costUsd,0)),count(*) FROM usage_events GROUP BY 1,2,3,4;
CREATE TRIGGER usage_rollup AFTER INSERT ON usage_events BEGIN
INSERT INTO usage_daily VALUES(date(NEW.createdAt,'localtime'),NEW.providerId,NEW.modelId,ifnull(NEW.documentId,''),NEW.inputTokens,NEW.outputTokens,ifnull(NEW.costUsd,0),1)
ON CONFLICT(date,providerId,modelId,documentId) DO UPDATE SET inputTokens=inputTokens+excluded.inputTokens,outputTokens=outputTokens+excluded.outputTokens,costUsd=costUsd+excluded.costUsd,calls=calls+1;
END;
CREATE VIRTUAL TABLE document_fts USING fts5(documentId UNINDEXED,title,filename,content,tokenize='trigram');
CREATE TRIGGER document_fts_delete AFTER DELETE ON documents BEGIN DELETE FROM document_fts WHERE documentId=OLD.id; END;
CREATE TRIGGER document_fts_hide AFTER UPDATE OF deletedAt ON documents WHEN NEW.deletedAt IS NOT NULL BEGIN DELETE FROM document_fts WHERE documentId=NEW.id; END;
CREATE TRIGGER document_fts_rename AFTER UPDATE OF title ON documents BEGIN UPDATE document_fts SET title=NEW.title WHERE documentId=NEW.id; END;
`;
