# Connect AI dialog repair

Branch: `fix/ai-login-dialog`. Implementation only; no push or pull request.

## Root cause verified with Claude Code 2.1.319

Immediately after login, setup used pipe capture for `claude auth status --json`, so login succeeded. The next Test action used an interactive PTY for the same status command. Claude detected the TTY and inserted ANSI colour sequences **inside the JSON**, around property names. The process exited 0 and reported an authenticated account, but JSON parsing threw `unknown` before the tiny test ran. Retrying used the same TTY and failed again.

Reproduction used the installed `/Users/vc/.local/bin/claude`, production `buildPlan`, and `ActionPty`. A separate run with the production `cliEnvironment`, exact `cliArgs`, and a private temporary working directory exited 0 and returned `OK`. This ruled out the test flags, PATH, working directory, missing credentials, and response streaming as the reproduced cause. No credentials or account JSON are included in this report.

All noninteractive Claude/Codex auth status checks now use the existing bounded private `captureCommand`. Interactive login still uses the action PTY. No change to consent, executable approval, argv spawning, or native external-link confirmation.

After the fix, a bundled harness called production `authStatus` followed by `tinyTest` using production `runCli` and `cliArgs` against the installed Claude CLI. It returned `loggedIn: true`, `answer: "OK"`. The harness used existing credentials and did not initiate a fresh OAuth login.

## Renderer

- Keep Install, Sign in, Test visible with pending, running, done and failed labels and current-step highlighting.
- Present sign-in as an explicit confirmed Open sign-in page action, Copy link, device-code guidance, a labelled returned-code field, and live status. The field sends one bounded line plus Enter to the current PTY. Reject terminal controls and disable submission after completion.
- Strip CSI styling when extracting guided links and device codes. URLs are never primary text.
- Keep raw output in one initially collapsed Details disclosure. Mount the terminal only when expanded; retain bounded scrolling, resizing, and xterm accessibility. Remove duplicate URL and plain-output dumps and automatic scroll-to-terminal behavior.
- Move alternatives below the main button; consolidate plan information there. Reduce failure-card weight and show the specific localized failure code when no recovery category matches, with recovery actions.
- Show a success panel and primary Continue button after the real test passes.
- Add copy for English, Traditional Chinese and Japanese only in the AI CLI locale namespace. No shell/app files changed.

## Evidence and checks

The shared preview browser was unavailable (`available:false`). Renderer verification used a temporary Vite fixture with real components and CSS, synthetic OAuth text, and installed headless Chrome through Playwright. No Electron instance launched. The temporary fixture files and server were removed/stopped.

Before: the wrapped URL button had `clientHeight:44` and `scrollHeight:66`; its text overlapped the following summary. After: raw output stays collapsed, there is no raw URL button, and the sheet has no horizontal overflow at 1100px and 390px viewports (720/720px and 358/358px client/scroll widths). Tested success, specific certificate failure, code submission and status update, and expanding Details at narrow width. No page errors were recorded.

Local evidence directory: `/tmp/ai-login-evidence/`:

- `before.png`, `after.png`: same renderer surface before/after.
- `success.png`, `failure.png`: complete/test-failure states.
- `code-narrow.png`, `details-narrow.png`: code submission and expanded details at 390×844.
- `real-cli-after.json`: account-free real CLI result.
- `typecheck.log`, `lint.log`, `vitest.log`: final validation logs.

Validation: repository `pnpm typecheck`, repository `pnpm lint`, and AI CLI renderer/setup backend/locale Vitest tests with `--pool=forks --maxWorkers=2`. The tests cover guided step transitions, native setup lifecycle, non-TTY auth capture, false success/tool rejection, explicit confirmed links, styled device codes, copy without opening, code submission/control rejection, and failure recovery.

Limitations: fresh browser OAuth, native confirmation UI, real device-auth provider login, packaged Electron, Windows runtime and Japanese visual layout were not exercised. The fixture proves rendered interaction and the separate real CLI harness proves the repaired auth/test execution path; neither alone proves a complete fresh-account Electron login.
