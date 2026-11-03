export const aiParseMigration = `
ALTER TABLE documents ADD COLUMN activeVersion TEXT NOT NULL DEFAULT 'original' CHECK(activeVersion IN ('original','ai'));
ALTER TABLE documents ADD COLUMN aiSizeBytes INTEGER;
CREATE TABLE ai_parse_jobs(documentId TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE, request TEXT NOT NULL CHECK(json_valid(request)), status TEXT NOT NULL CHECK(status IN ('running','cancelled','complete')), updatedAt TEXT NOT NULL, promptVersion TEXT NOT NULL);
CREATE TABLE ai_parse_pages(documentId TEXT NOT NULL REFERENCES ai_parse_jobs(documentId) ON DELETE CASCADE, page INTEGER NOT NULL, cacheKey TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','done','kept-original','failed')), markdown TEXT, code TEXT, provenance TEXT CHECK(provenance IS NULL OR json_valid(provenance)), PRIMARY KEY(documentId,page));
CREATE INDEX ai_parse_cache ON ai_parse_pages(cacheKey,status);
`;
