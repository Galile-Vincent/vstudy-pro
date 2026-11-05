# Chat history

The shell History view, Cmd/Ctrl+K finder, and scoped conversation picker use `HistorySearch` and `HistoryResults`. The result list uses assistant-ui thread primitives. Titles, pins, archive state, and deletion state live in SQLite. A startup import moves existing localStorage thread titles to SQLite one entry at a time.

`shared/chat-history.ts` owns strict zod requests and responses. `chats:search` returns conversation groups with up to three matching message snippets and a stable message ID for each jump. `chats:get` loads the existing conversation contract. `chats:facets` supplies local course, term, document, and model choices. `chats:update` applies a title or state patch.

`main/db/chat-history.ts` owns search and metadata writes. Search uses quoted literal FTS5 trigram phrases, BM25 title weighting, and bound parameters. Queries shorter than three Unicode codepoints use escaped literal LIKE. Pagination orders by rank, updated time descending, and UUID descending. Recent browsing uses a zero rank. Concurrent writes can move results between pages. The client discards stale query responses and deduplicates appended pages.

A conversation scope is document, course, or general. Document chats can also be filtered through their linked Moodle file's course. Term comes from cached course identity. Provider and model remain conversation metadata. Citation and attached-passage flags are derived from active message parts. The app does not persist arbitrary file attachments in chat messages. Course dots use a stable course-ID mapping to existing theme colors.

The v18 migration lives in its own file. It rebuilds the conversation scope constraint and preserves messages, superseded branches, and parent links before backfilling FTS. It does not rewrite earlier migrations. Existing disk databases get a WAL checkpoint and mode-0600 `.before-v18.bak` before the transaction. Automatic downgrade is unsupported. Coordinate its version number when integrating other migration streams.

Database triggers synchronize inserted, edited, superseded, deleted, and cascaded messages, as well as title changes. Archived chats require the archive filter. Deletion hides a chat immediately. Undo is available for 30 seconds. IPC maintenance purges expired chats every 30 seconds while the app runs and cancels that timer at shutdown. Pending deletions survive restart.

Snippets contain plain `[mark]` markers. `HistorySnippet` creates React text and mark nodes. It never renders trusted HTML. Message roots expose a message ID so either finder can scroll and focus a matching message.

## Verification

Run from `apps/desktop`:

```sh
pnpm typecheck
pnpm lint
pnpm test --pool=forks --maxWorkers=2 src/main/db/chat-history.test.ts src/renderer/history/history.test.tsx
pnpm build
node e2e/chat-history.mjs
```

The Electron test uses one isolated user-data directory, closes its instance in `finally`, and saves screenshots and an accessibility snapshot under `docs/evidence/chat-history`. It exercises real IPC and a fake local provider without opening a server.

Search currently executes on the main SQLite connection. Large-history latency and utility-process isolation have not been measured. Opening a conversation uses `messages:list`, so a very long individual conversation still loads as one array.
