# assistant-ui adoption review

Updated 2026-11-03. The chat now uses the styled assistant-ui registry Thread and ModelSelector, rather than an application-built thread and combobox around headless primitives. The existing document-scoped runtime/IPC adapter remains responsible for persistence and provider calls.

## Installation evidence

The original setup protocol is preserved in [setup transcript](evidence/assistant-ui-setup.txt). A detached worktree was created from HEAD at `/Users/vc/.t3/projects/vstudy-aui-setup`. `pnpm install --frozen-lockfile` was run there. `setup-agent@0.0.7 ... stream` was started in a persistent execution session but eventually failed with `setup-agent: HTTP 500`; `status` returned `waiting`, `agentConnected: false`, with no plan or questions. A `log` explained the authorized registry fallback. The setup requires the browser user to click Begin plan before investigation, and later approve a plan; those actions were not fabricated. No `ask` or `ack` was sent because there was no unanswered decision or pending message. The browser setup was **not** completed or reported done.

Registry command, run in that isolated checkout:

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx --yes shadcn@latest add https://r.assistant-ui.com/thread https://r.assistant-ui.com/model-selector https://r.assistant-ui.com/thread-list --yes --overwrite -c apps/desktop
```

The resolved CLI was shadcn **4.23.0**. The first monorepo-root attempt correctly requested `-c apps/desktop`. A dependency install initially stalled downloading a redundant Electron binary; the successful retry skipped that download. The CLI generated 32 files in `src/renderer/components/{assistant-ui,ui}` and `src/renderer/hooks`. Its unmodified generated file hashes and the exact resulting dependency versions are recorded in [registry manifest](evidence/assistant-ui-registry.json). Registry source is mutable; use these hashes when comparing a future update.

Runtime packages are pinned exactly: `@assistant-ui/react` 0.15.32, `@assistant-ui/react-markdown` 0.14.24, `radix-ui` 1.8.1, `class-variance-authority` 0.7.1, `cmdk` 1.1.1, `lucide-react` 1.67.0, `clsx` 2.1.1, `tailwind-merge` 3.6.0, `tw-animate-css` 1.4.0, `tw-shimmer` 0.4.14, `zustand` 5.0.16. React remains 19.2.0 and Tailwind 4.1.18. The generated shadcn imports of `cn` were routed to our local `clsx`/`tailwind-merge` utility instead of adding the unrelated package named `cn`. TypeScript, electron-vite, and Vitest resolve `@/` to `src/renderer/`.

References: [vendor installation](https://www.assistant-ui.com/docs/installation), [registry](https://r.assistant-ui.com/thread), [documentation index](https://www.assistant-ui.com/llms.txt).

## Adopted versus customized

| Surface | Adoption | Local customization |
| --- | --- | --- |
| Thread, viewport, scroll return, history loading | Generated `thread.aui.tsx` structure and components | Empty composer docks at the bottom to leave room above the picker. Persistent branch switching remains omitted because the database stores linear history. |
| Composer, Send/Stop, message edit | Generated Composer, ComposerAction, EditComposer and action buttons | Document selection prefix, budget banner, model/usage slots; original IME-safe input; budget guards on submit and Send; provider availability disables Send. No disabled Stop is mounted while idle. |
| User/assistant messages, action bars | Generated UserMessage, AssistantMessage, UserActionBar, AssistantActionBar | Document selection before user text; usage and interruption status after assistant text; Edit/Regenerate labels. Copy and code copy use vendor implementations. |
| Loading and errors | Generated streamed indicator, skeletons and MessageError | Inline error retains Retry. Markdown smoothing is disabled to preserve immediate streaming and avoid an extra reveal animation after completion. |
| Markdown | Generated styled MarkdownText and code header | Existing GFM/math, sanitize schema, KaTeX/highlight plugins, HTML exclusion, URL allowlist and external-link IPC are wired into its hooks. The document viewer retains its independent source-offset renderer. |
| Model picker | Generated ModelSelector.Root/Trigger/Content/Search/List/Group/Item over Radix Popover and shadcn Command | IPC catalog, availability, raw-ID sublabels, favorites, nonempty recents, resolved-ID deduplication; default row identifies its resolved model. Supported effort radios and priority switch dock beside the list, below it at narrow widths. |
| Palette and type | Tailwind v4 semantic theme tokens | Existing neutral light/dark surfaces, system font, 12–13px utility type; 30px footer controls, hairline borders. No alternate brand palette. |
| Usage and budget | Application-owned | Quiet usage button opens the Usage settings tab. Budget progress/warnings sit above the footer. Unknown costs are not presented as zero. |
| Thread list, attachments, tools, media | Registry files installed | No new sidebar or attachment affordance is enabled. Existing per-document conversation chooser and tools-disabled adapters retain their behavior. |

Generated elements otherwise retain their vendor implementation. Import aliases and unsupported upstream lint suppression comments were normalized. Empty recovery catches in the vendor subtree follow its original behavior. Local changes are in the registry files above and application composition, so future registry updates should be reviewed with the manifest rather than blindly overwritten.

## T3 Code reference

Cloned `https://github.com/pingdotgg/t3code` outside the repo to `/tmp/vstudy-composer-reference-20261103`, commit `cefb544af3c98224874419198c0359b652ca3c94`. Studied `ProviderModelPicker.tsx`, `ComposerModelEffort.tsx`, `ComposerFooterControls.tsx` and `ChatComposer.tsx`: one model/effort trigger, docked model traits, compact footer controls, and a single primary-action slot. This structure is composed from assistant-ui registry components here.

Claude catalog aliases remain valid in main for existing conversations. The shared model schema now carries optional `resolvedId`; the picker collapses aliases by provider and resolved ID, retaining a single explicit Default row plus the friendly canonical choice. The literal fixture test verifies all 13 visible rows and one Opus 5.5 choice against `claude-models.json`. Main still validates every option before invocation. Codex effort/service-tier and Claude fast-mode mappings are unchanged.

## Verification and visual evidence

Baseline registry redesign verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (28 files, 138 passed, 3 opt-in skips), `pnpm build`, `chat-controls.mjs`, `selection-chat.mjs`, `visual-regressions.mjs`, `conversion.mjs` and `composer-visual-qa.mjs` passed. All 23 visual captures were opened and inspected. The manual PDF script requires its external input, as described below.


Evidence logs are `/tmp/vstudy-aui-{typecheck,lint,test,build,controls,selection,visual,conversion,qa}.log`. The visual matrix is generated by `apps/desktop/e2e/composer-visual-qa.mjs` into `/tmp/vstudy-composer-redesign/`: 1200×800 and 900×700, light/dark, idle, search, effort/Fast, long-name truncation and streaming, plus Claude/Codex/Antigravity catalog captures. Long names are a labelled DOM typography stress case; catalog discovery uses actual local providers, and all inference uses the fake provider.

The complaint screenshot is preserved at `/Users/vc/.t3/userdata/attachments/a56d2e42-6477-4555-b6c8-247c8912b20e-e8d71063-8125-4b9f-b918-df6fa6e8ec47.png`.

No paid/authenticated model inference was sent. The manual `pdf-reader.mjs` requires the external full CH2 PDF containing R12/R23/Total average delay anchors; it cannot run without that input. Automatic real PDF conversion is covered separately. A complete screen-reader audit, OS increased-contrast/zoom testing, and provider-side acceptance of every effort/tier combination remain unverified. Craft review was performed directly by the implementation sub-agent; no additional reviewer agent was spawned.
