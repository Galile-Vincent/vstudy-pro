# School registry verification

Run from `apps/desktop`.

- `pnpm typecheck` passes. See `typecheck.log`.
- `pnpm lint` passes. See `lint.log`.
- `pnpm build` passes. See `build.log`.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm test --pool=forks --maxWorkers=2` ran the full suite once. 762 tests passed and 14 were skipped. See `unit-full.log`.
- Follow-up tests for cached logo file bounds and mixed password/SSO selection passed. The final focused run of nine affected test files passed 133 tests. See `unit-final.log`.
- `node scripts/security-lint.mjs` passes its gate. Its two existing dynamic external-link warnings remain allowlisted. See `security-lint.log`.
- From the repository root, `node apps/desktop/scripts/security-audit.mjs` fails because advisory 1244623, GHSA-g3hv-75wg-m249, is not in the reviewed advisory list. It affects existing transitive `minimatch` versions through electron-builder and cyclonedx. This stream adds no dependency and changes no lockfile. See `security-audit.log`.
- `node e2e/schools-registry.mjs` passes against the built app. Its Electron instance closes in `finally`. No dev server runs. See `verification.txt`, the numbered screenshots, and `keyboard-search.yaml`.

The Electron check uses the real bundled directory and production renderer. It replaces discovery, connection, overview, and keychain preflight IPC handlers with fixtures. It proves the picker and connection UI, not live credentials, OS Keychain behavior, or university service availability. Axe checks the dialog using its Electron-compatible legacy mode. `failure.png` records the earlier attempt before enabling that mode, when Axe tried to create an unsupported browser target.

The Node Web Storage flag prevents Node 24.19's experimental global `localStorage` from shadowing jsdom storage. It changes the test runner only.

The security check ran as its constituent audit, ESLint, security lint, and bounded-worker Vitest commands, so its final test stage did not repeat the full suite. No nested agents or extra background servers were started.
