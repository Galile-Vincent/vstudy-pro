export const analyticsMigration = `
CREATE TABLE analytics_state (key TEXT PRIMARY KEY, value TEXT NOT NULL CHECK(json_valid(value)));
INSERT INTO analytics_state VALUES ('analytics_enabled','false');
CREATE TABLE analytics_queue (sequence INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE analytics_seen (event_id TEXT PRIMARY KEY);
CREATE TRIGGER analytics_queue_bound AFTER INSERT ON analytics_queue BEGIN
 DELETE FROM analytics_queue WHERE sequence <= NEW.sequence - 500;
END;
CREATE TRIGGER analytics_seen_bound AFTER INSERT ON analytics_seen BEGIN
 DELETE FROM analytics_seen WHERE rowid <= NEW.rowid - 2000;
END;
`;
