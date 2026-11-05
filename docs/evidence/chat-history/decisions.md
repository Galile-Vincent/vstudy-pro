# History implementation decisions

The goal is to find old questions and answers across every chat and filter them by course, document, and message type.

Model the Domain shaped the search contract. A result is one conversation with explicit scope and bounded matching-message records. Scope constraints remain in SQLite and zod.

Prove It Works shaped verification. SQLite fixtures cover multilingual text, rank order, pagination, trigger synchronization, filters, and the v17 upgrade. The Electron script drives History and captures screenshots.

The existing assistant-ui thread list primitives remain the list foundation. The document and course conversation picker now opens the same search component as the shell. It no longer loads every conversation's messages to derive summaries.

The migration is additive and isolated in `chat-history-migration.ts`. Its v18 registration and backup hook are the integration points for stream E. The migration number must remain unique after integration.

The implementation runs in-thread because this is an implementation delegate. No child agents or background servers were started. Vitest uses two fork workers and no watch mode.

Main was merged after streams H, A, and B landed. The locale conflict keeps every history, schools, and themes namespace in each language and pseudo-localization. History now reads semantic theme tokens, including chart colors, selection highlights, and keyboard focus.
