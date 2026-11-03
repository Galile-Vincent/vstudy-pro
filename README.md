# VStudy Pro

A macOS Electron app for reading documents and discussing passages with AI. The interface supports English, Traditional Chinese and Japanese.

Import PDF, DOCX, XLSX, PPTX, HTML, CSV, Markdown or plain text (up to 50 MB). Organise documents with folders, pins, tags and saved filters; search the library, select passages, follow answer citations, and track reported or estimated token usage and cost. Read-only structured tables are optional. Documents and originals stay in a local library; there is no device sync.

## Install, run and verify

Requires Node >=24.11.1 and pnpm 10.28.2. Automatic E2E converter setup also requires uv; an existing locked environment can be supplied instead. Run from the repository root:

```sh
pnpm install
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
pnpm security:check
pnpm smoke
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm package
```

`pnpm e2e` builds once and runs every `apps/desktop/e2e/*.mjs` serially against that output, with deadlines and a pass/fail table. Logs default to `/tmp/vstudy-final/e2e`; set `VSTUDY_E2E_EVIDENCE` to preserve separate runs. The runner also prepares an unsigned package and a hash-locked test converter environment using uv (which may download Python/packages). Set `VSTUDY_CONVERTER_VENV` to reuse an existing prepared environment. Standalone packaged smoke requires that variable. Live Codex checks require explicit opt-in and authentication; skipped live checks do not prove live operation.

## Providers and keys

Claude Code (`claude`), Codex (`codex`) and Antigravity (`agy`) default OFF. Settings > Providers and onboarding offer individual opt-ins to use your existing CLI login. Before opt-in, resolution checks installed files without launching the CLI. Settings displays the resolved executable and offers a native Change chooser; main validates its path and permissions. A changed executable requires confirmation before reuse. Sign in outside VStudy (`claude auth login`, `codex login`, or `agy`).

Anthropic, OpenAI and OpenAI-compatible API endpoints are supported. Saved keys are encrypted through asynchronous macOS Keychain access only when explicitly saved or unlocked; window creation never waits for decryption. Access has a ten-second timeout. Retry after granting access, or choose **Use without saving keys** to retain a key only for the current process. Saved keys need explicit unlocking after restart before model discovery can use them.

Codex requires authenticated CLI **0.166.0**, macOS and `/usr/bin/sandbox-exec`. Its isolated chat transport disables native tools and denies child-process creation; a cached canary verification fails closed on unsupported versions or failed verification. It is not a filesystem or endpoint-only network sandbox for a compromised CLI. See [the transport verification](docs/codex-tool-free.md).

## Privacy and network

VStudy itself sends no analytics. Enabled API providers receive questions, conversation history, document metadata and selected text; without a selection, an outline and opening excerpt are included. Prior selections can remain in conversation context. CLI providers use their own login and may contact their own discovery, verification, quota, chat or telemetry services. Claude receives telemetry/nonessential-traffic opt-outs. External browser and mail links require confirmation; mail confirmation shows address, subject and body length.

Settings > Privacy shows the bounded, session-only app-initiated network activity inventory. It records requests and CLI launches, not every encrypted request inside a CLI or Chromium. It is not a packet capture; byte counts are currently unknown. Delete all data requires typing `DELETE` and a native confirmation, then removes the application data namespace and quits. It keeps original files outside the library, CLI logins and shared Python download caches; it is not secure erasure of backups or SSD blocks.

## Conversion

The first conversion asks permission before downloading hash-locked Python packages from `pypi.org` and `files.pythonhosted.org`; uv may download Python from GitHub. Install uv or Python 3.10+ separately. Settings > Privacy provides Retry and persistent Offline mode. Offline mode supports Markdown and text without installation. The converter starts on demand and stops after idle time (default five minutes, configurable from one to sixty). No idle startup prewarm is used. Cold Python startup and imports can take several seconds; warm timing targets do not apply to that first import.

PDF conversion first uses the pinned pdfplumber-based `pdf_md` parser, with MarkItDown fallback. Conversion workers deny network access on macOS. Progressive first-page delivery is provisional until conversion finishes. See [performance targets and measurements](apps/desktop/resources/converter/PERFORMANCE.md).

There is **no OCR**: scanned/image-only PDFs cannot be read. PDF tables require ruled grids; images may be omitted, and columns, equations and complex layouts can lose fidelity. Single-file Markdown/HTML imports do not copy neighboring images. UTF-16 selection offsets map to stored Markdown; generated math may require selecting its containing section. Arrow and Shift+Arrow within the focused reader move/extend a text selection; Cmd/Ctrl+Shift+K asks about it.

## Packaging and known limits

macOS only. Local packages are ad-hoc signed, unsigned by a Developer ID, and not notarized. macOS may show Gatekeeper warnings and Keychain permission prompts, including after rebuilds. When saving or unlocking a key, macOS may ask to let the app access its login-Keychain encryption key and may request your Keychain password. Granting access permits saved-key use; denying access leaves Retry and session-only use available. A rebuilt ad-hoc app may ask again. Do not interpret mock-Keychain packaged smoke as proof of real Keychain access.

For a release, configure Developer ID signing and notarization through electron-builder credentials (never commit them). Developer ID signing, notarization, stapling, Gatekeeper acceptance and manual VoiceOver review remain release verification tasks. Performance budgets and full E2E acceptance must be judged from current evidence, not historical pass counts.

[Documentation index](docs/README.md) · [Security model and historical evidence](docs/SECURITY.md) · [Localization verification](docs/i18n-verification.md)
