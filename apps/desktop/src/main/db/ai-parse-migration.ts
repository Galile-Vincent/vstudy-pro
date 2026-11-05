/**
 * Define immutable SQL for ai parse persistence upgrades.
 * Owned by main/db.
 * Applied SQL remains immutable; repositories share one connection and use bound query values.
 * @packageDocumentation
 */
export const aiParseMigration = `
ALTER TABLE documents ADD COLUMN activeVersion TEXT NOT NULL DEFAULT 'original' CHECK(activeVersion IN ('original','ai'));
ALTER TABLE documents ADD COLUMN aiSizeBytes INTEGER;
CREATE TABLE ai_parse_jobs(documentId TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE, request TEXT NOT NULL CHECK(json_valid(request)), status TEXT NOT NULL CHECK(status IN ('running','cancelled','complete')), updatedAt TEXT NOT NULL, promptVersion TEXT NOT NULL);
CREATE TABLE ai_parse_pages(documentId TEXT NOT NULL REFERENCES ai_parse_jobs(documentId) ON DELETE CASCADE, page INTEGER NOT NULL, cacheKey TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','done','kept-original','failed')), markdown TEXT, code TEXT, provenance TEXT CHECK(provenance IS NULL OR json_valid(provenance)), PRIMARY KEY(documentId,page));
CREATE INDEX ai_parse_cache ON ai_parse_pages(cacheKey,status);
CREATE TABLE usage_parse_daily(date TEXT PRIMARY KEY,inputTokens INTEGER NOT NULL,outputTokens INTEGER NOT NULL,costUsd REAL,calls INTEGER NOT NULL);
INSERT INTO usage_parse_daily SELECT date(createdAt,'localtime'),sum(inputTokens),sum(outputTokens),sum(costUsd),count(*) FROM usage_events WHERE kind='parse' GROUP BY 1;
CREATE TRIGGER usage_parse_rollup AFTER INSERT ON usage_events WHEN NEW.kind='parse' BEGIN
INSERT INTO usage_parse_daily VALUES(date(NEW.createdAt,'localtime'),NEW.inputTokens,NEW.outputTokens,NEW.costUsd,1)
ON CONFLICT(date) DO UPDATE SET inputTokens=inputTokens+excluded.inputTokens,outputTokens=outputTokens+excluded.outputTokens,costUsd=CASE WHEN costUsd IS NULL AND excluded.costUsd IS NULL THEN NULL ELSE coalesce(costUsd,0)+coalesce(excluded.costUsd,0) END,calls=calls+1;
END;
`;

export const aiParseRollupRepair = `
CREATE TABLE IF NOT EXISTS usage_parse_daily(date TEXT PRIMARY KEY,inputTokens INTEGER NOT NULL,outputTokens INTEGER NOT NULL,costUsd REAL,calls INTEGER NOT NULL);
INSERT OR IGNORE INTO usage_parse_daily SELECT date(createdAt,'localtime'),sum(inputTokens),sum(outputTokens),sum(costUsd),count(*) FROM usage_events WHERE kind='parse' GROUP BY 1;
CREATE TRIGGER IF NOT EXISTS usage_parse_rollup AFTER INSERT ON usage_events WHEN NEW.kind='parse' BEGIN
INSERT INTO usage_parse_daily VALUES(date(NEW.createdAt,'localtime'),NEW.inputTokens,NEW.outputTokens,NEW.costUsd,1)
ON CONFLICT(date) DO UPDATE SET inputTokens=inputTokens+excluded.inputTokens,outputTokens=outputTokens+excluded.outputTokens,costUsd=CASE WHEN costUsd IS NULL AND excluded.costUsd IS NULL THEN NULL ELSE coalesce(costUsd,0)+coalesce(excluded.costUsd,0) END,calls=calls+1;
END;
`;
