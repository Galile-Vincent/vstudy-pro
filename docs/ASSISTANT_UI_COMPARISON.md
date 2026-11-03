# assistant-ui adoption review

Updated 2026-11-03. The chat now uses the styled assistant-ui registry Thread and ModelSelector, rather than an application-built thread and combobox around headless primitives. The existing document-scoped runtime/IPC adapter remains responsible for persistence and provider calls.

## Installation evidence

The original setup protocol is preserved in [setup transcript](evidence/assistant-ui-setup.txt). A detached worktree was created from HEAD at `/Users/vc/.t3/projects/vstudy-aui-setup`. `pnpm install --frozen-lockfile` was run there. `setup-agent@0.0.7 ... stream` was started in a persistent execution session but eventually failed with `setup-agent: HTTP 500`; `status` returned `waiting`, `agentConnected: false`, with no plan or questions. A `log` explained the authorized registry fallback. The setup requires the browser user to click Begin plan before investigation, and later approve a plan; those actions were not fabricated. No `ask` or `ack` was sent because there was no unanswered decision or pending message. The browser setup was **not** completed or reported done.

Registry command, run in that isolated checkout:

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx --yes shadcn@latest add https://r.assistant-ui.com/thread https://r.assistant-ui.com/model-selector https://r.assistant-ui.com/thread-list --yes --overwrite -c apps/desktop
```

The resolved CLI was shadcn **4.23.0**. The first monorepo-root attempt correctly requested `-c apps/desktop`. A dependency install initially stalled downloading a redundant Electron binary; the successful retry skipped that download. The first CLI run generated 32 files in `src/renderer/components/{assistant-ui,ui}` and `src/renderer/hooks`. Its unmodified generated file hashes and the exact resulting dependency versions are recorded in [registry manifest](evidence/assistant-ui-registry.json). Registry source is mutable; use these hashes when comparing a future update.

A second source installation used the verified static registry names:

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx --yes shadcn@4.23.0 add https://r.assistant-ui.com/sources.json https://r.assistant-ui.com/elements-document-reference.json https://r.assistant-ui.com/elements-inline-citation.json https://r.assistant-ui.com/elements-thinking-indicator.json https://r.assistant-ui.com/logos.json https://r.assistant-ui.com/elements-data-table.json https://r.assistant-ui.com/elements-suggestions.json https://r.assistant-ui.com/generative-ui.json --yes --overwrite -c apps/desktop
```

This generated 12 additional source files. The friendly `/document-reference` URL returned 404; the verified registry item is `elements-document-reference.json`. The complete 44-file provenance and the current dependency pins are in the manifest. Imports are the registry's actual `components/assistant-ui/elements/*.aui` or `.tsx` paths; no Next.js scaffold was run.

Runtime packages are pinned exactly: `@assistant-ui/react` 0.15.32, `@assistant-ui/react-markdown` 0.14.24, `radix-ui` 1.8.1, `class-variance-authority` 0.7.1, `cmdk` 1.1.1, `lucide-react` 1.67.0, `clsx` 2.1.1, `tailwind-merge` 3.6.0, `tw-animate-css` 1.4.0, `tw-shimmer` 0.4.14, `zustand` 5.0.16. Additional exact pins: `@assistant-ui/generative-ui` 0.0.8, `@base-ui/react` 1.9.0, `beautiful-mermaid` 1.1.3, `leaflet` 1.9.4, and development `@types/leaflet` 1.9.21. React remains 19.2.0 and Tailwind 4.1.18. The generated shadcn imports of `cn` were routed to our local `clsx`/`tailwind-merge` utility instead of adding the unrelated package named `cn`. TypeScript, electron-vite, and Vitest resolve `@/` to `src/renderer/`.

References: [vendor installation](https://www.assistant-ui.com/docs/installation), [registry](https://r.assistant-ui.com/thread), [documentation index](https://www.assistant-ui.com/llms.txt).

## Adopted versus customized

| Surface | Adoption | Local customization |
| --- | --- | --- |
| Thread, viewport, scroll return, history loading | Generated `thread.aui.tsx` structure and components | Empty composer docks at the bottom to leave room above the picker. Persistent branch switching is deferred for the database evidence below. |
| Composer, Send/Stop, message edit | Generated Composer, ComposerAction, EditComposer and action buttons | Document selection prefix, budget banner, model/usage slots; original IME-safe input; budget guards on submit and Send; provider availability disables Send. No disabled Stop is mounted while idle. |
| User/assistant messages, action bars | Generated UserMessage, AssistantMessage, UserActionBar, AssistantActionBar | Document selection before user text; usage and interruption status after assistant text; Edit/Regenerate labels. Copy and code copy use vendor implementations. |
| Loading and errors | Generated ThinkingIndicator, streamed indicator, skeletons and MessageError | Inline error retains Retry. Markdown smoothing is disabled to preserve immediate streaming and avoid an extra reveal animation after completion. |
| Markdown | Generated styled MarkdownText and code header | Existing GFM/math, sanitize schema, KaTeX/highlight plugins, HTML exclusion, URL allowlist and external-link IPC are wired into its hooks. The document viewer retains its independent source-offset renderer. |
| Model picker | Generated ModelSelector.Root/Trigger/Content/Search/List/Group/Item over Radix Popover and shadcn Command | IPC catalog, availability, raw-ID sublabels, favorites, nonempty recents, resolved-ID deduplication; default row identifies its resolved model. Supported effort radios and priority switch dock beside the list, below it at narrow widths. |
| Palette and type | Tailwind v4 semantic theme tokens | Existing neutral light/dark surfaces, system font, 12–13px utility type; 30px footer controls, hairline borders. No alternate brand palette. |
| Usage and budget | Application-owned | Quiet usage button opens the Usage settings tab. Budget progress/warnings sit above the footer. Unknown costs are not presented as zero. |
| Thread list | Generated ThreadList, search, item actions and New Thread | `ExternalStoreThreadListAdapter` binds the per-document conversation list in a bounded header popover. The chosen conversation is remembered per document. Unsupported rename/archive capabilities are omitted. |
| Reasoning, citations and sources | Installed Reasoning, Sources, Citation and DocumentReference | Reported summaries stream and persist; main validates citation IDs against actual headings/page comments before emitting canonical references. Clicking a source highlights the matching document section. PDF page controls appear only when actual page markers exist. |
| Tool UI and generative tables | Installed ToolFallback, ToolGroup, generative vocabulary and DataTable | Unknown calls render inertly. Optional API-only `present` admits bounded text tables and is OFF by default. CLI tools remain disabled. |
| Suggestions, read aloud, logos | Installed Suggestions/ThreadFollowupSuggestions and provider logos; vendor action-bar primitives | Document prompts use a local adapter without an extra model call. Speech appears only when the browser supports speech synthesis; it requires a user click. |
| Attachments and media | Registry dependencies retained | No adapter emits upload/image/audio/video parts. Document import and the explicitly retained source-offset selection chip remain the supported document inputs. |

Generated elements otherwise retain their vendor implementation. Import aliases and unsupported upstream lint suppression comments were normalized. Empty recovery catches in the vendor subtree follow its original behavior. Local changes are in the registry files above and application composition, so future registry updates should be reviewed with the manifest rather than blindly overwritten.

## T3 Code reference

Cloned `https://github.com/pingdotgg/t3code` outside the repo to `/tmp/vstudy-composer-reference-20261103`, commit `cefb544af3c98224874419198c0359b652ca3c94`. Studied `ProviderModelPicker.tsx`, `ComposerModelEffort.tsx`, `ComposerFooterControls.tsx` and `ChatComposer.tsx`: one model/effort trigger, docked model traits, compact footer controls, and a single primary-action slot. This structure is composed from assistant-ui registry components here.

Claude catalog aliases remain valid in main for existing conversations. The shared model schema now carries optional `resolvedId`; the picker collapses aliases by provider and resolved ID, retaining a single explicit Default row plus the friendly canonical choice. The literal fixture test verifies all 13 visible rows and one Opus 5.5 choice against `claude-models.json`. Main still validates every option before invocation. Codex effort/service-tier and Claude fast-mode mappings are unchanged.

## Persistence, citations and optional presentation

The LocalRuntime/ChatModelAdapter still sends through validated Electron IPC. `reasoning-delta`, `citations`, and `tool-call` are additive nonterminal events; bounded schemas validate them at the provider/main boundary. Main accumulates and persists optional reasoning/citations/toolCalls on text parts and forwards them only while the request is active. There is exactly one terminal done/error, and late events after abort are dropped. Renderer reloads reconstruct assistant-ui reasoning, source, and tool parts. Reported reasoning summaries are shown; the app does not request or invent private reasoning.

Prompts include an allowed document catalog and the minimal `[[cite:s<offset>]]` convention. The main process resolves only known IDs from the current document and replaces supplied metadata with canonical titles, offsets and page numbers. Unknown or cross-document references do not become clickable sources. Reader navigation is an in-app event guarded by document ID and source bounds.

The `present` tool is exposed only to the Anthropic/OpenAI API adapters when the Generative tables setting is enabled. The schema permits a title, up to 8 text columns, 30 rows and 1000 characters per cell; row widths must match. There are no actions, arbitrary HTML, remote fetches or CLI tool execution. Validated results render with the vendor generative Table vocabulary bound to its installed DataTable (cards at narrow widths). The response is persisted without a second tool-result inference request. Unknown, malformed or disabled calls remain inert ToolFallback output. Request schemas and fragmented tool JSON have tests; authenticated live API inference was not sent.

The installed generative vocabulary requires Zod 4 while app IPC remains Zod 3.24.2. The narrowly scoped `.pnpmfile.cjs` hook pins Zod 4.6.7 inside `@assistant-ui/generative-ui@0.0.8`. The documented Zod `jitless` configuration is set before lazy loading the presentation chunk so Electron's CSP does not require unsafe-eval. Generated vendor vocabulary styles are installed as source and mapped to the existing neutral palette. The presentation chunk is loaded only for an accepted presentation; the initial renderer does not load it.

BranchPicker is deliberately not enabled: `messages` has no parent/sibling/head columns, ChatService replays a selected earlier turn by excluding later parts from prompt context, and LocalRuntime starts from a linear `initialMessages` list. Enabling its buttons alone would lose alternate responses after restart or send the wrong context. A proper migration must add a durable message parent graph and selected head per conversation, restore the runtime repository tree, and build prompts from that branch. Superseded complete answers now carry `contextExcluded` rather than a false `aborted` status; actual Stop is immediately labelled and stays labelled after restart. All answers remain stored, but durable sibling switching is unimplemented.

## Verification and visual evidence

Expanded verification: `pnpm typecheck`, `pnpm lint`, `pnpm test` (32 files, 172 passed, 4 opt-in skips), and `pnpm build` pass. Electron scripts cover controls, selections/budget confirmation, Markdown, real PDF/DOCX/XLSX conversion, composer visual states, and enriched Elements. All six automatic Electron scripts pass: `chat-controls.mjs`, `selection-chat.mjs`, `visual-regressions.mjs`, `conversion.mjs`, `composer-visual-qa.mjs`, and `assistant-elements.mjs`. Retry and the enriched Element flows assert zero console errors. All 41 matrix captures and 23 additional control/Markdown/selection/PDF captures were opened and inspected; paths and SHA-256 hashes are recorded in [screenshot manifest](evidence/composer-screenshots.json).

Evidence logs use `/tmp/vstudy-aui-expanded-{typecheck,lint,test,build,controls,selection,visual,conversion}.log`, `/tmp/vstudy-aui-qa.log`, and `/tmp/vstudy-aui-elements.log`. The visual matrix is generated by `apps/desktop/e2e/composer-visual-qa.mjs` into `/tmp/vstudy-composer-redesign/`: 1200×800, 900×700 and minimum 720×480; light/dark; idle, search, effort/Fast, long-name truncation and streaming; plus Claude/Codex/Antigravity catalog captures. `assistant-elements.mjs` captures reported reasoning, grounded citations, a generative table, restored threads and an immediately stopped partial answer. Long names are a labelled DOM typography stress case; catalog discovery uses actual local providers, and all inference uses the fake provider.

The complaint screenshot is preserved at `/Users/vc/.t3/userdata/attachments/a56d2e42-6477-4555-b6c8-247c8912b20e-e8d71063-8125-4b9f-b918-df6fa6e8ec47.png`.

`pnpm smoke` passes with sandbox/context isolation enabled and Node integration disabled. The full PDF-reader check passed using `node e2e/pdf-reader.mjs /Users/vc/.t3/userdata/attachments/a56d2e42-6477-4555-b6c8-247c8912b20e-c1f195bc-9191-4996-b928-4e44cb5b28ec-pdf.pdf /tmp/vstudy-pdf-evidence`; pages 3, 5 and 10 were opened and inspected. The source was found among the original attachments by verifying its R12/R23/Total average delay anchors. Logs are `/tmp/vstudy-aui-expanded-{smoke,pdf}.log`. No paid/authenticated model inference was sent. A complete screen-reader audit, OS increased-contrast/zoom testing, speech playback, and provider-side acceptance of every effort/tier combination remain unverified. Craft review was performed directly by the implementation sub-agent; no additional reviewer agent was spawned.

## Complete Element catalog audit

Checked the official [component catalog](https://www.assistant-ui.com/components/assistant-ui), [llms.txt](https://www.assistant-ui.com/llms.txt) and [registry index](https://r.assistant-ui.com/registry.json) on 2026-11-03: **128 Element pages**, **174 registry items**, and **35 generative vocabulary components**. The registry also contains runtime bindings, styles and utilities, so those counts intentionally differ. Every Element page is considered below; the full registry inventory and source paths are preserved in `docs/evidence/assistant-ui-elements.json`. No Next.js app was scaffolded.

| Element | Decision | Evidence / reason |
| --- | --- | --- |
| [Activity graph](https://www.assistant-ui.com/elements/activity-graph.md) | Skipped | Usage analytics already have a source-backed custom dashboard, explicitly retained. |
| [Agent card](https://www.assistant-ui.com/elements/agent-card.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Handoff](https://www.assistant-ui.com/elements/agent-handoff.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Agent plan](https://www.assistant-ui.com/elements/agent-plan.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Agent status](https://www.assistant-ui.com/elements/agent-status.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Approval card](https://www.assistant-ui.com/elements/approval-card.md) | Skipped | The single API table tool is read-only; no consequential action or approval contract exists. |
| [Artifact card](https://www.assistant-ui.com/elements/artifact-card.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Assistant modal](https://www.assistant-ui.com/elements/assistant-modal.md) | Skipped | Existing split-pane document chat is the approved entry point. |
| [Assistant sidebar](https://www.assistant-ui.com/elements/assistant-sidebar.md) | Skipped | Existing resizable document/chat panels are the approved layout. |
| [Attachment](https://www.assistant-ui.com/elements/attachment.md) | Skipped | Installed dependency, capability disabled: document import and offset selections are not arbitrary provider file uploads. |
| [Background runs](https://www.assistant-ui.com/elements/background-inbox.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Canvas](https://www.assistant-ui.com/elements/canvas-split.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Chart](https://www.assistant-ui.com/elements/chart.md) | Skipped | The presentation tool deliberately admits text tables only; no unrestricted numeric charts. |
| [Chat panel](https://www.assistant-ui.com/elements/chat-panel.md) | Skipped | Full Thread is already adopted; this demonstration shell would duplicate it. |
| [Checkpoints](https://www.assistant-ui.com/elements/checkpoint-history.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Code diff](https://www.assistant-ui.com/elements/code-diff.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Code runner](https://www.assistant-ui.com/elements/code-runner.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Command palette](https://www.assistant-ui.com/elements/command-palette.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Comparison](https://www.assistant-ui.com/elements/comparison-card.md) | Skipped | Comparisons are covered by the bounded vendor Table presentation. |
| [Attachments](https://www.assistant-ui.com/elements/composer-attachments.md) | Skipped | Installed dependency; selection chip remains the explicitly retained document-specific control. |
| [Context](https://www.assistant-ui.com/elements/composer-context.md) | Skipped | No reliable per-model context-window limit metadata; existing usage UI is explicitly retained. |
| [Mentions](https://www.assistant-ui.com/elements/composer-mentions.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Models](https://www.assistant-ui.com/elements/composer-model-picker.md) | Customized | The registry ModelSelector supplies this rail; no second picker. |
| [Slash commands](https://www.assistant-ui.com/elements/composer-slash-commands.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Composer trigger popover](https://www.assistant-ui.com/elements/composer-trigger-popover.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Dictation](https://www.assistant-ui.com/elements/composer-voice.md) | Skipped | No microphone, realtime call or multi-speaker adapter. Conditional read-aloud is available without recording permissions. |
| [Composer](https://www.assistant-ui.com/elements/composer.md) | Customized | Registry Composer and Send/Stop action slot; document selection, budget, model and usage slots. |
| [Computer use](https://www.assistant-ui.com/elements/computer-use.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Confidence](https://www.assistant-ui.com/elements/confidence-marker.md) | Skipped | No calibrated claim confidence/provenance scores are reported; do not invent them. |
| [Connection state](https://www.assistant-ui.com/elements/connection-state.md) | Skipped | Local IPC has no resumable remote stream protocol; a reconnect control would overstate support. |
| [Context breakdown](https://www.assistant-ui.com/elements/context-breakdown.md) | Skipped | Providers do not report a full prompt/tools/history token breakdown. |
| [Context display](https://www.assistant-ui.com/elements/context-display.md) | Skipped | No reliable context capacity metadata; do not fabricate a capacity ring. |
| [Search in conversation](https://www.assistant-ui.com/elements/conversation-search.md) | Skipped | The catalog surface needs full-text search results and highlight/navigation state; the current adapter provides title search only. |
| [Cost meter](https://www.assistant-ui.com/elements/cost-meter.md) | Skipped | Application usage ledger/budget UI is an explicit retained exception; avoid duplicate cost controls. |
| [Data table](https://www.assistant-ui.com/elements/data-table.md) | Customized | Source-installed DataTable renders the allowed generative Table vocabulary entry. |
| [Timestamps](https://www.assistant-ui.com/elements/day-separator.md) | Skipped | Conversation history is currently compact per document; no chronology UI is required for the approved surface. |
| [Diagram](https://www.assistant-ui.com/elements/diagram.md) | Skipped | No diagram response part is emitted; arbitrary graphics are outside the bounded presentation contract. |
| [Directive text](https://www.assistant-ui.com/elements/directive-text.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Document reference](https://www.assistant-ui.com/elements/document-reference.md) | Customized | Vendor controlled DocumentReference for real PDF page anchors; omitted without known page count. |
| [Draft restore](https://www.assistant-ui.com/elements/draft-restore.md) | Customized | Existing composer runtime and document draft preservation retained; no separate restore prompt. |
| [Edit a sent message](https://www.assistant-ui.com/elements/edit-message.md) | Customized | Vendor EditComposer preserves Save & resend and IME-safe entry. |
| [Elicitation form](https://www.assistant-ui.com/elements/elicitation-form.md) | Skipped | No MCP elicitation adapter; no connector tools are enabled. |
| [Empty state](https://www.assistant-ui.com/elements/empty-state.md) | Customized | Vendor welcome with document-specific vendor Suggestions. |
| [Error state](https://www.assistant-ui.com/elements/error-state.md) | Customized | Vendor MessageError with Retry, terminal status rather than rejected reload promises. |
| [Feedback dialog](https://www.assistant-ui.com/elements/feedback-dialog.md) | Skipped | No durable feedback repository or provider feedback adapter; do not offer a fake submission. |
| [File tree](https://www.assistant-ui.com/elements/file-tree.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [File](https://www.assistant-ui.com/elements/file.md) | Skipped | Installed vendor renderer retained for future file parts; no adapter emits file parts today. |
| [Flow graph](https://www.assistant-ui.com/elements/flow-graph.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Follow-up suggestions](https://www.assistant-ui.com/elements/follow-up-suggestions.md) | Adopted verbatim | Installed ThreadFollowupSuggestions consumes a local document suggestion adapter without extra inference. |
| [Generative UI](https://www.assistant-ui.com/elements/generative-ui.md) | Customized | Source-installed vocabulary, lazy-loaded; only Table is enabled via a bounded, API-only present tool. |
| [Geo map](https://www.assistant-ui.com/elements/geo-map.md) | Skipped | Installed vocabulary dependency, dormant. No map/network capability is exposed by present. |
| [Guardrail notice](https://www.assistant-ui.com/elements/guardrail-notice.md) | Skipped | No distinct refusal event/category is reported; existing provider error and grounded-answer disclaimer remain accurate. |
| [Heat graph](https://www.assistant-ui.com/elements/heat-graph.md) | Skipped | No new run-activity dashboard scope; retained usage charts already answer spending questions. |
| [Image gallery](https://www.assistant-ui.com/elements/image-gallery.md) | Skipped | No image-generation or multimodal attachment response contract. |
| [Image generation](https://www.assistant-ui.com/elements/image-generation.md) | Skipped | No image-generation adapter; do not advertise an unavailable operation. |
| [Image](https://www.assistant-ui.com/elements/image.md) | Skipped | Installed vendor renderer retained for future image parts; no adapter emits image parts today. |
| [Inline citation](https://www.assistant-ui.com/elements/inline-citation.md) | Customized | Vendor Citation markers bound to validated document IDs and reader navigation. |
| [Job progress](https://www.assistant-ui.com/elements/job-progress.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Launcher](https://www.assistant-ui.com/elements/launcher-bubble.md) | Skipped | No corresponding persistent agent/artifact/command resource exists in this document reader; installing a control alone would imply unsupported behavior. |
| [Link preview](https://www.assistant-ui.com/elements/link-preview.md) | Skipped | No metadata fetcher; external links retain the allowlisted shell-open path. |
| [Loader](https://www.assistant-ui.com/elements/loading-state.md) | Skipped | Thread already supplies history Skeletons and ThinkingIndicator; no competing loader. |
| [Model logos](https://www.assistant-ui.com/elements/logos.md) | Adopted verbatim | Installed Claude/OpenAI/Gemini SVG model logos in the trigger. |
| [Map](https://www.assistant-ui.com/elements/map-answer.md) | Skipped | No geolocation/search adapter or spatial answer contract. |
| [Markdown text](https://www.assistant-ui.com/elements/markdown-text.md) | Customized | Vendor MarkdownText with existing sanitize/math/highlight and URL hooks. |
| [Math](https://www.assistant-ui.com/elements/math-block.md) | Customized | Existing KaTeX is supplied through vendor MarkdownText hooks; no duplicate math renderer. |
| [MCP config dialog](https://www.assistant-ui.com/elements/mcp-config.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Server panel](https://www.assistant-ui.com/elements/mcp-server-panel.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Media player](https://www.assistant-ui.com/elements/media-player.md) | Skipped | Installed dependency retained, dormant without audio/video file parts. |
| [Memory](https://www.assistant-ui.com/elements/memory-chips.md) | Skipped | No memory store or memory-editing tool. |
| [Mermaid diagram](https://www.assistant-ui.com/elements/mermaid-diagram.md) | Skipped | Installed vocabulary dependency, dormant. The read-only tool admits Table only. |
| [Message actions](https://www.assistant-ui.com/elements/message-actions.md) | Customized | Vendor copy/edit/regenerate plus conditional WebSpeech read-aloud actions. |
| [Message branches](https://www.assistant-ui.com/elements/message-branches.md) | Skipped | Deferred: messages has no parent/head graph; ChatService replay excludes later answers and the renderer seeds a linear initialMessages list. A proper migration must persist sibling/parent/head IDs, restore repository trees, and select branch-specific prompt context before enabling BranchPicker. |
| [Message pair](https://www.assistant-ui.com/elements/message-pair.md) | Customized | Vendor UserMessage/AssistantMessage; document selection and usage slots. |
| [Message queue](https://www.assistant-ui.com/elements/message-queue.md) | Skipped | The current main contract permits one active request per conversation; queued drafts require explicit product semantics. |
| [Message timing](https://www.assistant-ui.com/elements/message-timing.md) | Skipped | No stable first-token/throughput timing persisted by adapters; do not infer performance claims. |
| [Mobile composer](https://www.assistant-ui.com/elements/mobile-composer.md) | Skipped | Desktop Electron minimum is 720x480; existing keyboard composer adapts to narrow panes. |
| [Model selector](https://www.assistant-ui.com/elements/model-selector.md) | Customized | Registry ModelSelector/Command over IPC with capabilities, favorites/recency and safe pane bounds. |
| [Number ticker](https://www.assistant-ui.com/elements/number-ticker.md) | Skipped | Usage updates use plain accessible text; animated numeric decoration is unnecessary. |
| [Onboarding](https://www.assistant-ui.com/elements/onboarding.md) | Skipped | The existing import-first flow is retained; no additional setup wizard is needed. |
| [Option list](https://www.assistant-ui.com/elements/option-list.md) | Skipped | No human-in-the-loop tool continuation protocol; read-only present only. |
| [Orb](https://www.assistant-ui.com/elements/orb.md) | Skipped | No microphone, realtime call or multi-speaker adapter. Conditional read-aloud is available without recording permissions. |
| [Permission grant](https://www.assistant-ui.com/elements/permission-grant.md) | Skipped | No tool requires capability grants; CLI tools stay disabled and API present performs no side effects. |
| [Prompt library](https://www.assistant-ui.com/elements/prompt-library.md) | Skipped | No saved prompt repository; document suggestions are adopted without inventing saved data. |
| [Question flow](https://www.assistant-ui.com/elements/question-flow.md) | Skipped | No multi-step elicitation protocol; ordinary text follow-up remains available. |
| [Quota banner](https://www.assistant-ui.com/elements/quota-banner.md) | Skipped | No account balance/quota endpoint; the retained budget banner states user budgets only. |
| [Quote](https://www.assistant-ui.com/elements/quote.md) | Skipped | Document selections retain validated source offsets; quoting assistant prose would need a separate quoted-message context contract. |
| [Read aloud](https://www.assistant-ui.com/elements/read-aloud.md) | Customized | Read aloud/Stop reading primitives in the vendor action bar; no autoplay or microphone. |
| [Reasoning effort](https://www.assistant-ui.com/elements/reasoning-effort.md) | Customized | Supported efforts and speed share the ModelSelector Content; no speculative capabilities. |
| [Reasoning](https://www.assistant-ui.com/elements/reasoning.md) | Adopted verbatim | Installed Reasoning/ReasoningGroup renders reported provider summaries only. |
| [Recommendation card](https://www.assistant-ui.com/elements/recommendation-card.md) | Skipped | No accept/apply mutation contract; recommendations remain normal text. |
| [Regenerate with](https://www.assistant-ui.com/elements/regenerate-menu.md) | Skipped | Current regeneration preserves the original model/options/selection; cross-model sibling persistence is not implemented. |
| [Research report](https://www.assistant-ui.com/elements/research-report.md) | Skipped | No report-specific response schema; validated citations and tables are implemented instead. |
| [Retrieval chunks](https://www.assistant-ui.com/elements/retrieval-chunks.md) | Skipped | Current grounding uses document excerpts/selections rather than scored retrieval chunks. |
| [Reviewable diff](https://www.assistant-ui.com/elements/reviewable-diff.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Run activity](https://www.assistant-ui.com/elements/run-activity.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Schedule](https://www.assistant-ui.com/elements/schedule-card.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Score breakdown](https://www.assistant-ui.com/elements/score-breakdown.md) | Skipped | No matching response/resource contract exists in the current document reader; the full Thread, citations and bounded table tool cover the supported workflow. |
| [Scroll anchor](https://www.assistant-ui.com/elements/scroll-anchor.md) | Adopted verbatim | The installed ThreadScrollToBottom and viewport own scroll anchoring. |
| [Settings](https://www.assistant-ui.com/elements/settings-panel.md) | Skipped | Provider security and usage settings already exist and remain authoritative. |
| [Shared conversation](https://www.assistant-ui.com/elements/shared-conversation.md) | Skipped | No publishing, cloud or shared transcript route. |
| [Shiki highlighter](https://www.assistant-ui.com/elements/shiki-highlighter.md) | Skipped | Avoid a second highlighter; the retained sanitize/highlight pipeline is wired to vendor MarkdownText. |
| [Sources](https://www.assistant-ui.com/elements/sources.md) | Customized | Vendor document source chips, fed only main-validated document references. |
| [Speaker identity](https://www.assistant-ui.com/elements/speaker-identity.md) | Skipped | No microphone, realtime call or multi-speaker adapter. Conditional read-aloud is available without recording permissions. |
| [Spec sheet](https://www.assistant-ui.com/elements/spec-sheet.md) | Skipped | Tables cover the current structured-answer slice; no additional model schema is admitted. |
| [Stopped run](https://www.assistant-ui.com/elements/stopped-run.md) | Customized | Actual cancellation status, immediate Stopped note, recorded usage, and restart persistence. |
| [Streaming text](https://www.assistant-ui.com/elements/streaming-text.md) | Skipped | The existing streaming text behavior is retained; extra token coloring/reveal motion is disabled. |
| [Subagent list](https://www.assistant-ui.com/elements/subagent-list.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Syntax highlighter](https://www.assistant-ui.com/elements/syntax-highlighter.md) | Customized | Existing rehype-highlight is supplied through vendor MarkdownText; no second Markdown pipeline. |
| [Task card](https://www.assistant-ui.com/elements/task-card.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Terminal block](https://www.assistant-ui.com/elements/terminal-block.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Thinking indicator](https://www.assistant-ui.com/elements/thinking-indicator.md) | Customized | Vendor ThinkingIndicator uses actual runtime status; neutral palette token. |
| [Thread list sidebar](https://www.assistant-ui.com/elements/thread-list-sidebar.md) | Skipped | ThreadList is adopted in the header popover; another sidebar would displace the document at 720px. |
| [Thread list](https://www.assistant-ui.com/elements/thread-list.md) | Customized | Vendor ThreadList over ExternalStoreThreadListAdapter, in a pane-bounded header popover. |
| [Thread search](https://www.assistant-ui.com/elements/thread-search.md) | Skipped | Conversation title search is already part of the installed ThreadList. |
| [Thread](https://www.assistant-ui.com/elements/thread.md) | Customized | Styled Thread, viewport, scroll return and message composition; document slots and linear-history scope. |
| [Timeline](https://www.assistant-ui.com/elements/timeline.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Todo list](https://www.assistant-ui.com/elements/todo-list.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Tool call](https://www.assistant-ui.com/elements/tool-call.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Tool failure](https://www.assistant-ui.com/elements/tool-error.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Tool fallback](https://www.assistant-ui.com/elements/tool-fallback.md) | Adopted verbatim | Installed ToolFallback renders unknown/disabled calls inertly; no execution. |
| [Tool group](https://www.assistant-ui.com/elements/tool-group.md) | Adopted verbatim | Installed ToolGroup groups non-presentation calls; present is a standalone artifact. |
| [Tool timeline](https://www.assistant-ui.com/elements/tool-timeline.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Tooltip icon button](https://www.assistant-ui.com/elements/tooltip-icon-button.md) | Adopted verbatim | Installed accessible tooltip icon buttons throughout vendor action bars. |
| [Trace waterfall](https://www.assistant-ui.com/elements/trace-waterfall.md) | Skipped | No corresponding action/run/tool protocol is enabled. CLI tools remain disabled; the API slice is read-only table presentation, with generic calls rendered by ToolFallback. |
| [Typing indicator](https://www.assistant-ui.com/elements/typing-indicator.md) | Skipped | ThinkingIndicator and the vendor streamed indicator already expose actual running state. |
| [Voice conversation](https://www.assistant-ui.com/elements/voice-conversation.md) | Skipped | No microphone, realtime call or multi-speaker adapter. Conditional read-aloud is available without recording permissions. |
| [Web preview](https://www.assistant-ui.com/elements/web-preview.md) | Skipped | No sandboxed generated web-content tool is exposed. |
| [Web search](https://www.assistant-ui.com/elements/web-search.md) | Skipped | No search tool, provider citations-to-web route, or browsing capability is enabled. |

Generative vocabulary: `Header`, `Text`, `Caption`, `Image`, `Divider`, `Diagram`, `Map`, `Fact`, `Button`, `Select`, `Input`, `DatePicker`, `Checkbox`, `Slider`, `RadioGroup`, `CheckboxGroup`, `Form`, `Card`, `Col`, `Row`, `Spacer`, `Badge`, `Box`, `Tabs`, `ListView`, `ListViewItem`, `Steps`, `Timeline`, `Table`, `Markdown`, `Chart`, `Citation`, `Alert`, `Carousel`, `Icon`. Only `Table` is enabled. Other entries remain installed vendor vocabulary, with no tool schema or action registry exposing them. The table entry binds to the installed DataTable; its column/cell adapter does not implement a table UI. Public className utilities keep the vendor narrow card details in one column and allow long values to wrap without changing its source structure.

## UI2 reset — 2026-11-04 (supersedes customization table above)

The user's screenshot rejected the crowded Home hierarchy, active navigation stripe, custom picker panels and pointer-focus border. The renderer now composes the registry ModelSelector directly, with shadcn Select and Toggle adjacent. Favorites/recents and the custom punctuation-independent search were removed because they are not vendor features. IPC catalog deduplication, availability and persisted raw-model aliases remain in `model-catalog.ts`; provider calls remain unchanged.

Exact overwrite command, run at the repository root (installation log: `/tmp/vstudy-ui2/vendor-install.log`):

```sh
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npx --yes shadcn@4.23.0 add https://r.assistant-ui.com/thread.json https://r.assistant-ui.com/thread-list.json https://r.assistant-ui.com/model-selector.json https://r.assistant-ui.com/sources.json https://r.assistant-ui.com/elements-document-reference.json https://r.assistant-ui.com/elements-inline-citation.json https://r.assistant-ui.com/elements-thinking-indicator.json https://r.assistant-ui.com/logos.json https://r.assistant-ui.com/elements-suggestions.json card sidebar select toggle-group switch checkbox scroll-area separator dropdown-menu context-menu alert-dialog tabs progress --yes --overwrite -c apps/desktop
pnpm install --lockfile-only --ignore-scripts
pnpm vendor:check
```

The CLI installed transitive composer, action bars, attachments, follow-up suggestions, reasoning, Markdown, tool fallback/group and utilities through Thread. BranchPicker is included upstream; its UI stays omitted because the application's persistence remains linear. Shadcn uses `https://ui.shadcn.com/r/styles/new-york/`; assistant-ui uses the explicit URLs above and their registry dependencies. CLI version is **4.23.0**; source registries have no package version, so source SHA-256 hashes are authoritative. Runtime pins: `@assistant-ui/react` **0.15.32**, `@assistant-ui/react-markdown` **0.14.24**, `radix-ui` **1.8.1**, `tw-shimmer` **0.4.14**, React **19.2.0**, Tailwind **4.1.18**. The CLI's unrelated `cn` package dependency was removed; its imports resolve to the existing utility through a listed patch.

Before overwriting, existing files were copied to `/tmp/vstudy-ui2/vendor-before/`; installed pristine sources are in `/tmp/vstudy-ui2/vendor-pristine/`. Their diffs informed the retained behavior. The registry reset restored the full upstream tool fallback, including code that earlier edits had removed. App policy lives in `document-markdown.tsx` (sanitization/math/highlighting/URL policy/citations), `chat-accessibility.tsx` (completion announcements and grounded copying), `chat.tsx` (selection/budget/usage/IME), and `model-controls.tsx`. The vendor Thread needs optional slots for these because its upstream API exposes only ComposerExtra and whole-message overrides; the slots preserve the vendor composer and message structure. Safe Markdown uses a small pass-through prop extension instead of copying vendor typography.

[Vendor patches](VENDOR_PATCHES.md) lists every allowed source difference and links its exact baseline-to-local diff. [Manifest](evidence/ui2-vendor-manifest.json) pins both pristine and reviewed hashes. `vendor:check` checks the inventory and each exact patched result; a listed file is not exempt from drift detection. The check is offline and compares this installation snapshot, not mutable future registry content. Existing optional DataTable/generative sources retain their prior provenance; they were not requested again by this reset.

The shadcn theme is a mapping onto existing tokens; vendor styling is retained. Sidebar, settings tabs/dialogs, library dialogs/menus, common selects, buttons, inputs, checkboxes and Welcome/onboarding controls now use shadcn components. Tree virtualization, roving focus and app routing remain adapters. Pointer-versus-keyboard modality is tracked outside vendor source, since textareas match `:focus-visible` even after pointer clicks in Chromium.

Current verification and remaining limits are recorded in [UI2 design review](design-reviews/ui2.md), rather than inheriting historical pass counts above.
