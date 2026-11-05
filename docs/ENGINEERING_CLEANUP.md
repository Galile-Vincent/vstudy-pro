# Engineering cleanup verification

Stream J prepares documented main and shared code with green root checks. It preserves application behavior and leaves the parallel renderer stream untouched. Work is on `t3/cleanup`, based on `726b8be`.

## Changes and data shapes

- `scripts/generate-locales.mjs` discovers flat JSON namespaces in all three language directories. It produces an ignored typed `catalogs` object. `shared/i18n.ts` keeps `Language`, inferred catalog types, synchronous initialization, and the derived `en-XA` pseudo-locale. No contributor-maintained registration list remains.
- `main/db/migrations.ts` owns the ordered `{version, sql}` registry through version 21. Migration entries are byte-identical to the baseline. Store and registry callers import their actual owner directly.
- `main/services/chat-turn-context.ts` owns replay and edit history selection. Its `ChatTurnContext` contains regeneration state, message IDs, replaced message IDs, and active prompt history. ChatService retains all transactions and stream ownership. The extracted algorithm is unchanged.
- Every main and shared TypeScript module has a TSDoc module contract with purpose, owner, and invariants. Non-obvious exported operations and boundary schemas have TSDoc. Subsystem READMEs include Mermaid flows. Architecture, data model, contributor commands, feature overview, and the documentation index reflect the merged features.
- The minimatch override resolves affected 9.x and 10.x transitive copies to 11.0.1. These consumers use the retained named API. Build and unsigned macOS directory packaging pass. Advisory 1244623 is removed from the acceptance baseline so reintroduction fails the gate.
- Vendor reconciliation retains the recorded pristine hashes. Previously recorded sources were recovered from Git, old patches reversed, and pristine hashes verified before generating new patches. Fourteen drifted sources have current exact patches. One application-authored test is recorded separately without an invented upstream hash. No renderer source was edited.

## Commands and results

Commands run from the repository root unless a different directory is stated. Text evidence lives in [evidence/cleanup](evidence/cleanup/).

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass. |
| `pnpm typecheck` | Pass. |
| `pnpm typecheck-fast` | Pass. |
| `pnpm lint` | Pass. |
| `pnpm test` | Pass. 933 passed, 14 optional tests skipped. |
| `NODE_OPTIONS=--no-experimental-webstorage pnpm test --pool=forks --maxWorkers=2` | Pass. 933 passed, 14 skipped. |
| `pnpm security:check` | Pass. Dependency baseline, full lint, security lint, contrast checks, and tests. 933 passed, 14 skipped. |
| `pnpm vendor:check` | Pass. 60 vendor sources and one application file. |
| `pnpm knip` | Pass with the explicit scope waivers below. |
| `pnpm build` | Pass. Main, preload, and renderer production bundles. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @vstudy/desktop exec electron-builder --mac dir --publish never` | Pass. Unsigned arm64 directory artifact; no publish. |
| `pnpm smoke` | Pass. One real Electron instance closed after window, security, bridge, and persistence assertions. |
| `pnpm release` | Pass. Regenerated CHANGELOG.md with git-cliff; no tag. |

From `apps/desktop`, `pnpm dlx node@24.11.1 node_modules/vitest/vitest.mjs run --pool=forks --maxWorkers=2` and `pnpm dlx node@26 node_modules/vitest/vitest.mjs run --pool=forks --maxWorkers=2` each pass the original 930-test suite with 14 skipped. The latter resolved Node 26.13.0. The three subsequently added generator tests also pass separately under both versions with `src/shared/locale-generation.test.ts` added after `run`. On Node 24.19.0, all 933 tests pass together. No caller `NODE_OPTIONS` is needed. The existing Vitest fork configuration already disabled process-wide Web Storage before this stream; it was preserved and verified rather than replaced with a second workaround.

The [semantic check](evidence/cleanup/semantic-check.txt) verifies that documentation-only modules emit identical JavaScript after comments are removed and that every main/shared module has a package documentation header. Targeted database and locale checks pass 99 tests. Targeted chat, course-chat, IPC, and locale checks pass 43 tests after extraction.

## Explicit scope waivers

Five known-unused vendored renderer files remain in `knip.json` because this stream is forbidden to edit renderer code. This is an explicit temporary dead-code waiver, not evidence those components are used. The renderer owner should remove them and their vendor manifest entries together, then delete these exclusions. Review by 2026-11-13.

- `src/renderer/components/assistant-ui/elements/tool-approval-questions.tsx`.
- `src/renderer/components/assistant-ui/elements/tool-fallback-parts.tsx`.
- `src/renderer/components/ui/alert-dialog.tsx`.
- `src/renderer/components/ui/context-menu.tsx`.
- `src/renderer/components/ui/scroll-area.tsx`.

`tw-shimmer` is retained because `src/renderer/style.css` imports it. Removing the package reproduced a production build failure. Knip does not follow these CSS imports in its current configuration, so the package is listed with the existing CSS-only exceptions. `openssl` is listed as a host binary because three local TLS fixture suites execute it. The root benchmark script's Zod use is declared as an exact root development dependency.

There is no new security advisory waiver. `pnpm audit` still reports previously accepted dependency advisories from `docs/security-audit.json`. This cleanup does not claim a vulnerability-free dependency graph or re-review those inherited acceptances.

## Release limits and handoff

[Proposed 0.2.0 notes](releases/0.2.0.md) cover the merged product features. Package versions remain 0.1.0. No tag, publish, deployment, or Developer ID signing operation was performed. The local directory package receives the standard ad-hoc signature.

No screenshot is needed for this stream because no renderer UI was changed. An Electron process from another worktree was initially active, so smoke waited until that process had closed. This stream then launched one instance through `pnpm smoke` and closed it afterward. Full E2E, real university sign-in, live-provider checks, signed packaging, notarization, and manual accessibility acceptance remain release work. Optional test skips do not prove those integrations.

Shared integration points are `shared/i18n.ts`, boundary-schema comments, generated-registry lifecycle scripts, `db/migrations.ts`, package and lock configuration, vendor manifests and patches, and contributor documentation. Renderer changes to vendor files must update the corresponding patch and manifest hash again after merge.

Model the Domain shaped `ChatTurnContext` and retained typed locale catalogs. Build the Lever produced the deterministic locale generator. Fix Root Causes kept Node storage handling in the test runner and repaired the actual transitive dependency. Prove It Works required cross-version tests, production bundles, and packaging evidence. Implementation and review ran in-thread because this task is an implementation sub-agent; the parent owns independent review and further delegation.
