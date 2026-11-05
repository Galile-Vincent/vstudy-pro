/** Forward-only SQLite migrations. Legacy version rows adopt checksums on their first verified open. */
import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, linkSync, unlinkSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Migration { version: number; sql: string }
export const migrationChecksum = (sql: string): string => createHash('sha256').update(sql).digest('hex');

/** Preserve an SQLite snapshot, including committed WAL pages, without overwriting an earlier backup. */
export function backupBeforeMigration(db: DatabaseSync, path: string, version: number): void {
  const destination = `${path}.before-v${version}.bak`;
  const temporary = `${destination}.${randomUUID()}.tmp`;
  db.exec(`VACUUM INTO '${temporary.replaceAll("'", "''")}'`);
  chmodSync(temporary, 0o600);
  const fd = openSync(temporary, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  try { linkSync(temporary, destination); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  finally { unlinkSync(temporary); }
  const directory = openSync(dirname(path), 'r');
  try { fsyncSync(directory); } finally { closeSync(directory); }
}

/** Apply each immutable migration in its own transaction, after its recoverable backup. */
export function migrate(db: DatabaseSync, migrations: readonly Migration[], path = ':memory:'): void {
  db.exec('CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL)');
  if (!db.prepare('PRAGMA table_info(migrations)').all().some(row => row.name === 'checksum')) db.exec('ALTER TABLE migrations ADD COLUMN checksum TEXT');
  const versions = db.prepare('SELECT version,checksum FROM migrations ORDER BY version').all();
  const ordered = [...migrations].sort((a,b) => a.version - b.version);
  if (new Set(ordered.map(m => m.version)).size !== ordered.length) throw new Error('Duplicate migration version');
  for (const row of versions) {
    const migration = ordered.find(m => m.version === row.version);
    if (!migration) throw new Error('Database version is newer than this application');
    if (row.checksum && row.checksum !== migrationChecksum(migration.sql)) throw new Error(`Migration ${migration.version} checksum mismatch`);
  }
  for (const migration of ordered) {
    const checksum = migrationChecksum(migration.sql);
    if (versions.some(row => row.version === migration.version)) {
      db.prepare('UPDATE migrations SET checksum=? WHERE version=? AND checksum IS NULL').run(checksum, migration.version);
      continue;
    }
    if (path !== ':memory:') backupBeforeMigration(db, path, migration.version);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO migrations(version,appliedAt,checksum) VALUES(?,?,?)').run(migration.version, new Date().toISOString(), checksum);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Migration foreign key check failed');
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
}
