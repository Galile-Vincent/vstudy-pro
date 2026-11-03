# PDF Markdown defect revalidation

Superseded by [the final fix-round report](PDF_MD_FINAL_ROUND.md).

2026-11-03. This report supersedes the completeness claims in PDF_MD_VALIDATION.md.
The supplied full CH2 PDF remains outside the repository. New committed PDFs are
synthetic and individually below 300 KB (the 600-page fixture is 285 KB).

## Results by requested item

| Item | Status | Evidence and limits |
| --- | --- | --- |
| 0a preservation | Fixed | Independent pdfplumber text extraction is tokenized as CJK characters and Latin/digit words; NFKC handles ligatures. Source/output multisets, explicit intended removals, missing count and loss ratio are recorded in the sidecar. More than 3% loss or empty output raises CONTENT_LOSS and invokes MarkItDown. Literal preservation test and forced numbers/rotation-loss fallback tests pass; actual dense-label conversion attempts fallback, then safely fails at the process RSS cap. This detects deletion, not reading-order errors. |
| 0b resources | Fixed for tested attacks | 16 MiB Flate output cap, 1,500 MiB process RSS watchdog, 1,000-page limit, 72-second pdf_md alarm against the existing 120-second app timeout, per-page cache flush, bucketed dedupe and annotation scans. Wrapped pdfplumber resource errors are unwrapped and cannot fall through to another parser. Bomb, 600-page, dense-page, page-limit and deadline tests pass. The actual dense-label MarkItDown fallback hit the RSS watchdog and returned PDF_RESOURCE_LIMIT, exercising the kill path. Windows resource/signal portability is unverified. |
| 1 / D2 numbers | Fixed | Numeric removal requires margin position and repetition or consecutive numbering across pages. Body values 42, 7, 2024 survive the numbers golden. CH2 page 10 retains 200, 300 and 100000 formula fragments. |
| 2 / D1 rotation | Fixed for page rotation; remaining limitation | Upright boxes and matrices are restored for /Rotate 90/180/270; four-page rotation golden passes with zero token loss. Significant remaining extraction loss invokes fallback. Central rotated text on an otherwise unrotated page has no general orientation reconstruction; small residual errors below the 3% gate can remain. |
| 3 / notes/headings | Fixed for corpus defects; limited inference | Outdenting and font names no longer imply notes. Explicit Text/FreeText notes remain; overlap inference excludes same-baseline scripts, bold/larger text, math and figure regions. CH2 retains 46 notes; Attention and ResNet have zero inferred notes. Slide titles stay in place as headings. Permission-banner continuation is plain text instead of a heading fragment. Script and figure-label literal tests pass. Ink-specific annotation recognition was not added; vector-region detection is conservative and can leave genuine notes as paragraphs. |
| 4 / D6 order | Fixed for tested bands | Column ordering is applied within full-width separators, and the final vertical re-sort is removed. Literal band-order test and full-width two-column corpus pass. ResNet was rerun; exhaustive visual reading-order validation of its page 3 was not performed. |
| 5 / D9 stamps | Fixed for tested stamps | Non-upright chars in side margins are explicitly excluded and recorded. Attention/ResNet rerun. Oblique stamps that pdfplumber reports as upright are unverified. |
| 6 / D11 lists | Fixed for tested markers | Expanded glyphs, line-start cid normalization, aligned neighboring numbered items and nested indentation have literal tests. Singleton uncertain markers remain paragraphs. Arbitrary font-specific missing glyphs remain a source limitation. |
| 7 / D12 paragraphs/code | Fixed for tested constructs | Page-relative median gaps, first-line indentation, numbered/same-size bold headings with numbering-depth cap, conservative joins and monospaced fenced runs. Literal code/newline and heading tests pass. Equation reconstruction and code perfection remain out of scope. |
| 8 / reviews 5–6 | Fixed | SUBQUESTION prevents page-break joining; literal two-page regression passes. Selection pageAt traverses parsed HTML nodes, so fenced/indented/inline code and escaped comments cannot become page markers. Converter emits &lt;!-- for literal comment starts. Renderer and Python literal regressions pass. |
| 9 / D13 scans | Fixed | A >80%-area image plus fewer than 40 text chars does not count as a text layer. Fallback text shorter than 40 chars cannot rescue NO_TEXT_LAYER. Small generated scan/stamp fixture and corpus scan fixtures pass. OCR is intentionally absent. |
| 10 / D14 selected | Fixed for tested cases | None cells render empty; matching column positions permit page-continuing GFM tables and remove repeated headers, with the page marker inside the next data cell. Link annotation text retains URI targets. Repeated heading removal is margin-only. Fullwidth punctuation spacing and internal U+3000 preservation have literal tests. PasswordProtected / PASSWORD_PROTECTED bypasses fallback and carries “Password-protected PDF” through the existing UI error path. Merged/continuing-table goldens and link/password tests pass. Password failure was not manually inspected in the UI. Rotated table/link annotation geometry and tables with images at their page break are not stitched. |

## Verification

- `pytest apps/desktop/resources/converter/test_pdf_md.py -q`: **30 passed**, 15 subtests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: **PASS**.
- `pnpm test`: **19 files passed; 88 tests passed, 2 skipped**. Fresh converter bootstrap made this run take 363 seconds.
- `VSTUDY_FAKE_PROVIDER=1 node e2e/selection-chat.mjs`: **PASS**, no console errors.
- `VSTUDY_FAKE_PROVIDER=1 node e2e/conversion.mjs`: **PASS**, real converter, DOCX/XLSX/PDF, images and file drop, no console errors.
- `e2e/pdf-reader.mjs supplied.pdf /tmp/pdf-fixes-app`: **PASS**, stored parser pdf_md, no tables or visible page comments. Extended the script to capture page 10 too.
- Visually inspected `/tmp/pdf-fixes-app/page-3.png`, `page-5.png`, `page-10.png`. Pages 3/5 retain separate notes and questions. Page 10 contains formula text and P10's 300/100000 statement; equation fragments remain visibly flattened.

Only one existing golden changed: `ch2-page3.md` removes three artificial spaces
following fullwidth punctuation. No body text or note was removed from that golden.
The old synthetic overlap test now uses a genuinely displaced box instead of
geometry that also describes a same-baseline superscript. The corrupt-PDF sidecar
expectation now includes the explicit fallback reason.

## Corpus and completeness

Reran the tester's PDF corpus without modifying its original output directory.
Current text/diagnostics are under `/tmp/pdf-fixes`, including `corpus.log`,
`large-corpus.log`, and `word-diff.jsonl`. Small synthetic corpus fixtures were
reused as committed goldens. Tests generate no expected output at runtime.

All ordinary synthetic fixtures extract; pure scans and scan-with-page-number
raise NO_TEXT_LAYER; user-password encryption raises PASSWORD_PROTECTED; empty
user password extracts normally. Truncated/garbage/non-PDF fixtures raise parser
errors in pdf_md and retain the existing fallback policy. The 108-page CH2 repeat
retains 276 notes. The 450-page fixture extracts with zero missing source tokens.
Dense label fixtures request fallback instead of silently accepting text loss.
The exploratory dense_250/500/1000/2000 variants were not individually rerun;
the generated 6,000-label fixture and original 09d dense corpus were rerun.

Independent, case-sensitive word-multiset comparison against PyMuPDF, using the
tester's `lost.py` token convention (not the runtime gate's normalization):

| Document | Source tokens | Missing before | Missing after |
| --- | ---: | ---: | ---: |
| CH2 | 7,992 | 109 | 79 |
| Attention | 6,461 | 380 | 350 |
| ResNet | 10,712 | 125 | 106 |

These are missing-token counts, not assertions that every token was deleted:
math subscripts, joined/split words, case and intentional stamps also contribute.
For example, CH2's residuals include `RTT0`, `RTT1`, `dmin` and `us`.
Runtime normalized missing ratios are about 0.30%, 2.10% and 1.93% respectively.
No claim of perfect completeness or reading order is made.

## Resource measurements

Fresh Python processes, macOS `ru_maxrss` in bytes converted to MiB. Before values
come from the tester's saved `/usr/bin/time -l` outputs, after values from current
standalone conversion. Parser startup is included.

| Fixture | Before | After |
| --- | --- | --- |
| Original 150-page 09_large | 27.95 s, 946.5 MiB | 4.68 s, 61.4 MiB; successful, zero loss |
| Original 09d dense labels | killed at 300.02 s, 481.3 MiB | 2.54 s, 550.2 MiB; CONTENT_LOSS requests fallback |
| Generated 6,000 labels | not measured separately | 1.13 s, 143.8 MiB; CONTENT_LOSS requests fallback |
| Generated 600 small pages | not measured | 0.38 s, 41.4 MiB; successful, all 600 sentences retained |
| 64 MiB comment/Flate bomb | tester reported ~1.4 GB RSS | 0.034 s, 68.6 MiB; PDF_RESOURCE_LIMIT, no fallback |

The dense corpus speed improvement does not imply a memory improvement: its
measured peak is higher. The preservation gate deliberately refuses its merged
labels. Its attempted MarkItDown fallback subsequently exceeded the RSS cap and was terminated with a structured error; this is a safe conversion failure, not a successful dense-page import. Deadline handling is tested with a short alarm, rather than spending
72 seconds in each regression run. Resource measurements and the full corpus
are local validation artifacts, not shipped dependencies. PyMuPDF is dev-only.
