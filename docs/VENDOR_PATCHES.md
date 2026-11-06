# Vendor patches

The [manifest](evidence/ui2-vendor-manifest.json) pins shadcn 4.23.0 registry sources retrieved on 2026-11-04. `pnpm vendor:check` rejects added, missing, and altered files in both component directories. Registry hashes describe pristine sources. Patched hashes describe the installed application version. Application-authored tests have separate hashes and no invented upstream provenance.

The 2026-11-06 reconciliation recovered the previously recorded versions from Git, reversed each recorded patch, and verified the pristine SHA-256 before regenerating the patch. Theme changes retain interaction and security policy. Review patches again when upgrading upstream components.

- `apps/desktop/src/renderer/components/assistant-ui/elements/attachment-state.ts`. Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--attachment-state.ts.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/attachment.aui.tsx`. Use semantic theme colors for attachment controls while preserving localized labels and attachment policy. [Exact diff](vendor-patches/assistant-ui--elements--attachment.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/data-table.tsx`. Retain localized table labels and locale-aware value formatting from the earlier optional DataTable installation; baseline verified against its original registry manifest and pristine checkout. [Exact diff](vendor-patches/assistant-ui--elements--data-table.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/document-reference.tsx`. Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--document-reference.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/file.tsx`. Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--file.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/follow-up-suggestions.aui.tsx`. Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--follow-up-suggestions.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/image.tsx`. Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--image.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/inline-citation.tsx`. Retain localized labels and publication dates; add a localized first-citation hint with persisted dismissal on preview open or click, synchronized across mounted citations. [Exact diff](vendor-patches/assistant-ui--elements--inline-citation.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/markdown-text.tsx`. Expose Markdown primitive pass-through props for the app sanitizer adapter; translate code-copy label. [Exact diff](vendor-patches/assistant-ui--elements--markdown-text.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/media-player.tsx`. Preserve reviewed URL/blob allowlist and inert media policy; translate labels. [Exact diff](vendor-patches/assistant-ui--elements--media-player.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/model-selector.tsx`. Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--model-selector.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/reasoning.aui.tsx`. Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--reasoning.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/reasoning.tsx`. Use tonal reasoning rows and semantic theme colors while preserving translated state labels. [Exact diff](vendor-patches/assistant-ui--elements--reasoning.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/sources.aui.tsx`. Use tonal source cards and semantic theme colors without changing source actions. [Exact diff](vendor-patches/assistant-ui--elements--sources.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/suggestions.tsx`. Wrap suggestion labels for long translations and use semantic theme colors. [Exact diff](vendor-patches/assistant-ui--elements--suggestions.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/thread-list.aui.tsx`. Translate labels; expose application-supported list actions without unsupported archive/rename actions. [Exact diff](vendor-patches/assistant-ui--elements--thread-list.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/thread.aui.tsx`. Retain localized composition slots, validated presentation grouping, app-owned chat controls, and message IDs for history navigation. Dock the assistant-ui ViewportFooter as a sibling of the scrolling viewport so it reserves space for the composer. Add an optional ThreadNotice slot inside the thread for provider setup. Apply semantic theme colors. [Exact diff](vendor-patches/assistant-ui--elements--thread.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/tool-fallback.aui.tsx`. Translate vendor labels through the existing locale catalogs; no change to vendor interaction or layout. [Exact diff](vendor-patches/assistant-ui--elements--tool-fallback.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/elements/tool-group.aui.tsx`. Use tonal tool groups and semantic theme colors while retaining existing interactions. [Exact diff](vendor-patches/assistant-ui--elements--tool-group.aui.tsx.patch).
- `apps/desktop/src/renderer/components/assistant-ui/generative-ui.css`. Apply semantic theme tokens and tonal styling to optional generated presentation elements. [Exact diff](vendor-patches/assistant-ui--generative-ui.css.patch).
- `apps/desktop/src/renderer/components/ui/avatar.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--avatar.tsx.patch).
- `apps/desktop/src/renderer/components/ui/badge.tsx`. Use semantic theme colors for badge states. [Exact diff](vendor-patches/ui--badge.tsx.patch).
- `apps/desktop/src/renderer/components/ui/button.tsx`. Use the local cn helper and semantic theme colors for tonal button states. [Exact diff](vendor-patches/ui--button.tsx.patch).
- `apps/desktop/src/renderer/components/ui/card.tsx`. Use the local cn helper and semantic theme colors for tonal card surfaces. [Exact diff](vendor-patches/ui--card.tsx.patch).
- `apps/desktop/src/renderer/components/ui/checkbox.tsx`. Use the local cn helper and semantic theme colors for checkbox states. [Exact diff](vendor-patches/ui--checkbox.tsx.patch).
- `apps/desktop/src/renderer/components/ui/command.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--command.tsx.patch).
- `apps/desktop/src/renderer/components/ui/dialog.tsx`. Use the local cn helper, localized accessible labels, and semantic theme colors. [Exact diff](vendor-patches/ui--dialog.tsx.patch).
- `apps/desktop/src/renderer/components/ui/dropdown-menu.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--dropdown-menu.tsx.patch).
- `apps/desktop/src/renderer/components/ui/input.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--input.tsx.patch).
- `apps/desktop/src/renderer/components/ui/popover.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--popover.tsx.patch).
- `apps/desktop/src/renderer/components/ui/progress.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--progress.tsx.patch).
- `apps/desktop/src/renderer/components/ui/select.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--select.tsx.patch).
- `apps/desktop/src/renderer/components/ui/separator.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--separator.tsx.patch).
- `apps/desktop/src/renderer/components/ui/sheet.tsx`. Use the local cn helper, localized accessible labels, and semantic theme colors. [Exact diff](vendor-patches/ui--sheet.tsx.patch).
- `apps/desktop/src/renderer/components/ui/sidebar.tsx`. Resolve the registry cn helper to the existing local utility. Translate accessible labels. [Exact diff](vendor-patches/ui--sidebar.tsx.patch).
- `apps/desktop/src/renderer/components/ui/skeleton.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--skeleton.tsx.patch).
- `apps/desktop/src/renderer/components/ui/switch.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--switch.tsx.patch).
- `apps/desktop/src/renderer/components/ui/tabs.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--tabs.tsx.patch).
- `apps/desktop/src/renderer/components/ui/textarea.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--textarea.tsx.patch).
- `apps/desktop/src/renderer/components/ui/toggle-group.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--toggle-group.tsx.patch).
- `apps/desktop/src/renderer/components/ui/toggle.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--toggle.tsx.patch).
- `apps/desktop/src/renderer/components/ui/tooltip.tsx`. Resolve the registry cn helper to the existing local utility. [Exact diff](vendor-patches/ui--tooltip.tsx.patch).
- `apps/desktop/src/renderer/hooks/use-attachment-src.ts`. Remove the upstream ESLint suppression for a rule absent from this repository; runtime unchanged. [Exact diff](vendor-patches/use-attachment-src.ts.patch).

## Application files

- `apps/desktop/src/renderer/components/assistant-ui/elements/suggestions.test.tsx`. Application-authored regression test for wrapping long suggestion labels; no upstream source exists.

The Thread patch includes an application-specific grouping exception for validated presentation tables. Upstream adoption requires a generic grouping slot. Electron URL policy and unsupported capabilities remain application-owned.

The Reader art revision verified the Thread pristine SHA-256 by reversing the recorded patch from HEAD before regenerating its exact diff and patched hash. No other vendored source changed.
