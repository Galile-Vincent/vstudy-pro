# VStudy Pro

A macOS Electron app for reading converted documents and chatting about selected passages.

## Requirements

- Node >=24.11.1 and pnpm 10.28.2 (see `packageManager`).
- `uv` or Python 3.10+ (`python3`) for real document conversion. The first conversion asks permission to create a private virtual environment and download hash-locked packages from PyPI (`pypi.org`, `files.pythonhosted.org`); uv may also download Python from GitHub. Offline mode keeps Markdown/text reading available. Retry conversion to ask again.
- CLI providers default OFF; enable each explicitly in Settings. Optional `claude` / `codex` / `agy` (Antigravity) CLIs, installed and authenticated separately, for CLI providers. API providers can be configured in Settings. Antigravity uses ACP over stdio, probes the CLI’s existing login, and lists live session models (labelled static defaults if unavailable). Run `agy` once to sign in.

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

These launch real, visible Electron windows with temporary user data. The selection check replaces only the native file chooser; import, persistence, rendering, IPC and fake-provider chat run in the app. The conversion check generates DOCX, XLSX and PDF fixtures and runs the actual converter (including first-run bootstrap). It exercises DOCX import, checks its embedded image, and verifies both data images and relative library images through the custom asset protocol. Both clean up on completion. Set `VSTUDY_SCREENSHOT=/absolute/path.png` to choose the selection screenshot destination; related UI states use the same filename prefix.

For an isolated renderer preview, `VITE_MOCK_DESKTOP=1 pnpm build` explicitly bundles the mock bridge, then `VSTUDY_RENDERER_MOCK=1 node e2e/selection-chat.mjs` runs the mock variant. Rebuild without the flag before testing the real app.

Selection offsets are UTF-16 positions in the stored Markdown. Generated math does not map character for character; use its containing section. Selected passages also appear in user-message history. Main owns prompt assembly and treats document content as untrusted.

## Conversion limits

PDFs use the pinned pdfplumber-based `pdf_md` converter first, with MarkItDown as automatic fallback. Tables require a ruled grid; text alignment alone never creates one. Font sizes determine heading ranks, repeated margins are removed, and PDF text annotations become `> note:` blocks. Hidden `<!-- page N -->` markers remain in stored Markdown and provide page metadata for selections. The reader header shows the parser that ran; existing records default to `markitdown`.

This is text-layer extraction, without OCR. If both parsers produce no text, import reports “no text layer; OCR not supported yet”. Raster images currently use an explicit omission placeholder. Complex equations, interleaved columns, and document-specific line wrapping may lose layout. Sources retain their original bytes in the library.

Python golden tests: install `apps/desktop/resources/converter/requirements.txt` into a Python environment, then run `python -m unittest discover -s apps/desktop/resources/converter -p 'test_*.py'`. Development-only comparisons: `scripts/pdf-compare.py` (see its module docstring for isolated dependencies); PyMuPDF is never a shipped requirement. `node e2e/pdf-reader.mjs SOURCE.pdf` from `apps/desktop` imports through the built Electron app and captures reader pages 3/5 under `/tmp/vstudy-pdf-evidence`.

Single-file imports do not copy neighboring image files. Relative images in imported Markdown/HTML may be unavailable; embedded images extracted by the converter are supported.

`node e2e/visual-regressions.mjs` additionally checks compact selection previews, Markdown replies, toolbar buttons, draft preservation on model changes, and restart behavior in the built app. This check requires a detected Claude CLI for its model picker option; it never sends a request to that CLI.

Language preferences and reply language are in Settings. Interface languages: English, Traditional Chinese and Japanese; switching is live. See [the localization glossary](docs/i18n-glossary.md) and [verification guide](docs/i18n-verification.md). The Electron locale matrix is `node e2e/i18n.mjs` from `apps/desktop` after building.

The optional Welcome tour opens from Home, Settings, or the last onboarding step. Its implementation review and acceptance gaps are in [the Welcome design review](docs/design-reviews/welcome.md). After a normal build, run from `apps/desktop`:

```sh
VSTUDY_ANIMATION_MATRIX=1 node e2e/welcome.mjs
node e2e/welcome-details.mjs
node e2e/welcome-supplement.mjs
node e2e/welcome-pseudo.mjs
node e2e/welcome-performance.mjs
```

These save screenshots, animation frames and measurements under `/tmp/vstudy-welcome/`. The pseudo-locale check starts and closes its own development renderer with the real Electron bridge. The performance check enforces p95 ≤16.7 ms, zero CLS and no long animation frames over 50 ms; it currently fails the p95 gate on the verification host. Native translation review and VoiceOver remain required.

Security controls, trust boundaries, accepted advisories and verification evidence: [docs/SECURITY.md](docs/SECURITY.md). Run `pnpm security:check` for the reviewed-audit gate, dangerous-API and Electron lint, and normal tests.

Codex chat requires authenticated CLI **0.166.0**, macOS and `/usr/bin/sandbox-exec`. It uses isolated temporary state and disables native tools; user Codex config, profiles, rules and skills are ignored. A startup canary proof is cached per app/binary/safety configuration; failures show “Unavailable: could not verify tool-free mode”. Restart after fixing authentication. Other CLI versions fail closed pending verification. Model effort/service-tier choices, usage streaming and Stop remain supported. See [Codex verification and limits](docs/codex-tool-free.md).

## Network activity and unsigned builds

VStudy Pro itself sends no analytics. Enabled API providers contact Anthropic, OpenAI, or your configured compatible endpoint for model discovery and chat. Enabled CLI clients use their own logins and may contact their own backend or telemetry services for discovery, verification, chat and quota checks. Claude receives its nonessential-traffic/telemetry opt-outs. Converter installation contacts the hosts listed above after consent; conversion workers deny network access on macOS. Confirmed external links open your browser or mail application. Chromium background traffic and opaque CLI subprocess traffic have not been packet-captured.

Main exposes its bounded, session-only activity log through `settings:networkActivity` (action, time, destination); this records app-initiated requests and CLI launches, not individual encrypted requests inside third-party tools. Renderer panel wiring remains outstanding; see [the audit response](docs/security-audit-1-response.md).

For an explicitly unsigned local build, run `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package`. afterPack applies the fuses then ad-hoc signs the app. This is not Developer ID signing or notarization; macOS Keychain may ask permission after each ad-hoc rebuild. The observed pre-ready hang was a wait inside Keychain, captured in the audit response. Automated packaged smoke uses `--use-mock-keychain` with fresh temporary user data and the fake provider; it does not verify real Keychain encryption.

To sign a release, set `CSC_NAME` to the Developer ID Application identity, or provide `CSC_LINK` and `CSC_KEY_PASSWORD`. For notarization, configure `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, or the electron-builder-supported App Store Connect API-key variables. Never commit credentials. Signing, notarization, stapling and Gatekeeper acceptance still require release verification.

Packaged main/preload dependencies are bundled; `node_modules` is excluded. The converter Python sources and hash lock remain external resources. To run the packaged smoke from `apps/desktop`, prepare an isolated converter environment with the shipped lock and its SHA-256 marker, then run `VSTUDY_CONVERTER_VENV=/absolute/venv node e2e/packaged-smoke.mjs`. It clones that environment, imports Markdown, converts DOCX, persists a fake-provider chat, verifies fuses/signature/entitlements, and quits. Test user data is forced under a fresh `vstudy-packaged-smoke-*` temporary directory before startup and cannot select the real Application Support directory.
