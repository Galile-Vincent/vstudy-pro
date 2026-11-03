# vstudy-pro architecture

A macOS desktop app. Import documents (PDF, DOCX, PPTX, XLSX, HTML, CSV, MD, ...), convert them to Markdown with a conservative pdfplumber pipeline for PDF and Microsoft MarkItDown for other formats or PDF fallback, read the Markdown on the right, chat with an AI agent on the left. The user can select a passage and the agent answers grounded in that selection.

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
- API keys live only in main. Encrypted with `safeStorage`, stored in a file under userData with mode 0600. Never sent to the renderer; renderer sees only `{providerId, hasKey}`.
- Markdown is rendered with raw HTML disabled (or `rehype-sanitize`). Links open in the system browser after scheme allowlist (http/https/mailto).
- Converter runs with an argv array (no shell), a timeout, a size cap, and a temp working dir. Imported file is copied into the app library by content hash first.
- CLI providers are spawned with argv arrays, no shell, scrubbed env, cwd = a per-conversation empty temp dir, read-only/no-tools flags where the CLI supports it.

## Domain model (organizing structures)

- `Document { id, title, sourceName, sourceHash, sourcePath, mime, status: 'converting'|'ready'|'failed', error?, markdownPath, converter: 'pdf_md'|'markitdown', createdAt }`
  Status is a closed union driven by a reducer-style transition table, not scattered booleans.
- `Selection { documentId, startOffset, endOffset, text, headingPath: string[], page?: number }`
  Offsets are into the stored Markdown source, resolved from rendered DOM through `data-sourcepos` line/column attributes emitted by the renderer plugin. Section selection = a heading node range.
- `Conversation { id, documentId, providerId, modelId, createdAt }`, `Message { id, conversationId, role, parts(json), createdAt }`.
- `ProviderConfig` is a registry (table), keyed by id, not branching:
  - `anthropic-api`, `openai-api`, `openai-compatible` (base URL + key): HTTP streaming adapters.
  - `claude-cli`, `codex-cli`: local CLI adapters. Detected by probing `PATH` and well-known locations (`~/.local/bin`, `/opt/homebrew/bin`). Auth is the CLI's own login, the app never touches those tokens.
  - `agy-cli`: optional adapter, same detection mechanism; shipped as "detected if present".
- `ProviderAdapter` interface: `detect(): Promise<Availability>`, `listModels(): Promise<Model[]>`, `stream(req: ChatRequest, signal): AsyncIterable<ChatEvent>`. `ChatEvent = text-delta | done | error`. One interface, many adapters.
- Prompt assembly is a pure function: `buildPrompt({document, selection?, history, userMessage})`. Selected text goes in a delimited block marked as untrusted document content (prompt-injection hygiene); when no selection, a bounded excerpt/outline of the doc is used.

## Storage

- SQLite via `better-sqlite3` (or `node:sqlite` if the Electron Node supports it without flags), WAL mode, `PRAGMA foreign_keys=ON`, versioned migrations table, all queries parameterized.
- Library files under `app.getPath('userData')/library/<hash>/{source.ext,content.md}`.
- Settings (layout side, last provider/model) in SQLite `settings` table.

## Converter

- PDFs run the pure `pdf_md` geometry stages first (characters → lines → blocks → classification → Markdown). Only ruling lines/rectangles produce tables. PDF FreeText annotations stay separate from page text. `NO_TEXT_LAYER` and parser exceptions trigger MarkItDown fallback. Page comments are hidden by the existing raw-HTML-disabled renderer and retained for source offsets. Raster images currently produce an explicit omission placeholder. Parser identity is returned in a temporary JSON sidecar, validated by main, and persisted with an additive SQLite migration.
- `resources/converter/`: pinned `requirements.txt` (`markitdown[all]` pinned version), a small `convert.py` CLI (`convert.py <in> <out.md>` exits non-zero with a JSON error on stderr).
- Python resolved in order: bundled venv at `userData/converter-venv` created on first run via `python3 -m venv` + `pip install -r`, or `uvx`/`uv` if present. First-run bootstrap shows progress and a retry path in the UI.
- Native `.md`/`.txt` files skip conversion (copy through).
- Conversion is a queued, idempotent job keyed by source hash: re-importing the same file reuses the result.

## UI (renderer)

- Vite + React 19 + Tailwind + shadcn-style primitives, assistant-ui (`@assistant-ui/react`) with a custom `ChatModelAdapter` that bridges to main over IPC streaming (`ipcRenderer` event channel per request id, abortable).
- Layout: resizable two-pane (`react-resizable-panels`). Chat pane left by default, a toggle swaps sides; choice persisted. Document list in a collapsible sidebar/drawer.
- Right pane: Markdown viewer (react-markdown + remark-gfm + remark-math + rehype-katex + rehype-sanitize + syntax highlighting), tables, images, code, task lists. Shows converting/failed states.
- Selecting text shows a floating "Ask about this" action; the selection becomes a removable chip above the composer and is sent with the next message. Clicking a heading offers "Use this section".
- Model picker in the composer: grouped by provider, shows availability, "Add API key" inline. Settings dialog manages keys and detected CLIs.
- Visual language follows t3code: dense, calm neutral palette, system font, light/dark following macOS, hairline borders.

## Layout of the repo

```
apps/desktop/                 Electron app (single package is fine; keep these dirs)
  src/main/                   index.ts, ipc/, services/{documents,chat,secrets}.ts, db/, providers/
  src/preload/                index.ts (typed bridge)
  src/shared/                 zod schemas, IPC contract types, domain types (imported by main + renderer)
  src/renderer/               React app
  resources/converter/        convert.py, requirements.txt
docs/ARCHITECTURE.md
```
Root: pnpm workspace, `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm package` (electron-builder, mac dmg/dir).

## Testing

- Unit: prompt builder, state transitions, selection offset resolution, provider event parsing (fixture streams), zod IPC validation, migrations.
- Integration: converter on real fixtures (docx, pptx, xlsx, pdf, html) producing non-empty Markdown; DB store round trip.
- E2E: Playwright `_electron` launches the real app: import a fixture, see Markdown, select text, send a chat to a fake local provider, assert the selection reached the prompt.
