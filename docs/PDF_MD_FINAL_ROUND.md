# PDF Markdown final fix round

2026-11-03. Supersedes the status claims in PDF_MD_REVALIDATION.md. Implementation
and validation were performed in the main checkout. No user PDF, corpus PDF, page
image, or large fixture was committed. New PDF regressions generate their input
with ReportLab in temporary directories and compare against literal Markdown.

## Requested defects

“Fixed” below means the requested supplied cases and stated regressions pass,
not that arbitrary PDF layout can be inferred without ambiguity.

| Item | Status | Evidence and remaining limits |
| --- | --- | --- |
| N1 | Fixed for supplied cases | Character occupied intervals supply a vertical whitespace profile; persistent gaps split baseline runs before constructing lines. Reading order supports up to four columns within bands, with spanning lines acting as separators. Literal tests cover 8.7 pt gutters at 2/3/4 columns. Visually compared ResNet p3: the left-column residual-learning discussion and Eq. 1 precede the right-column ReLU continuation and Eq. 2. The supplied justified paper reads its left column before its right column. Irregular layouts with no persistent whitespace remain uncertain. |
| N2 | Fixed | Tables enter the same positioned line/block flow as text, using their entire bbox, rather than being appended after paragraph construction. Literal before/table/after PDF test passes. 04b places the first table before “Box only table”; invoice p2 places its table before totals/payment terms. 04_table retains rows 86–89 in the table continued from p4, with the p5 marker inside row 86. Existing multi-page table golden passes. |
| N3 | Fixed | Decimal clauses at arbitrary depth, parenthesized alphabetic/Roman markers, and a./A. start separate blocks. Non-GFM clause markers render as separate paragraphs, avoiding invalid Markdown lists and accidental code indentation. Literal mixed-marker test and contract p1 clauses 1.1.1–1.1.3, (a)–(c), 4.1/4.2 pass. Hanging continuation lines can remain separate paragraphs; text is retained. |
| N4(i) | Fixed | Tokenization uses Unicode letter/number/mark categories for words and individual CJK/Kana/Hangul characters. Korean deletion now raises CONTENT_LOSS. Korean, mixed Korean/English, Greek, Cyrillic and Arabic fixtures all use pdf_md with zero normalized loss. Logical bidi presentation of Arabic/Hebrew was not visually audited. |
| N4(ii) | Fixed for supplied cases | Non-upright text is no longer deleted based on individual glyphs touching the side margin. Vertical runs are projected back to horizontal coordinates and emitted as text. rot_inpage uses pdf_md at zero loss, versus the old 11.99% loss/fallback; its formerly removed “Landscape table row 0” is retained. Removal accounting contains actual repeated margin lines/table headers only; empty entries are filtered. Rotated annotations and mixed orientations that overlap physically remain unverified. |
| N4(iii) | Fixed for Attention artifacts | Vertically oriented labels were being sorted on the wrong axis, reversing words such as application/pad/eos. Restored run geometry and stream-order reference extraction correct those words. Attention has no noitacilppa/dap/soe tokens; normalized loss falls from 2.101% to 0.384%. Remaining missing tokens are mainly formula fragments, not a claim of zero loss. |
| N4(iv) | Fixed | A ruled region is accepted only if its extracted cells preserve source tokens and contain sufficient occupied cells. Large edge sets bypass table inference and preserve plain text. grid_150 changes from 100% loss/fallback to pdf_md with zero loss; grid_200 through grid_800 also succeed. Background geometry is not treated as text. |
| N5 | Fixed | Bare margin numbers can be absent on some pages: at least half the pages (minimum two) must support a constant page-number offset or repeated number at that y. Literal missing-page regression passes; slide numbers 1–3 disappear despite page 4 lacking a number. Body 42/7/2024 remain in the existing golden. |
| N6 | Fixed for supplied cases | Monospaced leading spaces contribute their physical advance before text stripping; positioned indentation uses the same offsets. The measured baseline pitch preserves missing code rows as blank lines. code_mono retains 4/8-space indentation and the blank line before class A; 07_structured and literal generated code PDF pass. A block with no repeated baseline pitch cannot establish an exact number of blank rows. |
| N7 | Fixed for supplied false headings | Currency/number-heavy lines, single letters, Abstract and figure-region labels stay plain. Dense vector-label pages do not define heading size ranks. Same-size bold labels require following body evidence; heading levels retain global size rank instead of being overwritten by numbering depth. Attention title is H1 and Introduction H2; invoice total is plain; magazine author/drop cap stay plain. Literal false-heading/rank tests pass. The source magazine overlaps “A town reborn” with its last body line; this is retained but garbled, and is not claimed fixed. |
| N8 | Fixed for supplied duplicates | Annotation rectangles select glyph centers, and rendered links use the preceding character-run prefix to find the specific occurrence. links_dup links the second “here”; invoice links the full northwind.example/pay label. Literal duplicate-link PDF test passes. Rotated annotation rectangles remain unverified. |
| N9 | Fixed for supplied layouts | Uses the N1 profile and band ordering, including non-coincident column baselines. Magazine p1 reads all of column 1 before column 2, then column 3. Invoice p1 reads Bill To/address, Ship To/address, then right-side invoice metadata before its table. Pure literal regressions include four columns and short address-like blocks. No real four-column corpus document was supplied. |
| N10 | Fixed | Exact repeated margin text longer than three chars applies from two pages; Page X of Y patterns normalize varying digits. The two-page paper and invoice lose their repeated running text; contract Page X of 3 disappears even though its third page is unnumbered. Literal two-page regression passes. |

## Conversion and app errors

| Item | Status | Evidence |
| --- | --- | --- |
| Structured watchdog and clean UI | Fixed | Watchdog and ordinary errors both carry error/type/code. The app reads the last structured error, reports fallback progress once, and maps PDF_RESOURCE_LIMIT/PDF_TIME_LIMIT to “This PDF is too large or complex to convert”. Error JSON is parsed rather than rendered. A TypeScript process regression checks the exact progress and terminal messages. |
| Independent fallback RSS budget | Fixed | Production runs pdf_md and MarkItDown in separate fresh subprocesses, each with the 1,500 MiB watchdog. The parent retains neither parser heap. Worker wall budgets are 76/35 seconds, below the app's 120-second budget. Python regressions check fresh worker selection and preserved timeout codes. |
| PDF_TIME_LIMIT | Fixed | Wrapped extraction timeouts are unwrapped alongside resource errors; fallback failure preserves PDF_TIME_LIMIT. Literal error/code regression passes. |
| 64 MiB stream cap | Fixed | The decompression cap is 64 MiB. Layout edge allocation is bounded at 20,000 paint operations while text processing continues. The legitimate 24 MiB map stream converts through the capped CLI at zero loss and 154 MiB RSS. Geometry beyond that bound is intentionally left as plain text rather than inferred tables. The existing stream-bomb regression still rejects its oversized stream. |
| Dense 09d | Clean fallback failure; extraction not fixed | pdf_md still detects substantial text loss. MarkItDown runs independently and exceeds its own RSS cap. CLI returns structured PDF_RESOURCE_LIMIT in 9.93 s, and the app's error mapping is tested. This document is not claimed successfully converted. Smaller dense_250/500/1000/2000 use MarkItDown successfully. |

## Revalidation results

- Python: `pytest apps/desktop/resources/converter -q`: **47 passed**, 15 subtests passed.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: **PASS**.
- `pnpm test`: **19 files passed; 89 tests passed, 2 skipped**. Fresh converter bootstrap dominated the 158-second run. The final error/progress changes also passed a targeted run of both process tests after that run.
- All e2e scripts: **PASS**: selection-chat, conversion, visual-regressions, pdf-reader (full supplied CH2). Selection/conversion/visual scripts report no console errors. Reader imports as pdf_md and captures pages 3/5/10.
- Full corpus: **63 PDFs** through the real CLI, each with watchdogs and fallback enabled: **48 pdf_md successes**, **5 MarkItDown successes**, **4 PASSWORD_PROTECTED**, **2 NO_TEXT_LAYER**, **3 corrupt/empty PDF failures**, **1 PDF_RESOURCE_LIMIT** (09d). No harness timeout. The earlier corpus's 34 PDFs are byte-identical to PDFs in this run. Tester scripts/generators were read and existing generated inputs reused; original output directories were not overwritten.
- The supplied attachment is byte-identical to 00_user_ch2.pdf (SHA-256 checked). Full CH2 has 46 inferred notes; Attention and ResNet have none.
- Read output against source images for ResNet p3, Attention p1, magazine p1, invoice pp1–2, contract p1, CH2 pp3/5/10/16. CH2 retains question ordering, the page-3 notes, page-5 CDN discussion, page-10 300/100000/200 values, and page-16 P24/P25. Formula text remains flattened; equation reconstruction and OCR were excluded.

Local evidence: `/tmp/pdf-last/cli/` contains each final Markdown, sidecar,
structured result, and `/usr/bin/time -l` output; `cli-corpus.log` is the manifest.
`/tmp/pdf-last/app/` contains the CH2 app import evidence. Verification logs are
`/tmp/pdf-tests.log`, `/tmp/pdf-vitest-final.log`, `/tmp/pdf-typecheck-final.log`,
`/tmp/pdf-lint-final.log`, `/tmp/pdf-build-final.log`, `/tmp/pdf-ui-errors-test.log`,
and `/tmp/pdf-e2e-{selection,conversion,visual,reader}.log`.

## Loss and resources

Before values are the tester's preserved sidecars, after values the final CLI
sidecars. The Unicode token convention and actual intended-removal set changed,
so denominators differ; these ratios are normalized multiset comparisons, not
measurements of reading-order correctness.

| PDF | Before loss | After loss | After missing / expected |
| --- | ---: | ---: | ---: |
| Attention | 2.101% | 0.384% | 25 / 6,515 |
| ResNet | 1.927% | 1.791% | 193 / 10,774 |
| Full CH2 | 0.302% | 0.290% | 24 / 8,280 |
| rot_inpage | 11.989%, fallback | 0% | 0 / 4,345 |
| grid_150 | 100%, fallback | 0% | 0 / 10 |
| Korean | false fallback, zero recognized source tokens | 0%, pdf_md | Korean is now counted |
| paper | 0.098% | 0.099% | 1 / 1,010 |
| invoice / contract / magazine | 0% | 0% | 0 / 713; 0 / 470; 0 / 1,638 |

Fresh CLI processes, startup included; concurrent corpus driver used three
independent processes, so times include scheduling contention. macOS time -l RSS
is converted from bytes to MiB and reports the subprocess peak.

| PDF | Final elapsed | Peak RSS |
| --- | ---: | ---: |
| Full CH2 | 1.44 s | 88.9 MiB |
| Attention | 1.30 s | 60.1 MiB |
| ResNet | 1.15 s | 63.7 MiB |
| paper / invoice / contract / magazine | 0.20 / 0.24 / 0.12 / 0.25 s | 49.5 / 43.4 / 42.6 / 52.1 MiB |
| 150-page 09_large | 5.68 s | 62.7 MiB |
| 450-page 09c | 17.48 s | 87.6 MiB |
| 24 MiB vector stream | 12.52 s | 154.0 MiB |
| 09d, failed fallback | 9.93 s | 1,528.5 MiB before watchdog termination |

Unverified: Windows alarm/resource portability; logical bidi display beyond the
Attention run-orientation fix; arbitrary mixed/overlapping rotated blocks;
rotated link/table geometry; real four-column documents. Magazine's source text
overlap and general mathematical layout remain imperfect. The preservation gate
can detect missing normalized tokens, but cannot certify their semantic order.
