# Vendor patches

shadcn 4.23.0, retrieved 2026-11-04. The [manifest](evidence/ui2-vendor-manifest.json) pins pristine and patched SHA-256 hashes. `pnpm vendor:check` rejects added, missing and altered sources, including changes to an approved patch. Registry snapshots are mutable upstream; this check validates the recorded installation offline.

Import and translation changes are portable. Optional Thread composition slots and Markdown pass-through props can be offered upstream. Capability omissions and Electron URL policy need application-specific review during upgrades. No blanket directory exemptions.

- `apps/desktop/src/renderer/components/assistant-ui/elements/attachment-state.ts` — Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--attachment-state.ts.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/attachment.aui.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--attachment.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/document-reference.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--document-reference.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/file.tsx` — Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--file.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/follow-up-suggestions.aui.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--follow-up-suggestions.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/image.tsx` — Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--image.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/inline-citation.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--inline-citation.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/markdown-text.tsx` — Expose Markdown primitive pass-through props for the app sanitizer adapter; translate code-copy label. [Exact diff](vendor-patches/assistant-ui--elements--markdown-text.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/media-player.tsx` — Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--media-player.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/model-selector.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--model-selector.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/reasoning.aui.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--reasoning.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/reasoning.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--reasoning.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/thread-list.aui.tsx` — Translate labels; expose application-supported list actions without unsupported archive/rename actions. [Exact diff](vendor-patches/assistant-ui--elements--thread-list.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/thread.aui.tsx` — Add composition slots for app-owned document selection, usage/budget guard, IME input, safe Markdown, citations, clipboard and announcements; translate labels; omit unsupported durable branch switching. Styling stays upstream. [Exact diff](vendor-patches/assistant-ui--elements--thread.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/tool-fallback.aui.tsx` — Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--tool-fallback.aui.tsx.patch).
- `apps/desktop/src/renderer/components/ui/alert-dialog.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--alert-dialog.tsx.patch).
- `apps/desktop/src/renderer/components/ui/avatar.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--avatar.tsx.patch).
- `apps/desktop/src/renderer/components/ui/button.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--button.tsx.patch).
- `apps/desktop/src/renderer/components/ui/card.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--card.tsx.patch).
- `apps/desktop/src/renderer/components/ui/checkbox.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--checkbox.tsx.patch).
- `apps/desktop/src/renderer/components/ui/command.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--command.tsx.patch).
- `apps/desktop/src/renderer/components/ui/context-menu.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--context-menu.tsx.patch).
- `apps/desktop/src/renderer/components/ui/dialog.tsx` — Resolve the registry cn helper to the existing local utility. Translate accessible labels. [Exact diff](vendor-patches/ui--dialog.tsx.patch).
- `apps/desktop/src/renderer/components/ui/dropdown-menu.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--dropdown-menu.tsx.patch).
- `apps/desktop/src/renderer/components/ui/input.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--input.tsx.patch).
- `apps/desktop/src/renderer/components/ui/popover.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--popover.tsx.patch).
- `apps/desktop/src/renderer/components/ui/progress.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--progress.tsx.patch).
- `apps/desktop/src/renderer/components/ui/scroll-area.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--scroll-area.tsx.patch).
- `apps/desktop/src/renderer/components/ui/select.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--select.tsx.patch).
- `apps/desktop/src/renderer/components/ui/separator.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--separator.tsx.patch).
- `apps/desktop/src/renderer/components/ui/sheet.tsx` — Resolve the registry cn helper to the existing local utility. Translate accessible labels. [Exact diff](vendor-patches/ui--sheet.tsx.patch).
- `apps/desktop/src/renderer/components/ui/sidebar.tsx` — Resolve the registry cn helper to the existing local utility. Translate accessible labels. [Exact diff](vendor-patches/ui--sidebar.tsx.patch).
- `apps/desktop/src/renderer/components/ui/skeleton.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--skeleton.tsx.patch).
- `apps/desktop/src/renderer/components/ui/switch.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--switch.tsx.patch).
- `apps/desktop/src/renderer/components/ui/tabs.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--tabs.tsx.patch).
- `apps/desktop/src/renderer/components/ui/textarea.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--textarea.tsx.patch).
- `apps/desktop/src/renderer/components/ui/toggle-group.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--toggle-group.tsx.patch).
- `apps/desktop/src/renderer/components/ui/toggle.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--toggle.tsx.patch).
- `apps/desktop/src/renderer/components/ui/tooltip.tsx` — Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--tooltip.tsx.patch).

- `apps/desktop/src/renderer/hooks/use-attachment-src.ts` — remove the unsupported upstream ESLint suppression. [Exact diff](vendor-patches/use-attachment-src.ts.patch).

- `apps/desktop/src/renderer/components/assistant-ui/elements/data-table.tsx` — retain localized labels and value formatting from the prior optional installation. Its original registry hash was verified against the pristine setup checkout. [Exact diff](vendor-patches/assistant-ui--elements--data-table.tsx.patch).
