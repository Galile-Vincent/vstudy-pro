# Reader redesign verification

The goal is a simple, modern Reader and assistant workspace, with a coherent Home, Library, and navigation frame. The selected Quiet folio direction separates the document page from a structured assistant column. Home and document cards carry the richer artwork. [The decision record](reader-decision.md) compares the prototypes and records both critique rounds.

## Implementation

The assistant remains the installed assistant-ui Thread and Composer. Its viewport scrolls independently from its docked ViewportFooter. A ThreadNotice slot places unavailable-provider guidance inside the thread. Messages, reasoning, tools, citations, attachments, and model controls retain their existing runtime and security contracts.

The data shape remains Document, Conversation, Message[], and Selection or null. ReaderWelcome adds a title and selection-aware prompt callback. DocumentArt derives decorative geometry from a document ID and uses theme colors. No storage, IPC, provider protocol, or Courses implementation changed.

The workspace coach is a dismissible popover anchored to the document toolbar. Its walkthrough action is a quiet link. The assistant header owns Conversations. The top bar owns the breadcrumb and quiet actions. The sidebar has navigation groups, an active pill, a profile and settings footer, and a working collapse toggle. At narrow reading widths the sidebar becomes an overlay.

Home puts Continue reading before setup and import. The setup checklist has real progress. Library grid cards have deterministic covers and recalculate their column count on resize. List mode and the virtualized row model remain available.

## Evidence inventory

All images are in `docs/evidence/art/reader/`.

- `before/` contains 40 baseline images. VStudy and Ocean, both schemes, at 1200×768 and 1440×900. Home, Library, and Reader with empty, conversation, and unavailable-provider states.
- `prototype-01.png`, `prototype-02.png`, and `prototype-03.png` show the competing directions. `prototypes-comparison.png` puts them side by side. The static HTML sketches were generated outside the repository.
- `round-1/` and `round-2/` contain 10 images each. The decision record records the critique and fixes for each round.
- `final/` contains 117 images. All nine theme packs in both schemes cover Home, Library, and all three Reader states at 1440×900. The additional 27 images cover English, Traditional Chinese, and Japanese at 1000×720 with 125% scale, 1200×768, and 1600×1000.
- `pseudo/` contains nine en-XA images at the same three sizes. These use Electron with a Vite renderer and a test-only reference to its actual i18n instance. The production settings schema deliberately excludes the pseudo-locale.
- `interaction/` contains three images of the keyboard-opened coach, reading without AI, and the compact-pane focus return.

Every accepted run writes `verification.json`. The production runs use the built Electron application, a temporary local database, real imported Markdown, and the opt-in fake provider. Enriched conversation evidence exercises reasoning, a tool, and a citation. No paid or authenticated AI service is called. Electron runs are sequential.

## Commands and results

Run from the repository root unless a working directory is shown.

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed. |
| `pnpm --filter @vstudy/desktop build` | Passed. |
| `pnpm typecheck` | Passed for desktop and website. |
| `pnpm lint` | Passed for desktop and website. |
| `pnpm knip` | Passed. Only the existing CSS configuration hint remains. |
| `pnpm security:check` | Passed the existing advisory policy, static security checks, lint, contrast checks, and full tests. Dependency audit has reviewed advisories and zero unreviewed entries. |
| Full Vitest run through `security:check` | 131 files passed, five skipped. 994 tests passed, 14 skipped. Fork pool, two workers. |
| Focused Vitest after final fixes | 27 tests passed across welcome, composer, Home, and Library. |
| `pnpm --filter @vstudy/desktop contrast:check` | All nine packs, both schemes, every contrast setting. Includes the opaque cover-label surface above artwork. |
| `pnpm vendor:check` | 55 vendor sources and one application test match reviewed hashes. |
| `ART_PHASE=final pnpm --filter @vstudy/desktop exec node e2e/art-reader.mjs` | 117 captures, 18 no-overlap geometry checks, and a zero-violation WCAG A/AA scan. No renderer errors. |
| `ART_PHASE=pseudo pnpm --filter @vstudy/desktop exec node e2e/art-reader.mjs` | Nine expanded-string captures. No renderer errors. |
| `ART_PHASE=interaction pnpm --filter @vstudy/desktop exec node e2e/art-reader.mjs` | Keyboard collapse, coach dismissal persistence, setup dialog, no-AI focus return, list toggle, and opening a document. |
| `pnpm --filter @vstudy/desktop exec node e2e/chat-composer-position.mjs` | Eight composer position checks and eight axe scans passed, including narrow windows and 200% zoom. |
| `git diff --check` | Passed. |

## Boundaries and remaining work

Live-provider behavior, converter integrations, and the whole optional E2E inventory were not rerun. The unit run retains the repository's existing skips. The 18-theme-state matrix is English; language and scale coverage is a separate Ocean-dark matrix rather than a full Cartesian product of every setting.

The supplied T3 branch was renamed to the requested `t3/art-reader`. No push or PR is created by this implementation sub-agent. Independent review belongs to the parent coordinator.

Shared files touched are `onboarding/help.tsx`, the three new `art-reader.json` locale catalogs, `scripts/check-contrast.mjs`, and the Thread vendor manifest and exact patch documentation. All new visual tokens are prefixed `--art-reader-` in `shell/art-reader.css`. Courses files and shared IPC contracts are untouched.

Model the Domain kept the existing document and conversation ownership and represented prompts as a fixed set scoped to a title and selection. Prove It Works led to the repeatable Electron capture script, geometry checks, real keyboard paths, and screenshot critique before handoff.

Implementation, architecture exploration, and self-critique ran in-thread because this task is the implementation sub-agent. No nested agents ran.
