/** Chat queries use the same killable process boundary as document search. */
import { expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchInWorker, SEARCH_TIMEOUT } from './search-runner';
import { chatSearchSchema } from '../../shared/chat-history';

it('routes chat requests to a child process', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chat-worker-'));
  try {
    const entry = join(root, 'worker.cjs');
    await writeFile(entry, `process.once('message', job => process.send(job.kind === 'chat' && job.request.query === '資料' ? {result:{items:[],nextCursor:null}} : {error:'Wrong job'}));`);
    await expect(searchInWorker('chats:search', chatSearchSchema.parse({ query: '資料' }), 'db.sqlite', '', 1500, entry)).resolves.toEqual({ items: [], nextCursor: null });
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('kills stuck chat searches at their deadline while the caller keeps running', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chat-timeout-'));
  try {
    const entry = join(root, 'worker.cjs');
    await writeFile(entry, `process.once('message', () => { while(true) {} });`);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    try {
      await expect(searchInWorker('chats:search', chatSearchSchema.parse({ query: 'common' }), 'db.sqlite', '', 100, entry)).rejects.toThrow(SEARCH_TIMEOUT);
      expect(ticks).toBeGreaterThan(2);
    } finally { clearInterval(timer); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
