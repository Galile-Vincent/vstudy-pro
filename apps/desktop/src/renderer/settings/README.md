# Settings dialog

`providers.tsx` owns the dialog and its seven tabs. Each pane lives in its own module: `appearance.tsx`, `agents.tsx`, `storage.tsx`, `../usage/settings.tsx`, `../privacy-settings.tsx`, and the AI services rows in `../provider-row.tsx` and `../ai-cli/inventory.tsx`.

The dialog is one size on every tab: `min(1000px, 100vw - 32px)` by `min(700px, 100dvh - 32px)`. The header and the tab list stay fixed. Only `.settings-pane` scrolls, with a fade mask at its top and bottom edges.

Panes share one vocabulary from `layout.tsx` and `settings.css`.

- `SettingsGroup` is a section title plus a hairline-framed card. Rows inside it are divided by hairlines.
- `SettingsRow` is a label, optional helper text, and a right-aligned control. Selects use the shared `--settings-control` width so right edges line up.
- `details.settings-disclosure` holds secondary material such as Appearance Advanced, the AI setup guide, and AI Advanced. Its summary is the title.

Type scale: pane title `--type-lg`, section title `--type-md`, row label `--type-base`, helper `--type-sm` in `--muted`. Dividers use `--hairline`. Control edges use `--line`.

Evidence and the reusable capture lever: `node e2e/capture-settings.mjs --label after --axe --assert` after `pnpm build`. It writes to `docs/evidence/settings/design-pass/` and fails if any tab changes the dialog size.
