# Library design review

Implementation: persistent shell, folder sidebar, Library and extracted reader/chat workspace. Home and onboarding belong to B2. The shell shipped first in `81767ab`; Library first shipped in `6ca6a75`. The initial SSH push failed (`Permission denied (publickey)`); the complete commit series was subsequently pushed to `main` using existing HTTPS credentials.

## Round 1 — inspect, revise

Reviewed the empty Library, selection, folder drop, document actions, and populated/filter/grid variants in English and Japanese at 720, 900 and 1200 px, light and dark. Images are `/tmp/vstudy-library/round1-*.png` (40 images).

| Principle | Finding and change |
| --- | --- |
| Contrast | Import is the dominant action. Empty-state action was too quiet; use the same ink/surface treatment. Reduce container borders to a separate hairline token while preserving control outlines. |
| Hierarchy | Empty heading inherited small legacy typography. Give it the heading token; preserve strong document titles, small muted metadata and text status badges. |
| Alignment | Title/search/results share their leading edge. Grid actions wrapped into an orphan bottom line; anchor pin/options together in the upper trailing corner. |
| Proximity | Group original/Markdown actions beneath metadata. Keep filter chips outside result surfaces and selection actions together above results. |
| Repetition | Retain Lucide glyphs, shared radius/spacing/type tokens, one material recipe, and one dialog component. Replace unsupported native prompts with accessible modal forms. |
| Balance | At 720 px use the compact sidebar and wrapping toolbar. Japanese controls remain readable without shrinking text. |
| White space | Initial cards touched one another and sat in a large outlined container. Give each card its own raised material and token-sized gutters. |
| Unity | Shell, reader, Library and B2's Home share token surfaces, radius and focus treatment. Remove the duplicate legacy reader sidebar. |

Axe exposed nested interactive buttons inside listbox options. Results now use an ARIA grid with rows and cells, preserving selection and row keyboard actions. The Electron CDP backend cannot create the extra tab used by axe's default isolation; the pinned Playwright axe integration uses its supported legacy mode instead. No rules are disabled.

## Round 2 — inspect, revise, verify

Reviewed `/tmp/vstudy-library/round2-en-1200-light-grid.png`, the Japanese 720 px dark list/grid, 900 px action dialog, selection bar and empty states, then ran the expanded matrix. The final round contains 100 images: 12 genuinely empty-library variants; 84 populated, filters, grid, selection, context actions, drag destination and empty-search variants; four interaction checkpoints. Full paths are in `docs/evidence/library-screenshots.json`.

| Principle | Final assessment |
| --- | --- |
| Contrast | A single dominant import action, neutral selection fill plus leading rule, readable text in both themes. Automated checks report no serious/critical violations. |
| Hierarchy | Title precedes folder/size/converter/status. Search snippets highlight matches as text; untrusted snippets cannot inject HTML. |
| Alignment | Shared toolbar/results edges and consistent card columns; pin and options remain paired. |
| Proximity | Card gutters separate documents; metadata and both document forms remain together. |
| Repetition | Cards, chips, dialogs and folder rows reuse the token scale. |
| Balance | The sidebar narrows at compact width; Japanese chips wrap rather than overflow. |
| White space | Grid cards have gutters and independent elevation. Empty states have a centered icon, heading, sentence and action. |
| Unity | The same shell contains Home, Library and the existing reader/chat; folder breadcrumbs return to the originating view. |

Additional changes after inspection: preserve scroll on metadata refresh, restore enough keyset pages for remembered scroll, avoid a redundant initial debounce refresh, expose keyboard folder/pin alternatives, make tag assignment reversible, localize filter values, and return snippets on every search page rather than only the first 100 matches.

## Verification and limits

- `e2e/library.mjs`: real Electron/main/SQLite imports, folder/subfolder creation through dialogs, multilingual searches (`Science`, `資料`, `通信`), selection, keyboard Move dialog, Cmd+Option reorder, real mouse document-to-folder drag, native context action dialog, pin, soft-delete/undo, export with native save dialog stub, reload, grid toggle, matrix and axe. Zero serious/critical axe findings. The fixture deliberately preserves original and Markdown files.
- `library.test.tsx`: range selection, expanded-tree projection, safe snippet highlighting. Main tests cover keyset page snippets, tags in two queries per metadata page, and re-conversion retaining identity/original.
- `scripts/bench-db.mjs`: 5,000 documents, 400 folders, 100,000 messages and 1,000,000 usage rows. `VSTUDY_BENCH_DIR` optionally retains the seed for renderer measurement; default cleanup remains unchanged.
- `e2e/library-perf.mjs`: 100 pages / 5,000 documents, at most 10 mounted rows; continuous scroll frame p50 16.7 ms, p95 18.0 ms, maximum 18.4 ms in the recorded run. Full-library page traversal plus 180 scrolling frames took 6.33 seconds. These are warm local measurements, not cold-start claims. See `/tmp/vstudy-library/performance.json`.
- Automated coverage does not certify all contrast combinations or 200% scaling. VoiceOver, OS Reduce Transparency, native-speaker review and an independent design reviewer remain unverified.
- The source-specific `pdf-reader.mjs` requires the original PDF containing `R12.`, `R23.` and `Total average delay`; the repository's generated 600-page benchmark PDF does not contain those anchors. The generic real-conversion e2e passes for PDF, DOCX and XLSX.

### Integrated check results at handoff

Typecheck, lint and build passed. The last complete unit/component run passed 42 files, 218 tests, with four existing skips. The focused Library/service checks passed 17 tests; the subsequent locale/component check passed 13 tests after adding English singular/plural forms and localized number formatting.

The final independent Electron regression executions passed selection-chat, real conversion, i18n, chat-controls and Home/onboarding. Three chat regression scripts still failed against concurrent chat work: visual-regressions timed out waiting for a Haiku conversation title; assistant-elements timed out finding its `Chat 1` thread row; composer-visual-qa reported that the model picker escaped its chat-pane boundary. Earlier visual-regressions and assistant-elements runs passed, so their results are revision-sensitive. Logs and per-script exit codes are in `/tmp/vstudy-library/regressions.json`. These are unresolved integration failures; the Library's own e2e and axe matrix pass.

The final seeded benchmark also exercises the actual paginated Library search with snippets: maximum English 28.18 ms, Chinese 8.82 ms, Japanese 8.27 ms (80 ms budget). The folder-page maximum was 3.21 ms (15 ms budget). Its seed now names message columns explicitly so future additive chat migrations do not break it.
