Synthetic PDFs are generated deterministically by `generate.py` (dev dependency:
reportlab). The adjacent Markdown files are reviewed literal golden expectations.
Run `python -m unittest discover -s apps/desktop/resources/converter -p 'test_*.py'`
from the root in an environment with the pinned converter requirements installed.

`ch2-page3.pdf` is the supplied CH2 worksheet's third page, extracted using
`uvx --with pypdf python -I`, with Apple editing metadata and annotation appearance
streams removed. Font subsetting retains glyph IDs; annotation contents and their
rectangles remain available. `scripts/pdf-fixture.py SOURCE.pdf` reproduces the
small fixture using pypdf, fonttools, and pdfplumber as development tools. The full
18-page source is deliberately excluded. This fixture is for extraction regression,
not pixel comparison of the original annotation appearance.

`ch2-p10-glyphs.json` and `ch2-p16-glyphs.json` contain only the compact equation glyph runs (text, font size and geometry) extracted from user-supplied CH2 pages 10 and 16. The original PDF is not in the repository. `test_ch2_geometry.py` pins readable inline fractions, script position, visual-line grouping and deterministic input order. Inline `${}^{…}$` / `${}_{…}$` scripts are rendered by the reader's existing KaTeX pipeline; the renderer regression asserts script layout nodes.
