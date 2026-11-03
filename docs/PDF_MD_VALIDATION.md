# PDF Markdown validation

Validated on macOS, 2026-11-03. Implementation commits: `6718a50`, `b78896f`,
plus the final regression/documentation commit following this report.

## Requirement results

| Requirement | Result | Evidence |
| --- | --- | --- |
| PDF-first pdfplumber pipeline, MIT, pinned, no shipped AGPL dependency | PASS | `requirements.txt` pins pdfplumber 0.11.9; runtime imports only pdfplumber. PyMuPDF appears only in the dev comparison script. |
| Pure character → line → block → classification → Markdown stages | PASS | `pdf_md/__init__.py`; direct pure-stage assertions and literal golden comparisons in `test_pdf_md.py`. |
| CJK and mixed English spacing | PASS with limits | `cjk.pdf/.md` golden; CH2 pages 3/5 manually read. Spacing around hyphenated/wrapped Latin terms can remain imperfect. |
| Reading order, including two-column-ish layout | PASS for tested layout | `columns.pdf/.md` reads down the left column then down the right. Interleaved columns with full-width headings remain unverified. |
| Font size/weight headings, distinct ranks, cap 4; short bold highlight stays inline | PASS | `heading-list` golden and heading-rank pure test; sizes ranked across the entire document. Same-size bold text is deliberately conservative. |
| Lists require consecutive aligned markers; separate questions do not chain | PASS with limits | `heading-list` golden, isolated-marker pure test, page-3 golden and assertions for separate R12/R13 and no `5.` chaining. Wrapped list items and intervening notes may render as separate numbered paragraphs. |
| Tables require actual 2×2 or larger ruled grid, header, escaped pipes | PASS | `ruled-table` golden; CH2 has zero table rows. Alignment-only `columns` fixture stays paragraphs. |
| Annotation isolation and nearest paragraph placement | PASS for tested inputs | All 46 CH2 FreeText contents become 46 notes. Page-3 labels occur exactly once, only after `> note:`. Synthetic overlap test; math-overlap regression. Truly handwritten raster/vector text has no OCR. |
| Repeated headers/footers and bare page numbers removed | PASS | Three-page `margins` golden and pure margin test. |
| Join paragraph over page break and preserve hidden page markers | PASS | `page-split` literal golden; renderer test proves one rendered paragraph and hidden comments. |
| Page metadata on selections | PASS | Optional `Selection.page`; renderer regression selects continuation text on page 2 and checks exact stored-source offsets. |
| Raster images | PASS via allowed placeholder option | `[Embedded images omitted: N]`; image extraction deferred. CH2 page 8 includes the placeholder. Existing Office image export still passes conversion E2E. |
| Existing 8 MiB Markdown cap | PASS | Python output check and main-process size checks retained; existing large Office-image integration cases exercise cap-related behavior. |
| No text layer and structured fallback errors | PASS | Actual no-text PDF falls through both parsers and emits `NO_TEXT_LAYER` with the requested message; no OCR warning on a successful fallback. |
| Exception/corrupt PDF fallback | PASS | Actual malformed PDF is accepted as plain text by MarkItDown; test checks literal output and sidecar `converter: markitdown`. |
| Parser record, additive migration/default, reader label | PASS | Version-2 SQLite migration and old-row migration test; built-app import asserts `pdf_md`, screenshots show label. Existing hash-deduplicated imports retain their previous parser. |
| Small committed page-3 fixture, no full source committed | PASS | 212,656-byte page-3 fixture (about 208 KiB), with FreeText contents preserved. `scripts/pdf-fixture.py` documents regeneration. Full source remains outside the repo. |
| Synthetic PDF fixtures and literal goldens | PASS | Heading/list, ruled table, columns, repeated margins, page continuation, CJK, and no-text PDF under `test-fixtures/pdf_md`. |
| Idempotence | PASS | Every golden extracted twice; independently converted full source in built app matches benchmark byte-for-byte. |
| Comparison script | PASS | `scripts/pdf-compare.py`, actual three-parser run below; dev-only PyMuPDF never installed by shipped bootstrap. |
| Real built-app import and screenshots | PASS | `e2e/pdf-reader.mjs` PASS; `/tmp/vstudy-pdf-evidence/page-3.png` and `page-5.png`, both visually inspected. |

## Full CH2 comparison

Source: the supplied 18-page Traditional Chinese/English CH2 PDF, outside the repo.
The same pinned pdfplumber and MarkItDown requirements were used. Comparison-only
pymupdf4llm was version 2.1. Counts are raw emitted Markdown, not a completeness
score. Table rows include separator rows; list counts count marker lines, not lists.

| Parser | Characters | Headings | Table rows | List lines | Note lines | Seconds |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pdf_md | 33,756 | 0 | 0 | 24 | 46 | 2.23 |
| MarkItDown 0.1.9 | 48,888 | 0 | 223 | 20 | 0 | 1.23 |
| pymupdf4llm 2.1 (dev only) | 34,508 | 3 | 0 | 73 | 0 | 1.63 |

The intended quality improvement is eliminating alignment-inferred tables and
cross-question list chaining while preserving annotation contents separately.
This run does not establish superior extraction completeness or speed. CH2 uses
nearly uniform body sizes, so conservative font-based classification emits no headings.

Benchmark outputs: `/tmp/pdf-comparison/{pdf_md,markitdown,pymupdf4llm}.md`.
The built app's saved `/tmp/vstudy-pdf-evidence/content.md` and benchmark `pdf_md.md`
share SHA-256 `956890ff43fb8e76b042408775dfe48b6871ca5171bc8afc45f6e0d6a50facae`.
The temporary app profile was removed after capture; evidence artifacts remain.

## Manual output inspection: pages 3, 5, 8

- Page 3: R12/R13 and their answers stay separate; there is no table or answer
  renumbering across questions. The eight FreeText labels are isolated notes.
  `If- modified-since`, `7 -bit`, and `7-bitASCII` retain imperfect source/line spacing.
  Notes interrupt some numbered answers, so Markdown may show those as separate
  paragraphs instead of one continuous list. Source Chinese typos and stray full-width
  parentheses are preserved rather than guessed away.
- Page 5: R23–R27 remain ordered paragraphs, and the five R25 answers preserve their
  numbers. FreeText labels including the single character `建` stay notes. Source
  text typos remain. Uniform font size does not create fabricated headings.
- Page 8: P5/P6 and lettered subquestions stay separate after a regression fix. The
  HTTP/HTML sample remains escaped literal text with awkward paragraph wrapping;
  code-block reconstruction is not implemented. One raster image is omitted with an
  explicit placeholder. No fake table is introduced.

Complex equation layout remains flattened text. The annotation classifier now
excludes math fragments; fractions/subscripts are not reconstructed into LaTeX.
Flattened annotation text inside a ruled table, rotated pages, and interleaved
full-width/column layouts were not covered by this fixture set.

## Checks

- Python: 10 tests pass, including all literal goldens and idempotence.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm build`: PASS, normal production build without renderer mocks.
- `VSTUDY_FAKE_PROVIDER=1 node e2e/selection-chat.mjs`: PASS, real app; no console errors.
- `VSTUDY_FAKE_PROVIDER=1 node e2e/conversion.mjs`: PASS, real converter; DOCX/XLSX/PDF,
  embedded and library images, file drop; no console errors.
- Full-source `e2e/pdf-reader.mjs`: PASS, real bootstrap/import, stored parser,
  no rendered table or page comments, pages 3/5 screenshots.
- `pnpm test`: PASS, 19 files, 87 tests passed, 2 existing provider-detection tests
  skipped. Real converter integration passed all six formats, image limits, failure
  recovery, and bootstrap reuse. The first run exposed an integration harness that
  copied only `convert.py`; the harness now also copies `pdf_md/` and asserts the
  actual parser per format.
