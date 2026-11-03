# VStudy Pro

A macOS Electron app for reading converted documents and chatting about selected passages.

## Requirements

- Node >=24.11.1 and pnpm 10.28.2 (see `packageManager`).
- `uv` or Python 3.10+ (`python3`) for real document conversion. The first conversion creates a private virtual environment and installs the pinned MarkItDown requirements; internet access is needed once.
- Optional `claude` / `codex` / `agy` (Antigravity) CLIs, installed and authenticated separately, for CLI providers. API providers can be configured in Settings. Antigravity uses ACP over stdio, probes the CLI’s existing login, and lists live session models (labelled static defaults if unavailable). Run `agy` once to sign in.

## Run and check

From the repository root:

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke
pnpm package
```

`pnpm package` builds macOS app/dmg artifacts; signing needs release configuration. Renderer tests alone: `pnpm --filter @vstudy/desktop exec vitest run src/renderer`.

## End-to-end checks

Build normally first, then from `apps/desktop`:

```sh
VSTUDY_FAKE_PROVIDER=1 node e2e/selection-chat.mjs
VSTUDY_FAKE_PROVIDER=1 node e2e/conversion.mjs
```

These launch real, visible Electron windows with temporary user data. The selection check replaces only the native file chooser; import, persistence, rendering, IPC and fake-provider chat run in the app. The conversion check generates DOCX, XLSX and PDF fixtures and runs the actual converter (including first-run bootstrap). It imports DOCX by file drop, checks its embedded image, and verifies both data images and relative library images through the custom asset protocol. Both clean up on completion. Set `VSTUDY_SCREENSHOT=/absolute/path.png` to choose the selection screenshot destination; related UI states use the same filename prefix.

For an isolated renderer preview, `VITE_MOCK_DESKTOP=1 pnpm build` explicitly bundles the mock bridge, then `VSTUDY_RENDERER_MOCK=1 node e2e/selection-chat.mjs` runs the mock variant. Rebuild without the flag before testing the real app.

Selection offsets are UTF-16 positions in the stored Markdown. Generated math does not map character for character; use its containing section. Selected passages also appear in user-message history. Main owns prompt assembly and treats document content as untrusted.

## Conversion limits

PDFs use the pinned pdfplumber-based `pdf_md` converter first, with MarkItDown as automatic fallback. Tables require a ruled grid; text alignment alone never creates one. Font sizes determine heading ranks, repeated margins are removed, and PDF text annotations become `> note:` blocks. Hidden `<!-- page N -->` markers remain in stored Markdown and provide page metadata for selections. The reader header shows the parser that ran; existing records default to `markitdown`.

This is text-layer extraction, without OCR. If both parsers produce no text, import reports “no text layer; OCR not supported yet”. Raster images currently use an explicit omission placeholder. Complex equations, interleaved columns, and document-specific line wrapping may lose layout. Sources retain their original bytes in the library.

Python golden tests: install `apps/desktop/resources/converter/requirements.txt` into a Python environment, then run `python -m unittest discover -s apps/desktop/resources/converter -p 'test_*.py'`. Development-only comparisons: `scripts/pdf-compare.py` (see its module docstring for isolated dependencies); PyMuPDF is never a shipped requirement. `node e2e/pdf-reader.mjs SOURCE.pdf` from `apps/desktop` imports through the built Electron app and captures reader pages 3/5 under `/tmp/vstudy-pdf-evidence`.

Single-file imports do not copy neighboring image files. Relative images in imported Markdown/HTML may be unavailable; embedded images extracted by the converter are supported.

`node e2e/visual-regressions.mjs` additionally checks compact selection previews, Markdown replies, toolbar buttons, draft preservation on model changes, and restart behavior in the built app. This check requires a detected Claude CLI for its model picker option; it never sends a request to that CLI.

Language preferences and reply language are in Settings. Interface languages: English, Traditional Chinese and Japanese; switching is live. See [the localization glossary](docs/i18n-glossary.md) and [verification guide](docs/i18n-verification.md). The Electron locale matrix is `node e2e/i18n.mjs` from `apps/desktop` after building.
