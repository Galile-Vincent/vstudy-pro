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

Run only one Electron instance at a time. Stop every process started for verification.

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

For GUI verification, `pnpm smoke` builds and launches Electron. `pnpm e2e` builds, prepares converter dependencies and an unsigned package, then launches Electron tests. Both require more memory and may create child processes. See [README](../README.md) for converter environment overrides.

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

1. Append a unique increasing `{version, sql}` entry to the `migrations` array in `src/main/db/migrations.ts`. Put large SQL in a domain migration module.
2. Keep applied migrations unchanged. Add a forward migration instead of rewriting old SQL.
3. Extend the repository and its schema parsing together. Bind query parameters.
4. Test a fresh store and an upgrade from the prior schema with populated rows. Check foreign keys, indexes, rollback, data preservation, and repeated opens.
5. For a destructive migration, add and test a backup policy before applying it. The migration runner backs up existing disk databases before every pending version. Test the domain-specific recovery path as well.

## Add a locale string

1. Add the same key to the matching JSON namespace under `src/shared/locales/en`, `zh-Hant`, and `ja`.
2. Use the namespace-qualified key through the existing translation helper or React translation hook. Preserve interpolation names across locales.
3. For a new namespace, create its JSON file in all three locale directories. `scripts/generate-locales.mjs` discovers namespaces automatically and rejects differing inventories. Install, dev, build, test, and typecheck run it. Never edit the ignored `src/shared/locales.generated.ts`.
4. Run lint and locale tests. Check narrow layouts with long and pseudo-localized labels when GUI work is authorized.

## Add a Moodle function call

1. Define a Zod schema for the wire response and map it to a main-owned domain result in `src/main/moodle/client.ts` or its domain parser module.
2. Use `MoodleClient.call(name, params, schema)` so capability checks, scheduling, language handling, diagnostics, and authentication errors stay consistent.
3. Integrate the method into `src/main/moodle/service.ts`. Preserve unsupported, permission, offline, and expired-session states. Do not hide authentication errors as empty data.
4. Extend the fake-fetch fixtures and client tests. Cover older servers, omitted fields, malformed payloads, and unsupported functions.
5. If the renderer needs new data, add a validated shared contract and IPC handler. Keep Moodle tokens and authenticated sessions in main.

Use read-only Moodle functions unless the user explicitly approves a write action. Never put tokens in renderer URLs or evidence files.

## Prepare a release

Follow [the release checklist](../CONTRIBUTING.md#release-checklist). The desktop package version is authoritative. `pnpm release --tag vX.Y.Z` regenerates the changelog only. Write the owner-reviewed release body in `docs/releases/X.Y.Z.md`. Do not create or push a tag during implementation or a dry run.

The release workflow supports dry runs on `ci/**` branch pushes and `workflow_dispatch` with `dry_run: true`. Push only a branch the owner has authorized. A `ci/**` push and a manual dry run receive no signing secrets, create no release, and upload no files to Releases. They retain unsigned installers and reports as Actions artifacts. A non-dry dispatch is allowed only against the exact version tag and publishes that release. It requires the same owner approval as pushing the tag.

Inspect real GitHub-hosted Mac and Windows packaging and launch results. A source build, a local Mac smoke, or an uploaded artifact alone does not prove a Windows installer works. See [the distribution plan](DISTRIBUTION_PLAN.md) for targets and the packaged smoke contract. Codex is disabled on Windows because this implementation has no equivalent verified kernel sandbox. API providers remain the cross-platform alternative.

For trusted jobs authorized to sign, no credentials produces unsigned Windows builds and Mac builds without Developer ID or notarization. Complete credentials enable signing automatically. Partial or invalid credentials fail. Use [SIGNING.md](SIGNING.md) for setup and verification. Branch-only CI always stays unsigned. Test the exact downloaded files, not a different build. Keep checksums synchronized with the final signed and stapled bytes.

Only an owner-approved `v*.*.*` version tag may publish a non-draft release with `docs/releases/<version>.md` as its body. Stable aliases support one-click downloads on the website. Keep their names unchanged when signing is enabled. Record signing status, architecture tests, workflow URLs, and unresolved limits in the release review. Automatic updates remain disabled until a separate signed-update rollout is reviewed.

For website changes, run the checks below. The download inventory and architecture recommendation live in `apps/website/src/data/downloads.ts`. Installer version and size stay hidden unless verified against published assets. Shared site redesigns can move `Download.astro` without copying detection rules.

```sh
pnpm --filter @vstudy/website typecheck
pnpm --filter @vstudy/website build
pnpm --filter @vstudy/website verify:static
node apps/website/scripts/verify-downloads.mjs
node scripts/check-readme-links.mjs
```

See [cleanup verification](ENGINEERING_CLEANUP.md) for command results and explicit Knip exceptions. [The stream H report](REPO_HYGIENE.md) is historical.

## Test Node and locale changes

Vitest runs with `pool: forks`, `maxWorkers: 2`, and `execArgv: ["--no-experimental-webstorage"]`. Node's process-wide storage must not shadow jsdom's per-window storage. Plain `pnpm test` applies this configuration without caller environment flags. For a comparison run, use `NODE_OPTIONS=--no-experimental-webstorage pnpm test --pool=forks --maxWorkers=2`.

Direct `pnpm exec vitest` also reads this configuration. After adding a namespace, run `pnpm --filter @vstudy/desktop locales:generate` before invoking Vitest directly. Normal install and package scripts already generate the registry. Locale contract tests check translated keys and interpolation names. `en-XA` derives from English at runtime.

Knip does not follow the CSS imports in the current project configuration. Its CSS-only dependency exceptions are enumerated in `knip.json`. `openssl` is a required host binary for local TLS fixtures, not an npm dependency. Never add a blanket source-directory exclusion to silence vendor or dead-code checks.
