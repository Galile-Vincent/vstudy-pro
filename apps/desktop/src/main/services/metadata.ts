import type { DatabaseSync } from 'node:sqlite';
import { readFile, stat } from 'node:fs/promises';
import { containedPath } from './file-paths';
export async function backfillMetadata(db: DatabaseSync, root: string, stopped: () => boolean, batchSize = 32): Promise<void> {
  while (!stopped()) {
    const rows = db.prepare('SELECT id,sourcePath,markdownPath FROM documents WHERE metadataBackfilled=0 LIMIT ?').all(batchSize);
    if (!rows.length) return;
    for (const row of rows) {
      if (stopped()) return;
      let size: number | null = null, chars: number | null = null, pages: number | null = null;
      try { const info = await stat(containedPath(root,String(row.sourcePath))); if(info.isFile()) size=info.size; } catch { /* Missing or escaped files stay unknown. */ }
      try {
        const path=containedPath(root,String(row.markdownPath));
        if ((await stat(path)).size <= 8*1024*1024) {
          const text=await readFile(path,'utf8'); chars=text.length;pages=(text.match(/<!--\s*page\b/gi)??[]).length||null;
        }
      } catch { /* Missing Markdown stays unknown. */ }
      if (stopped()) return;
      db.prepare('UPDATE documents SET sizeBytes=?,contentChars=?,pageCount=?,metadataBackfilled=1 WHERE id=? AND metadataBackfilled=0').run(size,chars,pages,String(row.id));
    }
    await new Promise<void>(resolve=>setImmediate(resolve));
  }
}
