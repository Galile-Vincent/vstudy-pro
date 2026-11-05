/** Forward-only v18 migration. Preserve message IDs and parent links while adding general scope. */
export const chatHistoryMigration = `
CREATE TABLE conversations_history (
id TEXT PRIMARY KEY, scope TEXT NOT NULL CHECK(scope IN ('document','course','general')),
documentId TEXT REFERENCES documents(id) ON DELETE CASCADE,
courseId TEXT REFERENCES moodle_courses(id) ON DELETE CASCADE,
providerId TEXT NOT NULL, modelId TEXT NOT NULL, createdAt TEXT NOT NULL, options TEXT, updatedAt TEXT,
title TEXT, pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), deletedAt TEXT,
CHECK((scope='document' AND documentId IS NOT NULL AND courseId IS NULL) OR
(scope='course' AND courseId IS NOT NULL AND documentId IS NULL) OR
(scope='general' AND courseId IS NULL AND documentId IS NULL))
);
INSERT INTO conversations_history(id,scope,documentId,courseId,providerId,modelId,createdAt,options,updatedAt)
SELECT id,scope,documentId,courseId,providerId,modelId,createdAt,options,coalesce(updatedAt,createdAt) FROM conversations;
DROP TRIGGER conversation_touch;
CREATE TEMP TABLE history_messages_backup AS SELECT * FROM messages;
DELETE FROM messages;
DROP TABLE conversations;
ALTER TABLE conversations_history RENAME TO conversations;
INSERT INTO messages SELECT * FROM history_messages_backup;
DROP TABLE history_messages_backup;
CREATE INDEX conversations_document ON conversations(documentId);
CREATE INDEX conversations_course ON conversations(courseId);
CREATE INDEX conversations_updated ON conversations(documentId,updatedAt DESC,id);
CREATE INDEX conversations_history_recent ON conversations(updatedAt DESC,id DESC) WHERE deletedAt IS NULL;
CREATE TRIGGER conversation_touch AFTER INSERT ON messages BEGIN
UPDATE conversations SET updatedAt=max(coalesce(updatedAt,createdAt),NEW.createdAt) WHERE id=NEW.conversationId;
END;
CREATE VIRTUAL TABLE chat_fts USING fts5(conversationId UNINDEXED,messageId UNINDEXED,role UNINDEXED,title,text,tokenize='trigram');
INSERT INTO chat_fts(conversationId,messageId,role,title,text) SELECT id,NULL,NULL,coalesce(title,''),'' FROM conversations;
INSERT INTO chat_fts(conversationId,messageId,role,title,text)
SELECT conversationId,id,role,'',coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(parts)),'')
FROM messages WHERE supersededBy IS NULL;
CREATE TRIGGER history_conversation_insert AFTER INSERT ON conversations BEGIN
INSERT INTO chat_fts(conversationId,messageId,role,title,text) VALUES(NEW.id,NULL,NULL,coalesce(NEW.title,''),'');
END;
CREATE TRIGGER history_conversation_title AFTER UPDATE OF title ON conversations BEGIN
UPDATE chat_fts SET title=coalesce(NEW.title,'') WHERE conversationId=NEW.id AND messageId IS NULL;
END;
CREATE TRIGGER history_conversation_delete AFTER DELETE ON conversations BEGIN
DELETE FROM chat_fts WHERE conversationId=OLD.id;
END;
CREATE TRIGGER history_message_insert AFTER INSERT ON messages WHEN NEW.supersededBy IS NULL BEGIN
INSERT INTO chat_fts(conversationId,messageId,role,title,text) VALUES(NEW.conversationId,NEW.id,NEW.role,'',
coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(NEW.parts)),''));
END;
CREATE TRIGGER history_message_update AFTER UPDATE OF parts,role,supersededBy,conversationId ON messages BEGIN
DELETE FROM chat_fts WHERE messageId=OLD.id;
INSERT INTO chat_fts(conversationId,messageId,role,title,text)
SELECT NEW.conversationId,NEW.id,NEW.role,'',coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(NEW.parts)),'') WHERE NEW.supersededBy IS NULL;
END;
CREATE TRIGGER history_message_delete AFTER DELETE ON messages BEGIN
DELETE FROM chat_fts WHERE messageId=OLD.id;
END;
`;
