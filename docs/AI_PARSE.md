# AI document improvement

The main-process implementation and headless renderer components are available. A reader host must mount `src/renderer/ai-parse/AiParsePanel` and supply model selection, estimate confirmation, job cap and budget-override controls. Existing reader UI was deliberately not modified during its concurrent replacement. This is not yet an end-to-end shipped reader feature.

## Flow and storage

`aiParse:estimate` validates document, provider, model, page scope and options without sending document data to a model. `aiParse:start` reserves a single job per document before asynchronous discovery, validates model options and budgets, then runs up to two pages concurrently (configurable 1–4). `preview` sends only page 1; `range` and `currentPage` use one-based page numbers. Non-PDF documents use text only. AGY is unavailable for this feature until its image/system-instruction contract is verified.

PDF rendering uses a separate Python process with pypdfium2 and pdfplumber. It renders at up to 120 dpi, 2,400 px on either side, four million pixels and eight MiB per PNG. Each page has a 20-second Python alarm and 25-second parent deadline. The process uses ProcessScope, scrubbed environment and the converter's macOS network-deny profile. Dependency setup reuses the existing converter consent and locked environment. Cache names include source SHA-256, page number and rendering version; they invalidate when any immutable source byte changes. Cached PNGs and text-layer metadata live under the contained hash directory's `ai-pages/`.

Migration 11 adds `documents.activeVersion`, `aiSizeBytes`, `ai_parse_jobs` and `ai_parse_pages`, with cascading ownership. The page cache hashes image bytes, parser Markdown, prompt version, provider, model and model options. Successful pages can be reused without provider calls or usage rows. Estimates omit already successful pages for the same document/configuration; cross-document cache hits are discovered during processing. Failed/flagged pages retry on another start. Restart converts running jobs to cancelled and running pages to pending. Resume requires explicit start, preserving per-document opt-in rather than automatically creating new provider charges.

`content.md` remains the original. Jobs atomically publish `content.ai.md` with exact application-generated `<!-- page N -->` markers. Pages without accepted results use their original parser Markdown. `content.ai.md.json` records model/provider/prompt/date and per-page provenance/status. Publication occurs after the job settles; per-page status events stream while it runs. Interrupted jobs retain their accepted pages. Cancelling aborts adapter streams and page-render process groups. IPC shutdown awaits AI jobs before disposing converter/store. Library and document deletion cancel jobs first.

`documents:read` accepts an optional `version`; omission reads the active version. Switching updates activeVersion and FTS in a savepoint. Chat reads that version; citations carry it. Selection offsets are UTF-16 offsets in that version, with an optional `version` field; legacy selections mean original and are rejected when AI is active. Reader hosts must clear old selections on switch, reload Markdown and check citation version before navigation. Restore/search rebuilding use the active file. Re-conversion resets activeVersion to original.

## Provider transport

Anthropic uses a system message and base64 image blocks; OpenAI uses a system message and image_url data URLs. Known OpenAI vision families and Anthropic models advertise supportsImages. Unknown compatible models fail closed: set the compatible provider's additive `imageModelIds` allowlist to opt in a verified model. Model discovery is not an independent proof of its vision capability.

Claude uses stream-json user input, base64 content blocks, system-prompt, safe-mode, empty tools and empty MCP configuration. Codex attaches private temporary images with `exec -i`, injects instructions using developer_instructions, and retains its audited model catalog, empty tool surfaces, process-fork denial and event allowlist. Its proof fingerprint includes image transport version; the runtime canary now always attaches a tiny image. Auth copies and images are removed with the private context. The live regression also tests a readable generated image and a canary with that image. No CLI login or user configuration is changed.

## Cost and limits

The estimate sums per-page ceil((system + delimited Markdown characters)/4), plus a conservative 4,096 image-token allowance for PDFs. Expected output is max(256, ceil(Markdown characters/3)). Costs use the existing main-process price table and overrides. This heuristic is approximate: image tokenization differs by provider; output can be longer than expected. CLI subscription figures are API-equivalent, not a promise of a subscription charge. Provider-reported usage is recorded per page, including rejected/aborted pages. The usage dashboard contract exposes separate parseTotals; existing totals also include parse rows.

Unknown prices refuse start rather than silently disabling the cap. The default job admission cap is USD 1. The monthly USD/token guards refuse estimates over remaining budget unless confirmBudgetOverride is explicitly supplied. Reservation checks run before each uncached page; observed spending over cap aborts the job. **This is an admission/abort cap, not an enforceable provider-side billing hard cap. In-flight calls, underestimated image/output tokens and simultaneous document jobs can overshoot.** A strict financial hard cap remains unfinished; do not label this a guaranteed maximum in mounted UI. Global budget reservation across independent chat/parse requests is also unfinished.

The host must present an estimate before start and collect the cap/override decision. Main recomputes the estimate on start, but there is no signed estimate-confirmation token: a trusted renderer can invoke start directly. The presentational component disables start until it has an estimate; the host must reset it after model/scope changes.

## Safety gate

The version-1 system prompt treats image and JSON-delimited parser Markdown as untrusted data and forbids tools, instructions from the page, invented content and active output. Main parses Markdown and rejects raw HTML (including forged page comments), all image nodes/references, unsafe link schemes, empty output and output over 256 KiB. Rejection keeps the original page. Safe http/https/mailto links still rely on the reader's existing external-confirmation flow.

Faithfulness compares normalized token multisets: CJK/Kana/Hangul per character, other letters/numbers per word. Missing source text-layer tokens must be <=8%; output tokens absent from the text layer must be <=25%. LaTeX command names are excluded from tokenization; numbers and variables remain. Tables receive no wider exception; Markdown separators do not tokenize. This documented tolerance avoids an unlimited “equations” bypass. The gate verifies page markers by rejecting model-generated HTML and supplying markers itself.

No independent OCR is implemented. Image-only text and FreeText annotations absent from the PDF text layer cannot be independently validated. Mathematical operators, inequality direction, ordering and meaning are not covered by token counts. Accepted pages require human comparison for equations and annotations. The real evaluation demonstrates these limits. Scanned PDFs that never reach ready status remain unsupported.

App-initiated provider requests use existing egress logging; no document or image bytes are added to logs. CLI traffic may include provider-managed telemetry/endpoints, as documented by the existing transport model. The renderer components use localization keys and do not expose paths, credentials or process controls.

## Validation

See `ai-parse-evaluation.md` and its final verification table. Unit/integration coverage includes pricing, budget refusal, cache hits, cancellation/restart state, version switch/revert, safe Markdown, CJK, injection strings and seeded migration. Tests do not prove arbitrary model obedience. Live CLI tests opt in with VSTUDY_AI_PARSE_LIVE=1; CH2 evaluation additionally needs local private inputs and VSTUDY_AI_EVALUATION=1. Neither sends data during normal tests. API image serialization has local test coverage; authenticated API and AGY image runs are not claimed.

## Requested-item disposition

| Item | Result and evidence | Remaining limit |
|---|---|---|
| 1. Page rendering | Implemented in converter/ai-pages.ts and render_page.py; generated oversized-page regression verifies PNG bounds and text extraction | Source-hash/page cache rather than deduplicating identical pages across different PDFs; existing converter filesystem threat boundary applies |
| 2. Image providers | API serializers tested locally; live Claude and Codex image smokes passed; Codex adversarial image canary passed; trimmed generated-page fixtures retained | Authenticated API smoke unverified; compatible models require an explicit allowlist; AGY image/system transport is deliberately unsupported |
| 3. Orchestrator | Persistent page/job tables, bounded workers, cancellation, retry/resume, per-page status, cache reuse and original fallback; fake-provider tests | Explicit resume after restart; output is published at job settlement; no auto-charging restart |
| 4. Cost control | Literal estimate regression (4,268 input / 256 output tokens, USD .011096 at 2/10 per million), USD/token monthly guards, explicit override/cap props, parse usage rollups, first-page scope | Admission/abort cap can overshoot in-flight external billing; no global budget escrow; strict financial hard cap remains incomplete |
| 5. Prompt/safety | Versioned system prompt, AST rejection of active content, size cap, multilingual multiset gate, deterministic injection corpus | No independent OCR; annotation/operator/semantic correctness is not established; no claim of guaranteed model obedience |
| 6. Reader contract | Optional documents:read version, persisted activeVersion, version-scoped selection/citation fields, chat active-file reads, FTS switch and restore | Host must reload/clear offsets after switching or regeneration; version identifies the original/AI slot rather than an immutable historical AI revision |
| 7. UI pieces | New headless hook/panel only under renderer/ai-parse; model slot, scopes, cost/cap/override, statuses, compare/use/revert/discard; all three catalogs extended | Mounting and reader selection/citation navigation intentionally left to UI worker/later integration, as requested; hook polls validated status because existing preload was outside ownership |
| 8. Tests/evaluation | Main/shared suite, migration seed, fake image provider, budget/cache/cancel/fallback tests; two live CLI smokes; CH2 pages 3/5/10/16 evaluated | Full E2E has concurrent renderer failures; no live API or AGY vision result; no model injection-obedience proof |
| 9. Documentation | This document, README, SECURITY and full side-by-side CH2 evaluation | Welcome/onboarding copy untouched by this implementation |
