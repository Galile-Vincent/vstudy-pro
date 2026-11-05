# Theme evidence

The production Electron run in `verification.json` passed. It used one isolated instance and closed it in a `finally` block. The renderer, SQLite settings, library, reader, and fake chat provider were real app code. The Courses overview used deterministic IPC fixtures and made no school requests.

The 42 screenshots cover Ocean, Grove, Ember, and Iris in Light and Dark across Library, Courses, Reader with Chat, Appearance, and Interface controls. Two screenshots cover live theme editing and a contrast warning. The editor controls keep a validated palette while draft colors apply to the app and mini preview.

The run checked theme selection by keyboard, explicit scheme persistence, native window background and `nativeTheme.themeSource`, editor cancellation, custom theme creation, JSON export, rejection of invalid JSON, JSON import, keyboard slider changes, System media changes, and custom theme reload. All eight Appearance combinations passed the WCAG A and AA axe checks. `verification.json` records the native and CSS background colors.

Reproduce from `apps/desktop`.

```sh
pnpm build
node e2e/themes.mjs
```

## Other checks

- `pnpm typecheck` passed.
- `pnpm lint` passed.
- `node scripts/security-lint.mjs` passed with two existing dynamic `shell.openExternal` warnings.
- The targeted Vitest run passed 18 tests with `--pool=forks --maxWorkers=2`.
- The full `pnpm test` run passed 736 tests with 14 skipped. It ran once with two workers.
- `contrast.txt` records the shipped palette checks. Every theme and scheme passed at all 51 contrast settings. All 17 renderer CSS files passed the fixed-color audit.
- `pnpm security:check` stopped at the dependency audit because advisory `1244623` for minimatch is not in `docs/security-audit.json`. The advisory describes globparts amplification denial of service, with moderate severity. This stream changed no dependency versions or lockfile. Lint, security lint, and tests ran separately afterward.

The screenshots do not prove manual VoiceOver behavior or live school integration. The token audit covers app CSS. Provider branding, document images, and original PDF contents retain their source colors.
