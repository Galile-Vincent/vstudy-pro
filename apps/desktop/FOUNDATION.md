# Phase 1 foundation

Source builds require Node >=24.15.0. The workspace selects pnpm 10.28.2. All direct dependencies are exact versions; the lockfile pins transitives. Electron 42.11.16 embeds Node 24.19.0 and runs `node:sqlite` without flags or native ABI rebuilds. Both Vitest and the real Electron smoke test exercise that SQLite implementation.

Run from the repository root:

- `pnpm install`
- `pnpm dev`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm smoke` (builds and launches a real, visible Electron window, then closes it)
- `pnpm package` (electron-builder macOS dmg and app directory; signing requires release configuration)

## IPC contract

`src/shared/ipc.ts` is authoritative. Request and response types are inferred from its zod schemas. Preload exposes exactly `window.desktop.invoke(channel, request)` and `window.desktop.onChatEvent(requestId, listener)`. It exposes no Electron objects, raw send/listen methods, filesystem access, or secret getter. All invoke handlers register through `createIpcRegistrar`, which rejects untrusted senders, parses every payload, and validates every response. Only the current window's main frame at the app entry URL is trusted. No-argument requests still require `{}`; unknown request fields are rejected.

`Ack` means `{ok: true}`. IDs are UUID strings branded by their schemas. Dates are ISO datetime strings. Settings are a complete replacement, not a patch: `{chatSide: 'left'|'right', lastProviderId: ProviderId|null, lastModelId: string|null}`.

| Channel                | Request                              | Response                                                                  | Phase 1        |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------- | -------------- | ---- |
| `documents:import`     | `{}` (main will own the file dialog) | `Document                                                                 | null` (cancel) | stub |
| `documents:list`       | `{}`                                 | `Document[]`                                                              | stub           |
| `documents:get`        | `{documentId}`                       | `Document                                                                 | null`          | stub |
| `documents:read`       | `{documentId}`                       | Markdown `string`                                                         | stub           |
| `documents:retry`      | `{documentId}`                       | `Document`                                                                | stub           |
| `documents:delete`     | `{documentId}`                       | `Ack`                                                                     | stub           |
| `conversations:create` | `{documentId, providerId, modelId}`  | `Conversation`                                                            | stub           |
| `conversations:list`   | `{documentId}`                       | `Conversation[]`                                                          | stub           |
| `conversations:delete` | `{conversationId}`                   | `Ack`                                                                     | stub           |
| `messages:list`        | `{conversationId}`                   | `Message[]`                                                               | stub           |
| `settings:get`         | `{}`                                 | `Settings`                                                                | implemented    |
| `settings:set`         | `Settings`                           | `Settings`                                                                | implemented    |
| `providers:list`       | `{}`                                 | `{config: ProviderConfig, availability: Availability, models: Model[]}[]` | stub           |
| `providers:configure`  | `ProviderConfig`                     | `Ack`                                                                     | stub           |
| `secrets:set`          | `{providerId, key}`                  | `Ack`                                                                     | implemented    |
| `secrets:has`          | `{providerId}`                       | `{providerId, hasKey}`                                                    | implemented    |
| `secrets:delete`       | `{providerId}`                       | `Ack`                                                                     | implemented    |
| `chat:start`           | `ChatRequest`                        | `Ack`                                                                     | stub           |
| `chat:abort`           | `{requestId}`                        | `Ack`                                                                     | stub           |

All stub handlers validate the request and then throw exactly `Error('not implemented')`. Electron invocation failures reject the renderer promise. Repositories are implemented independently; document/conversation/message IPC remains stubbed for later service workers.

Provider IDs: `anthropic-api`, `openai-api`, `openai-compatible`, `claude-cli`, `codex-cli`, `agy-cli`. Provider config is a discriminated union: `{kind:'api', id, enabled}`, `{kind:'compatible', id:'openai-compatible', baseUrl, enabled}`, or `{kind:'cli', id, enabled}`. Config never contains a key. `Availability` is `{available:true}|{available:false, reason:string}`; `Model` is `{id, name}`.

### Streaming protocol for the chat worker

`ChatRequest` contains `{requestId, conversationId, documentId, providerId, modelId, userMessage, selection?}`. Selection document ID must match the request document ID. Main must also check conversation/document/provider consistency when implementing the service.

1. Renderer creates a fresh UUID and subscribes with `onChatEvent(requestId, listener)` **before** invoking `chat:start`.
2. Main will own an AbortController per active request ID and originating webContents. Duplicate active IDs must reject. The start acknowledgement means accepted; streaming completion is a separate event.
3. Main sends only to the originating webContents, on `chat:events`, with the validated envelope `{requestId, event}`. Events are `{type:'text-delta', text}`, `{type:'done'}`, or `{type:'error', message}`. Preload validates envelopes and filters by request ID before calling the listener. The shared event topic is multiplexed by request ID; IDs never become arbitrary IPC channel names.
4. A stream emits zero or more deltas followed by exactly one terminal `done` or `error`. Abort is idempotent for an unknown/already finished ID. Active abort terminates the producer and emits `done`; no later deltas may follow. Request ownership must be checked on abort.
5. Renderer calls the returned unsubscribe function on terminal event, start rejection, or unmount. Main must release controllers on terminal event and abort all owned requests when their window is destroyed. Main emits no document/API-key content in error diagnostics.

This is the agreed protocol, not an implemented chat service. The adapter registry and chat/document services are deliberate extension points.

## Persistence and security

`openStore(path)` owns a synchronous SQLite connection, transactional numbered migrations, WAL for disk databases, foreign keys with cascades, and bound query values. Repositories expose documents (`insert/get/findByHash/list/transition/delete`), conversations (`insert/get/list/delete`), messages (`insert/list`), and settings (`get/set`), plus `close`. Domain objects and database rows are parsed through shared schemas. Content hashes are unique. Failed documents require an error; other statuses exclude it. The transition table is `converting -> ready|failed`, `failed -> converting`, `ready -> []`. Settings default to chat on the left and no last provider/model.

Runtime paths are `<userData>/vstudy.sqlite` and `<userData>/secrets.json`. Secret ciphertext is supplied by Electron `safeStorage`; writes use atomic replacement and mode 0600. Encryption unavailability fails closed. `getInMainOnly` exists only in the main service and has no IPC route. Unit tests inject reversible test encryption; OS Keychain encryption itself is not exercised by those tests.

Windows use context isolation, sandboxing, disabled Node integration, denied popups/webviews/permissions, app-entry-only navigation, and response-header CSP. Production CSP allows local scripts/styles only, with no network connections. Development permits Vite's nonce-bearing refresh script, injected styles, and its local WebSocket. External links, Markdown sanitization, converter restrictions, and CLI execution restrictions belong to subsequent workers; no such execution is implemented here.

`resources/converter/` contains only an index stub and README. The pinned Python requirements and conversion CLI belong to the later converter phase.

## File tree

```text
package.json / pnpm-workspace.yaml / pnpm-lock.yaml
apps/desktop/
  package.json / tsconfig.json / electron.vite.config.ts
  eslint.config.mjs / vitest.config.ts / FOUNDATION.md
  scripts/smoke.mjs
  resources/converter/{index.ts,README.md}
  src/
    shared/{domain.ts,domain.test.ts,ipc.ts,index.ts}
    main/
      index.ts / security.ts / security.test.ts
      db/{index.ts,index.test.ts}
      ipc/{index.ts,register.ts,register.test.ts}
      providers/index.ts
      services/{secrets.ts,secrets.test.ts,documents.ts,chat.ts}
    preload/index.ts
    renderer/{index.html,main.tsx,style.css,env.d.ts}
```

## Verified in Phase 1

- `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (10 tests), `pnpm build`, and `pnpm smoke` pass.
- `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @vstudy/desktop exec electron-builder --mac dir --publish never` produces an unsigned arm64 `.app`.
- From `apps/desktop`, `VSTUDY_EXECUTABLE="$PWD/release/mac-arm64/VStudy Pro.app/Contents/MacOS/VStudy Pro" node scripts/smoke.mjs` also passes against the packaged application.
- Both launch checks confirm a visible window, sandbox/context isolation, disabled renderer Node access, exactly two bridge methods, a settings IPC round trip, and persisted settings after a reload. Each uses a temporary user-data directory and closes the app afterward.
- DMG creation, signing/notarization, real safeStorage Keychain encryption, and other CPU/OS targets are not verified. The converter, document pipeline, providers, and chat remain the specified stubs.
