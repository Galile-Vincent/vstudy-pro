# VStudy Pro

A macOS Electron app for reading converted documents and chatting about selected passages.

## Requirements

- Node >=24.11.1 and pnpm 10.28.2 (see `packageManager`).
- `uv` or Python 3.10+ (`python3`) for real document conversion. The first conversion creates a private virtual environment and installs the pinned MarkItDown requirements; internet access is needed once.
- Optional `claude` / `codex` CLIs, installed and authenticated separately, for CLI providers. API providers can be configured in Settings.

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

These launch real, visible Electron windows with temporary user data. The selection check replaces only the native file chooser; import, persistence, rendering, IPC and fake-provider chat run in the app. The conversion check generates DOCX, XLSX and PDF fixtures and runs the actual converter (including first-run bootstrap). Both clean up on completion. Set `VSTUDY_SCREENSHOT=/absolute/path.png` to choose the selection screenshot destination; related UI states use the same filename prefix.

For an isolated renderer preview, `VITE_MOCK_DESKTOP=1 pnpm build` explicitly bundles the mock bridge, then `VSTUDY_RENDERER_MOCK=1 node e2e/selection-chat.mjs` runs the mock variant. Rebuild without the flag before testing the real app.

Selection offsets are UTF-16 positions in the stored Markdown. Generated math does not map character for character; use its containing section. Selected passages also appear in user-message history. Main owns prompt assembly and treats document content as untrusted.
