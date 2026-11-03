# Localization and visual verification

Run from the repository root:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
cd apps/desktop
node scripts/check-contrast.mjs
node e2e/i18n.mjs
```

The Electron matrix creates isolated user data, imports a Markdown fixture, starts a conversation, opens the picker and Settings, verifies the selected language, changes language live, checks horizontal window overflow, and captures chat/picker/settings at 720, 900 and 1200 px in light/dark for English, Traditional Chinese and Japanese. Evidence goes to `/tmp/vstudy-i18n`. `VSTUDY_LOCALE` overrides the system locale for this test; it is read only in the main process.

Semantic neutral OKLCH contrast uses relative luminance L³. Measured text/background ratios: light ink 14.59, muted 6.54; dark ink 12.98, muted 6.88. Control borders: light 3.23, dark 4.34. The script fails below 4.5 for text or 3 for controls. These are token-pair checks, not an exhaustive rendered-pixel contrast audit of all generated elements or translucent backgrounds.

Renderer lint forbids literal JSX text, visible accessibility attributes and literal template portions of those attributes. Its documented allowlist includes product names, native language names and technical units. It does not prove that arbitrary data flowing through JSX expressions is translated; review conditional/default strings and main-process payloads too.

Manual screenshot inspection covered the 900 px chat, picker and Settings surfaces and narrow Japanese picker/composer. Labels wrap inside the sidebar and Settings; document prose is unchanged. Settings is vertically scrollable. Long model names intentionally ellipsize in the compact composer trigger.

Remaining verification: native-speaker review, VoiceOver, 200% text scaling, full axe coverage, pseudo-locale screenshot pass, live OS Reduce Transparency preference changes, native menu behavior across OS language combinations, and macOS vibrancy. The window retains its readable solid fallback; vibrancy was not enabled without a dedicated window screenshot comparison. Native role subitems receive catalog labels; Electron retains their platform shortcuts and behavior. Legacy error/progress message fields remain during protocol migration.

VoiceOver script: turn VoiceOver on; reach the skip link, library toggle/import, conversation chooser, model picker and Settings using keyboard only; confirm labels and current values; navigate all picker options; dismiss and verify focus returns; switch language and confirm labels update; import and read CJK prose; send/stop a response and check announcements do not repeat every streamed token. A human must record the result.

Final integrated run: `pnpm typecheck`, `pnpm lint` (zero renderer literal-copy violations), `pnpm build`, and `pnpm test` passed. Vitest: 35 files, 199 passed, 4 skipped. Focused renderer/catalog/prompt run: 60 passed. Real Electron `selection-chat.mjs`, `conversion.mjs` (DOCX/XLSX/PDF plus data/library images), `visual-regressions.mjs`, and `i18n.mjs` passed with no page/console errors reported by those scripts. All eighteen 900 px locale/theme/view screenshots were opened for inspection. Matrix totals: 54 screenshots across three widths, three locales, two themes and three surfaces. Browser plugin was unavailable; verification used the repository's Electron Playwright harness.
