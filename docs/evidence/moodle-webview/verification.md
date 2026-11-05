# Authenticated Moodle webview verification

Students can open original Moodle content inside VStudy with their connected account. The native module and announcement sheets retain their sanitized preview before the original-page action.

The organizing shapes are `WebviewTarget`, `WebviewState`, `WebviewPolicy`, and `MoodleWebviewSession`. Main owns the account cookie partition, the six-minute autologin budget, and the sandboxed WebContentsView. React owns the toolbar, errors, focus restoration, and measured geometry. Remote pages receive no app preload or IPC bridge.

## Integration

The branch is `t3/moodle-webview`. Merge `fba1c7a` integrates repo hygiene, the school registry, and theme packs. Merge `34d36d9` also preserves the later chat-history stream. Both locale conflict resolutions keep all existing namespaces, including schools, themes, history, and webview. Both shared IPC contracts remain registered. The pane uses shared reader, accent, overlay, and elevation tokens.

Shared edits are `src/shared/ipc.ts`, `src/shared/i18n.ts`, the three new `locales/*/webview.json` catalogs, `src/main/ipc/moodle.ts`, course entry points in `content.tsx` and `index.tsx`, and the reviewed external-opener exception in `scripts/security-lint.mjs`. The subsystem and threat model are in `src/main/moodle/webview.README.md` and `docs/SECURITY.md`.

## Results

- `pnpm typecheck` passes after the final merge.
- `pnpm lint` passes after the final merge.
- The final focused command passes 126 tests in seven files. It uses `NODE_OPTIONS=--no-experimental-webstorage` and `--pool=forks --maxWorkers=2`. Its exact file set and output are in `focused-tests.txt`.
- The single actual full-suite run passes 832 tests, fails 15, and skips 14. It runs before the later chat-history merge. The failures occur in the existing connect and appearance test setup because the global `localStorage` is undefined. A targeted retry of only those two files with `NODE_OPTIONS=--no-experimental-webstorage` passes all 15 tests. The full suite is not repeated. See `full-test-run.txt` and `targeted-storage-retry.txt`.
- An initial full-test command duplicated worker options already present in the merged desktop script, so Vitest exited before running tests. The actual full run uses plain `pnpm test`, whose script already sets two workers.
- `pnpm contrast:check` passes every shipped light and dark theme at every configured contrast setting. It also checks all 20 renderer CSS files for semantic tokens.
- `pnpm build` passes after the final merge. The build retains the existing large-bundle and mixed static/dynamic import notices.
- `node e2e/moodle-webview.mjs` passes after the final merge. `verification.txt` records the assertions. The fixture runs the built app renderer, the production WebContentsView controller and strict contracts, and the real DocumentService, SQLite library, and reader. It injects only the local school account, credentials, transport, and HTTP fixture policy. It tests autologin POSTs, HttpOnly cookies, account cookie separation, remote sandbox preferences, history, controlled popups, external confirmation, redacted copy links, native detail sanitization, focus restoration, shared Ocean dark tokens, reader imports, and expiry cooldown behavior.
- `node scripts/security-lint.mjs` passes. It reports only the three explicitly reviewed dynamic external opener warnings. The new Moodle opener validates the protocol and requires a native confirmation.
- `pnpm security:check` stops at audit before running lint or tests. The new unreviewed advisory is minimatch GHSA-g3hv-75wg-m249, pnpm ID 1244623, in existing electron-builder and SBOM tooling dependencies. No dependency or audit acceptance entry is changed by this stream. Lint, security lint, and tests run separately as recorded above. The inherited root script also forwards test worker options that the desktop script already supplies.

## Screenshots

Screenshots remain local because the merged repository policy ignores generated evidence images. Electron captures the app toolbar and the native child document separately. The blank content slot in a toolbar screenshot is a capture limitation, not the native document output. Pair the pane screenshots with their native content screenshots.

- `00-native-module-detail.png` shows the sanitized detail sheet.
- `01-authenticated-pane.png` shows the light pane toolbar.
- `01-authenticated-page-content.png` shows its real authenticated native document.
- `02-full-overlay.png` shows the full-overlay toolbar and zoom controls.
- `02-ocean-dark-pane.png` and `02-ocean-dark-page-content.png` show the app and native document using the same theme.
- `03-certificate-error.png` shows the certificate error with no bypass action.
- `04-session-expired.png` shows the reconnect timing and sign-in recovery actions.

## Limits

Live university credentials are not used. Mobile autologin availability and institutional SSO need live-school acceptance. Certificate failure is simulated through Chromium's failure event; no certificate is accepted or bypassed. Additional SSO/CDN origins require main-owned configuration and default to none. The independent review belongs to the coordinator. No nested agents are started.

The e2e finally block closes its one Electron instance, the one local mock server, and its temporary library. Final process inspection finds no Electron or mock-server process from this task.
