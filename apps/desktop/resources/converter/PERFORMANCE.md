# Conversion performance, 2026-11-03

Baseline on this Mac, Python 3.12.14, pinned requirements, built Electron 40.
Real supplied 18-page CH2 (never copied into git), generated 100-page PDF with
40 lines/page, generated small DOCX/XLSX. Filesystem caches are warm except the
first import probe. Single samples, not percentiles.

| Input | CLI seconds | Electron click to ready | First reader DOM |
| --- | ---: | ---: | ---: |
| CH2 | 1.237 | 1.547 | 2.130 |
| 100 pages | 2.909 | 3.022 | 3.082 |
| DOCX | .332 | .415 | 1.060 |
| XLSX | .320 | .470 | 1.031 |

Interpreter + first import probe: pdfminer .039s, pdfplumber .458s,
MarkItDown 4.055s. These are separate fresh processes with cold disk/module
caches; after warming caches the CLI measurements above are much faster.
Repeated imports within a process take 1–3 microseconds. The app's bootstrap
check imports both libraries in a separate process, adding .390s on first job.

CH2 cProfile total 3.352s (profiling overhead; do not add to CLI time):
page.chars 2.528s (75%), including pdfminer layout 1.939s; annotation property
resolution .441s in 36 calls for 18 pages. The 100-page cProfile takes 9.811s,
of which chars takes 6.699s (68%). Character parsing is the throughput limit;
Python startup alone cannot remove that cost. Global margin removal and heading
ranking require all pages, so previews must be explicitly provisional.
The reader's 1s completion polling explains a large portion of perceived latency.

Reproduce from repo root:

```
PYTHON apps/desktop/resources/converter/profile-convert.py SOURCE.pdf /tmp/profile
node apps/desktop/resources/converter/profile-convert.mjs SOURCE.pdf /tmp/profile/100-pages.pdf /tmp/profile/sample.docx /tmp/profile/sample.xlsx
```

The Electron script needs a private PROFILE_DATA directory containing an installed
converter-venv; use a new user-data directory each run to avoid deduplication.
Python dumps stage-level cProfile statistics and Markdown SHA-256 beside the
inputs in /tmp. Evidence: /tmp/vstudy-speed-before, /tmp/vstudy-speed-electron-baseline.log.

## Result and limits

Warm-worker sample after a one-second application warmup (`PROFILE_WARM=1`),
normal built Electron, same fixtures and hardware. Times are seconds; first
visible means the first nonempty reader DOM, not a screenshot paint timestamp.

| Input | Before first reader | After first preview | Before ready | After ready |
| --- | ---: | ---: | ---: | ---: |
| CH2, 18 pages | 2.130 | **.122** | 1.547 | **1.272** |
| 100-page text | 3.082 | **.045** | 3.022 | 3.577 |
| DOCX | 1.060 | .137 | .415 | .157 |
| XLSX | 1.031 | .033 | .470 | .042 |

The CH2 warm first-page <1.5s and total <4s targets pass. The 100-page
first-page <2s target passes. The 100-page total regressed ~.55s; streaming,
preview rendering and retained warm-process heaps have a cost. This change
prioritizes time to reading, and does not claim faster long-PDF throughput.
Concurrent app/tests produced CH2 totals up to 3.78s; these single samples are
not latency guarantees. Further large-document virtualization was outside the
permitted renderer changes (app.tsx converting state only).

Where the seconds go, measured after instrumentation:

| Stage | CH2 seconds | 100 pages seconds |
| --- | ---: | ---: |
| Venv fingerprint/executable check (background, once) | .051 | already ready |
| Worker spawn + imports (background, once) | .337 | already ready |
| SHA-256 + source copy | .0314 | .00094 |
| DB insert | .00090 | .00015 |
| Queue wait, empty queue | .00004 | .000008 |
| Worker extraction + preview publication | 1.163 | 3.486 |
| DB ready transition | .00020 | .00012 |
| Character parsing, direct stage probe | .818 | 2.031 |
| Dedupe | .042 | .290 |
| Lines | .043 | .365 |
| Columns / reading order | .0051 | .0046 |
| Tables | .0114 | .0028 |
| Blocks + Markdown rendering | .0016 | .0059 |
| Preservation gate | .0139 | .1066 |
| Separate fresh pdf_md worker, startup included | 1.157 | 3.033 |
| Separate fresh MarkItDown worker, startup included | 1.297 | 3.582 |

Direct stage probes run separately from the Electron measurements; do not sum
those rows with the worker total. Forced fallback timings are diagnostic, not
additional work performed for these successful pdf_md imports. Before main
substage instrumentation, copy/DB/queue times were not separately captured;
the baseline entry-to-ready numbers above are measured, not inferred.

The full renderer pipeline was measured using the actual DocumentMarkdown,
React Profiler, react-markdown, remark GFM/math, rehype sanitize/KaTeX/highlight,
and selection-offset stamping in jsdom: **66,490 characters, .389s React
render, .414s render+commit, .00049s offset stamping**. This is a development
React/jsdom benchmark, not a production GPU paint measurement. Repeated preview
renders were measurable, so preview Markdown is memoized and limited to the
first five pages. Page-count events and the determinate bar continue through
the final page. Full-document rendering remains unchanged; stored Markdown
and final selection offsets remain byte-identical.

Implementation: background bootstrap, explicit persistent uv/pip wheel caches,
JSON-lines warm worker with scrubbed environment/argv arrays/no shell, 120s
per-job deadline, five-minute idle expiry, restart on next request after crash,
and existing 1,500MiB process RSS watchdog. Fallback retains its fresh subprocess
and 35s budget; the warm PDF extraction retains its 72s alarm and stream caps.
Duplicate annotation resolution was removed without changing final output.
Preview files are bounded and temporary; no progress is stored in SQLite.
Selection and chat are disabled until finalization, since global margin and
heading decisions can change text offsets. Partial-context chat is not
implemented. This is a first-five-page preview, not an unbounded live reader.

Bootstrap reports setup/install stages and uv download sizes when the installer
emits them; no fabricated percentage or download size. A completely empty-cache
network install and Windows resource portability remain unverified. Earlier
fresh installations with private temporary caches stalled for minutes, whereas
the explicit shared wheel cache completed the real converter integration suite
in 7.8s. Network/bootstrap work can still dominate a genuine first run.

Verification:

- Python: **49 passed, 15 subtests passed**.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: pass.
- `pnpm test`: **24 files, 107 passed, 2 skipped** (includes concurrent usage changes).
- Existing selection-chat, conversion, visual-regressions, pdf-reader e2e: pass.
  PDF-reader now waits for finalization explicitly instead of assuming the first
  visible text means the job finished.
- Progressive e2e: `PROFILE_ASSERT_PROGRESS=1` with profile-convert.mjs checks
  ordered page events, multiple determinate counts in the DOM, and visible
  Markdown before completion. Run with a fresh PROFILE_DATA as above.
- Worker tests cover same-PID reuse, ordinary error recovery, crash restart,
  timeout termination/restart; Python checks multiple jobs and final Markdown
  equality with and without previews.
- CH2 SHA-256 remains
  `e6c2e251437506db73561546957a5659aff495e9c64fe5f7e5569af3e74efcfe`.
  100-page PDF, DOCX and XLSX hashes also match baseline.

Evidence: `/tmp/vstudy-speed-warm.log`, `/tmp/vstudy-speed-after/profile.json`,
`/tmp/vstudy-speed-targeted-final.log`, `/tmp/vstudy-speed-all-tests.log`,
`/tmp/vstudy-speed-{selection,conversion,visual}-final.log`,
`/tmp/vstudy-speed-reader-verified.log`, `/tmp/vstudy-speed-progress-check.log`.
