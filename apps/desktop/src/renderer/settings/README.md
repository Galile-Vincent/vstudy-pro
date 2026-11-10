# Settings dialog

`providers.tsx` owns the dialog and its seven tabs. Each pane lives in its own module: `appearance.tsx`, `agents.tsx`, `storage.tsx`, `../usage/settings.tsx`, `../privacy-settings.tsx`, and the AI services rows in `../provider-row.tsx` and `../ai-cli/inventory.tsx`.

The dialog is one size on every tab: `min(1000px, 100vw - 32px)` by `min(700px, 100dvh - 32px)`. The header and the tab list stay fixed. Only `.settings-pane` scrolls, with a fade mask at its top and bottom edges.

Panes compose the shared component library in `../components/ui`. Settings is a modal dialog and contains no main landmark.

- `Section level={3}` groups controls under a heading. `Card variant="flat"` provides the tonal surface.
- `SettingRow` pairs a label and helper copy with controls. Supply `htmlFor` for a single input; segmented choices name their radio group. `FormField` associates provider labels with inputs.
- `ListRow` presents providers, grants, and activity. Revocation feedback stays inside the affected grant row with `role="status"`.
- `details.settings-disclosure` holds Appearance Advanced and the AI setup guide. API key entry and security guidance are directly visible.
- General owns document defaults. Converter controls and delete-all remain in Privacy to preserve the privacy e2e locators. Activity shows at most the twenty newest entries.

Evidence and the reusable capture lever: `node e2e/capture-settings.mjs --label after --axe --assert` after `pnpm build`. It writes to `docs/evidence/settings/design-pass/` and fails if any tab changes the dialog size.
