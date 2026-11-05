# Work on VStudy Pro

Run commands from the repository root unless a path is specified. Use Node 24.19.0 and pnpm 10.28.2. The Node version files select the tested runtime. The package engine permits Node >=24.11.1.

## Find the owner of a change

| Path | Responsibility |
| --- | --- |
| `apps/desktop/src/main/index.ts` | Electron startup, window lifetime, security, and shutdown. |
| `apps/desktop/src/main/ipc/` | Trusted-sender registration and adapters from validated requests to services. |
| `apps/desktop/src/main/services/` | Imports, conversion, chat, library operations, and filesystem ownership. |
| `apps/desktop/src/main/db/` | SQLite migrations, repositories, transactions, and indexes. |
| `apps/desktop/src/main/moodle/` | School discovery, authentication, Moodle calls, sync, and course data. |
| `apps/desktop/src/main/providers/` | API and CLI provider execution and model discovery. |
| `apps/desktop/src/preload/` | The isolated, typed bridge exposed as `window.desktop`. |
| `apps/desktop/src/shared/` | Zod transport contracts, domain types, locales, and pure helpers used by both processes. |
| `apps/desktop/src/renderer/` | React views, interactions, reader, chat, and theme tokens. No Node access. |
| `apps/desktop/resources/converter/` | Python conversion worker and hash-locked requirements. |
| `apps/desktop/e2e/` | Playwright scripts that exercise real Electron artifacts. |
| `apps/desktop/test-fixtures/` | Versioned inputs needed to reproduce tests. |

Read [architecture](ARCHITECTURE.md), [the data model](DATA_MODEL.md), and [security](SECURITY.md) before changing process boundaries or persistence.
`apps/desktop/FOUNDATION.md` describes the early foundation snapshot. Its stub lists and old version counts are historical.

## Install and run

1. Run `pnpm install --frozen-lockfile`. A source archive without Git skips hook setup. CI skips hooks too.
2. Run `pnpm dev` on a macOS machine with enough available RAM. Electron and Vite start together. Stop with Ctrl+C.
3. Reproduce the issue using synthetic documents and a local test provider before using student data or paid providers.

GUI commands in this guide were deliberately not launched during stream H verification because of the operator's memory constraint.

## Check a change

Run these commands sequentially on a memory-constrained machine.

```sh
pnpm typecheck
pnpm typecheck-fast
pnpm lint
pnpm test --pool=forks --maxWorkers=2
pnpm build
pnpm security:static
pnpm vendor:check
pnpm knip
```

`typecheck-fast` checks the same project with an incremental cache under ignored `node_modules/.cache`. It does not emit application code.
`security:static` runs the dependency policy and security lint. `pnpm security:check` adds full lint and the test suite with two workers. Avoid repeating that suite when RAM is scarce.
Integration tests gated by converter environment variables skip unless those dependencies are configured. A skip is not evidence of converter behavior.

Run one test file during development.

```sh
pnpm --filter @vstudy/desktop exec vitest run src/main/ipc/register.test.ts --pool=forks --maxWorkers=2
```

When GUI verification is authorized, `pnpm smoke` builds and launches Electron. `pnpm e2e` builds, prepares converter dependencies and an unsigned package, then launches Electron tests. Both require more memory and may create child processes. See [README](../README.md) for converter environment overrides.

## Debug a failure

Start with the failing test command above. For a renderer failure, use Electron's developer tools in a local `pnpm dev` session. Inspect preload request shapes and the main-process terminal output for IPC failures. Do not weaken the production CSP or enable Node integration to debug.

For a main-process failure, add a focused service test using injected dependencies. Inspect redacted main logs in `src/main/logging.ts`. Never log tokens, cookies, document text, or passwords. For database failures, reproduce against a temporary database and inspect migration assertions. Avoid editing a student's live database.

## Add an IPC channel

1. Add strict request and response Zod schemas to `src/shared/ipc.ts` or a domain contract spread into it.
2. Implement the service operation in main. Keep filesystem access and secrets there.
3. Register the handler through `createIpcRegistrar` in the relevant `src/main/ipc/` module. Wire that registrar from `src/main/ipc/index.ts`.
4. Invoke the typed channel through `window.desktop.invoke` in the renderer. The generic preload bridge usually needs no change.
5. Extend registrar and handler tests for valid requests, invalid fields, untrusted senders, response validation, and ownership checks.

Keep `contextIsolation`, sandboxing, and sender validation enabled. Never expose Electron objects or raw IPC methods through preload.

## Add a migration

1. Append a unique increasing `{version, sql}` entry to the `migrations` array in `src/main/db/index.ts`. Put large SQL in a domain migration module.
2. Keep applied migrations unchanged. Add a forward migration instead of rewriting old SQL.
3. Extend the repository and its schema parsing together. Bind query parameters.
4. Test a fresh store and an upgrade from the prior schema with populated rows. Check foreign keys, indexes, rollback, data preservation, and repeated opens.
5. For a destructive migration, add and test a backup policy before applying it. Existing backup special cases do not automatically cover a new version.

## Add a locale string

1. Add the same key to the matching JSON namespace under `src/shared/locales/en`, `zh-Hant`, and `ja`.
2. Use the namespace-qualified key through the existing translation helper or React translation hook. Preserve interpolation names across locales.
3. For a new namespace, register it in `src/shared/i18n.ts` for every language and the pseudo-locale.
4. Run lint and locale tests. Check narrow layouts with long and pseudo-localized labels when GUI work is authorized.

## Add a Moodle function call

1. Define a Zod schema for the wire response and map it to a main-owned domain result in `src/main/moodle/client.ts` or its domain parser module.
2. Use `MoodleClient.call(name, params, schema)` so capability checks, scheduling, language handling, diagnostics, and authentication errors stay consistent.
3. Integrate the method into `src/main/moodle/service.ts`. Preserve unsupported, permission, offline, and expired-session states. Do not hide authentication errors as empty data.
4. Extend the fake-fetch fixtures and client tests. Cover older servers, omitted fields, malformed payloads, and unsupported functions.
5. If the renderer needs new data, add a validated shared contract and IPC handler. Keep Moodle tokens and authenticated sessions in main.

Use read-only Moodle functions unless the user explicitly approves a write action. Never put tokens in renderer URLs or evidence files.

## Prepare a release

Follow [CONTRIBUTING](../CONTRIBUTING.md). `pnpm release` regenerates the changelog only. Signed packaging uses `pnpm package:signed` and requires external credentials. Unsigned tag builds are test artifacts.

See [the stream H command report](REPO_HYGIENE.md) for commands run, failures, and checks deliberately deferred in this checkout.
