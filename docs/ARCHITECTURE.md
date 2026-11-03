# vstudy-pro architecture

A macOS desktop app. Import documents (PDF, DOCX, PPTX, XLSX, HTML, CSV, MD, TXT), convert them to Markdown with a conservative pdfplumber pipeline for PDF and Microsoft MarkItDown for other formats or PDF fallback, read the Markdown on the right, chat with an AI model on the left. Selected passages become prompt context; answers still need verification.

## Decision: Electron + React + TypeScript (not native SwiftUI)

| Need | Why Electron/React wins |
|---|---|
| assistant-ui chat components | React only. No native equivalent. |
| Markdown rendering with selection | DOM selection + `Range` gives exact offsets. Mature remark/rehype ecosystem. |
| Reuse t3code patterns | t3code is Electron + React + TS and spawns provider CLIs from a Node main process. |
| MarkItDown | Python sidecar either way. |
Cost: bigger bundle. Accepted.

## Process model

```
Renderer (React, sandboxed, no Node)  <--typed IPC (contextBridge)-->  Main (Node)
                                                                     |- DocumentService  -> Converter sidecar (Python markitdown, child process)
                                                                     |- ChatService      -> ProviderRegistry -> adapters
                                                                     |- Store            -> SQLite
                                                                     |- SecretStore      -> Electron safeStorage (Keychain-backed)
```

Security rules (non-negotiable):
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, strict CSP, deny `window.open`/navigation to non-app origins.
- Renderer talks to main only via a small preload API; every IPC payload is validated with zod in main.
- API keys are entered by the renderer but never read back to it. Explicitly saved keys use asynchronous `safeStorage` encryption in a 0600 userData file; session keys remain in main memory. Presence checks never decrypt. Saved keys require explicit unlocking, with a bounded Keychain wait.
- Markdown is rendered with raw HTML disabled and `rehype-sanitize`. Allowed http/https/mailto links require native confirmation before opening the browser or mail application.
- Converter runs with an argv array (no shell), a timeout, a size cap, and a temp working dir. Imported file is copied into the app library by content hash first.
- CLI providers are spawned with argv arrays, no shell, scrubbed env, cwd = a private temporary working directory, read-only/no-tools flags where the CLI supports it.

## Domain model (organizing structures)

- `Document { id, title, sourceName, sourceHash, sourcePath, mime, status: 'converting'|'ready'|'failed', error?, markdownPath, converter: 'pdf_md'|'markitdown', createdAt }`
  Status is a closed union driven by a reducer-style transition table, not scattered booleans.
- `Selection { documentId, startOffset, endOffset, text, headingPath: string[], page?: number }`
  Offsets are into the stored Markdown source, resolved from rendered DOM through `data-start`/`data-end` source offsets emitted by the renderer plugin. Section selection = a heading node range.
- `Conversation { id, documentId, providerId, modelId, createdAt }`, `Message { id, conversationId, role, parts(json), createdAt }`.
- `ProviderConfig` is a registry persisted in `providers.json`, keyed by id:
  - `anthropic-api`, `openai-api`, `openai-compatible` (base URL + key): HTTP streaming adapters.
  - `claude-cli`, `codex-cli`: local CLI adapters, OFF by default. Before opt-in, fixed-directory file metadata is checked without reading binary contents or launching it; inherited PATH is ignored. Main validates explicit executable choices and confirms changed hashes before use. CLI logins are managed outside the app; the Codex transport copies `auth.json` into its private temporary home and deletes that copy after the request. See [transport limits](codex-tool-free.md).
  - `agy-cli`: optional adapter; defaults OFF. File-only resolution precedes explicit opt-in, then the adapter may launch the CLI.
- `ProviderAdapter` interface: `detect(): Promise<Availability>`, `listModels(): Promise<Model[]>`, `stream(req: ChatRequest, signal): AsyncIterable<ChatEvent>`. `shared/domain.ts` defines streamed text/reasoning, usage, validated read-only table calls, completion and errors. One interface, many adapters.
- Prompt assembly is a pure function: `buildPrompt({document, selection?, history, userMessage})`. Selected text goes in a delimited block marked as untrusted document content (prompt-injection hygiene); when no selection, a bounded excerpt/outline of the doc is used.

## Storage

- SQLite via `node:sqlite`, WAL mode, `PRAGMA foreign_keys=ON`, versioned migrations table, all queries parameterized.
- Library files under `app.getPath('userData')/library/<hash>/{source.ext,content.md}`.
- Settings (layout side, last provider/model) in SQLite `settings` table.

## Converter

- PDFs run the pure `pdf_md` geometry stages first (characters → lines → blocks → classification → Markdown). Only ruling lines/rectangles produce tables. PDF FreeText annotations stay separate from page text. `NO_TEXT_LAYER` and parser exceptions trigger MarkItDown fallback. Page comments are hidden by the existing raw-HTML-disabled renderer and retained for source offsets. Raster images currently produce an explicit omission placeholder. Parser identity is returned in a temporary JSON sidecar, validated by main, and persisted with an additive SQLite migration.
- `resources/converter/`: hash-locked `requirements.lock.txt`, plus the pinned requirements reference and `convert.py` (`convert.py <input> <temporary-output.md> <library-output.md>` exits non-zero with structured diagnostics; raw stderr is not displayed).
- A lock-matching private `userData/converter-venv` is reused. First required conversion asks permission before installing with uv (preferred), or Python 3.10+ venv/pip, with required hashes. Settings > Privacy provides Retry/Offline controls. Workers deny network on macOS and stop after configurable idle time.
- Native `.md`/`.txt` files skip conversion (copy through).
- Conversion is a queued, idempotent job keyed by source hash: re-importing the same file reuses the result.

## UI (renderer)

- Vite + React 19 + Tailwind + shadcn-style primitives, assistant-ui (`@assistant-ui/react`) with a custom `ChatModelAdapter` that bridges to main over IPC streaming (`ipcRenderer` event channel per request id, abortable).
- Layout: resizable two-pane (`react-resizable-panels`). Chat pane left by default, a toggle swaps sides; choice persisted. Document list in a collapsible sidebar/drawer.
- Right pane: Markdown viewer (react-markdown + remark-gfm + remark-math + rehype-katex + rehype-sanitize + syntax highlighting), tables, images, code, task lists. Shows converting/failed states.
- Selecting text shows a floating "Ask about this" action; the selection becomes a removable chip above the composer and is sent with the next message. Clicking a heading offers "Use this section".
- Model picker in the composer: grouped by provider, shows availability, "Add API key" inline. Settings manages keys, per-CLI opt-ins and validated executable choices. Privacy shows app-initiated session activity, converter Retry/Offline/idle controls and typed deletion confirmation.
- Visual language follows t3code: dense, calm neutral palette, system font, light/dark following macOS, hairline borders.

## Layout of the repo

```
apps/desktop/                 Electron app (single package is fine; keep these dirs)
  src/main/                   index.ts, ipc/, services/{documents,chat,secrets}.ts, db/, providers/
  src/preload/                index.ts (typed bridge)
  src/shared/                 zod schemas, IPC contract types, domain types (imported by main + renderer)
  src/renderer/               React app
  resources/converter/        convert.py, requirements.lock.txt
docs/ARCHITECTURE.md
```
Root: pnpm workspace, `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm package` (electron-builder, mac dmg/dir).

## Testing

- Unit: prompt builder, state transitions, selection offset resolution, provider event parsing (fixture streams), zod IPC validation, migrations.
- Integration: converter on real fixtures (docx, pptx, xlsx, pdf, html) producing non-empty Markdown; DB store round trip.
- E2E: Playwright `_electron` launches the real app: import a fixture, see Markdown, select text, send a chat to a fake local provider, assert the selection reached the prompt.

The converter starts only on demand, never on launch; idle shutdown defaults to five minutes. Math and explicitly named code languages load on demand. Structured presentations render only validated local tables; unused HTML/map/Mermaid/favicon implementations were removed.
