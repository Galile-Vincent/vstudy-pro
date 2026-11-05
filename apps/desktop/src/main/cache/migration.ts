/**
 * Define response-cache tables and lookup indexes for schema version 19.
 * Owned by main/cache.
 * Cache entries are account-scoped; stale data never implies a successful refresh.
 * @packageDocumentation
 */
/** Bounded remote response cache and indexes for dependent Moodle lookups and cascades. */
export const storageMigration = `
CREATE TABLE moodle_response_cache (
  accountId TEXT NOT NULL REFERENCES moodle_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
  bytes INTEGER NOT NULL, syncedAt INTEGER NOT NULL, accessedAt INTEGER NOT NULL,
  etag TEXT, modifiedAt TEXT, revision TEXT,
  PRIMARY KEY(accountId,kind,key)
);
CREATE INDEX moodle_cache_lru ON moodle_response_cache(accessedAt);
CREATE INDEX moodle_notifications_course ON moodle_notifications(accountId,json_extract(data,'$.courseId'));
CREATE INDEX moodle_files_document ON moodle_files(documentId);
CREATE INDEX conversations_course_page ON conversations(courseId,createdAt DESC,id DESC);
`;
