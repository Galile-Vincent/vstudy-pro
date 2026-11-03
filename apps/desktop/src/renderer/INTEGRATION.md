# Renderer integration

This work changes only `src/renderer/**` and `e2e/**`. The package manifest and lockfile need these exact dependencies added by the integration owner before a clean install can build this renderer:

```sh
pnpm --filter @vstudy/desktop add --save-exact @assistant-ui/react@0.15.32 react-markdown@10.1.0 remark-gfm@4.0.1 remark-math@6.0.0 rehype-katex@7.0.1 rehype-sanitize@6.0.0 rehype-highlight@7.0.2 unified@11.0.5 remark-parse@11.0.0 katex@0.16.47 decode-named-character-reference@1.3.0
pnpm --filter @vstudy/desktop add -D --save-exact @types/hast@3.0.5 @types/mdast@4.0.4 jsdom@30.1.3
```

For this shared-checkout implementation, dependencies were installed outside the repository at `/tmp/vstudy-renderer-deps` and linked into ignored `node_modules` directories. No manifest or lockfile was modified. Replacing these temporary links with the normal pnpm install is required for reproducible builds.

## Running

- `VITE_MOCK_DESKTOP=1 pnpm build` builds the preview bridge even inside Electron.
- `pnpm build` uses the real preload. The mock is otherwise selected only if `invoke` or `onChatEvent` is missing.
- `pnpm --filter @vstudy/desktop exec vitest run src/renderer` runs renderer unit/component tests.
- From `apps/desktop`, `node e2e/selection-chat.mjs` launches the real built Electron app with `VSTUDY_FAKE_PROVIDER=1`. Build normally first. The test replaces only the native file chooser to return `e2e/fixtures/reading.md`; document import, rendering, IPC, persistence and chat are real.
- For the mock variant, build with the Vite flag, then run `VSTUDY_RENDERER_MOCK=1 node e2e/selection-chat.mjs`.
- Set `VSTUDY_SCREENSHOT=/absolute/path.png` to choose the E2E screenshot destination. Light and dark screenshots are captured; the default is the OS temporary directory. The app and temporary user-data directory are closed/removed on completion or failure.

## Contract gaps

- No channel opens allowlisted external links in the system browser. Links are inert and explain the missing support. Add a main-owned, validated http/https/mailto opener before enabling them; renderer never calls `window.open`.
- `documents:import` accepts only `{}` and opens the native dialog. A file drop opens that dialog with instructions to choose the dropped file. Direct dropped-file import needs a validated main/preload capability; renderer cannot read file paths.
- `documents:read` supplies Markdown only. Safe relative image URLs can render app-relative assets, but imported document assets need a main-owned asset resolver/protocol. Raster data images work now; remote images are blocked.

Selection offsets use UTF-16 positions in the original Markdown. Text runs retain source positions; escape/entity decoding and code fences are accounted for. Heading ranges use the Markdown AST, including setext headings, and end at the next same-or-higher heading. Generated math layout does not provide a character-for-character source mapping; use the containing section when selecting a whole formula.

User messages include a readable selected-passage quote so it survives history reload with the existing text-only Message contract. The selection is also sent as the typed `selection` field. Main owns prompt assembly and treating quoted document content as untrusted.

References used: [LocalRuntime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime), [Thread](https://www.assistant-ui.com/docs/primitives/thread), [Composer](https://www.assistant-ui.com/docs/primitives/composer), and [t3code stylesheet](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/index.css).
