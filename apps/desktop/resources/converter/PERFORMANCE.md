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
