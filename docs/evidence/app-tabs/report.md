# Stage 1 app tabs

The goal is Safari-style tabs in VStudy Pro so users can keep courses, homework and documents open, switch without losing place, and avoid retaining background view trees. This stage implements in-app tabs. Native Moodle and hosted-chat lifecycle changes remain for later stages.

## Data and implementation

`shared/app-tabs.ts` defines a strict, versioned `TabSet { version: 1, activeId, tabs }`, bounded to 30 UUID-identified tabs. Each tab owns a bounded `RouteHistory`, title, bundled icon, last-active timestamp and lightweight app/document presentation. Its current route is derived only from `history.entries[history.index]`.

`renderer/shell/tab-state.ts` owns deterministic actions, neighbor selection on close, validated persistence under `vstudy-tabs-v1`, one-time legacy migration and corruption fallback. Its tests cover independent history, close selection, bounds, reorder validation, presentation and storage failure. Shared tests cover strictness and invalid identities/history/presentation.

`renderer/shell/index.tsx` projects the active tab through the existing navigation API, captures shell scroll before switching and restores it on return. Welcome and transient action flags stay outside persisted tabs. Async navigation closures retain their originating tab ID. `navigation-history.ts` is unchanged.

`renderer/app.tsx` mounts one view keyed by tab ID. `tab-strip.tsx` and its CSS implement scrolling tabs, new-tab picker with recent Library documents and a searchable All tabs picker, mouse/keyboard close and reorder, shortcuts, tab roles and reduced motion. Sidebar, document and course link sites can open tabs. Flat English, Traditional Chinese and Japanese catalogs were generated into the locale registry. Navigation documentation and Electron fixtures were updated.

## Scope and deviations

- Presentation restoration covers `#shell-content.scrollTop`. Reader internals and chat drafts remain for Stage 3.
- Native routes, native loading/discard indicators and guest-key forwarding remain for Stage 2. Main-process, Moodle webview and web-chat source files are unchanged.
- Workspace hides its header. With one tab, the new-tab button occupies a small row above Workspace so it remains reachable. With multiple tabs, the strip stays above the hidden header.
- Verification exposed an existing Japanese Library toolbar overflow at 720 px. It remained after removing the strip and panel wrapper in a diagnostic run. One container rule now wraps the toolbar at that width.
- Existing Electron scripts assumed the old route key and file-list default. Their fixtures now explicitly migrate legacy routes and select file-list mode. Accessibility reloads are paced to respect IPC rate limits.

Model the Domain shaped the implementation: the tab set and pure reducer replace parallel route/history state. Deslop cleanup removed redundant whitespace and kept the change within the existing shell patterns.

## Evidence

`verification.txt` records command output. `results.json` records the dedicated tab checks. Screenshots show Workspace tabs, reordered tabs and restoration after a real Electron restart. These runs use isolated scratch profiles and only one Electron process at a time.

Verification ran on macOS. Windows/Linux keyboard behavior and physical trackpad input were not exercised. No push or PR was created.

All requested commands passed. Vitest ran 118 files and 756 tests. Accessibility completed 144 audits with no violations or overflow failures, followed by its keyboard and chat checks. The dedicated app-tabs script passed against the final build. The build emitted the existing large-chunk advisory.
