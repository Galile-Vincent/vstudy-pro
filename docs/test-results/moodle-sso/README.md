# Moodle SSO regression evidence

Run from the repository root with installed dependencies.

```sh
VSTUDY_SSO_HARNESS=1 node apps/desktop/e2e/moodle-sso-flow.mjs --baseline --baseline-ref=08ee713
VSTUDY_SSO_HARNESS=1 node apps/desktop/e2e/moodle-sso-flow.mjs
```

The harness bundles the actual Moodle SSO, discovery and proxy modules into a temporary Electron main process. It installs the actual global web-contents policy extracted from index.ts. A hidden fixture main window remains alive while real SSO BrowserWindows navigate. TLS fixtures expose public configuration, launch.php, and an IdP redirect on a second port. Only this temporary bundle permits 127.0.0.1 and fixture ports. Certificate exceptions are installed only in the temporary Electron entry point. No test override or certificate exception is present in the production bundle.

The baseline ref predates the fix. The harness reads its SSO, proxy and global policy directly through git show. Application source files in the worktree remain unchanged.

## Findings

The original HTTPS IdP redirect produces `cancelled`, with `will-redirect` as its last navigation event. The original global listener prevents that redirect. Direct custom-scheme redirects and clicked links already succeed in this Electron version. This reproduction does not support custom-scheme event delivery as the original cause.

Twenty real TCP CONNECT clients reset their sockets while the proxy awaits DNS. The original code raises twenty uncaught `ECONNRESET` exceptions. An exception listener in the harness records these and keeps Electron alive so the remaining tests can run. The fixed proxy raises no uncaught exceptions. This establishes the missing socket error handler as a real uncaught-exception defect. It does not establish that it caused the user's reported full-app exit. The baseline process exits with code 0 during harness cleanup, not from a reproduced crash.

The fixed harness passes HTTPS IdP redirect, direct callback, clicked link, invalid signature, cancellation, timeout, disposal, blocked private address, load failure with an open error page, and Retry followed by successful authentication. Every outcome preserves the fixture main window. The log includes event order, net error codes, sanitized hosts, callback verification diagnostics, and the process exit code. Unit tests additionally cover malformed callbacks and callback interception through request, redirect and failed-navigation hooks.

[Moodle 4.5 launch.php](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/admin/tool/mobile/launch.php) signs `$CFG->wwwroot . $passport`. It renders an auto-clicked app link when confirmed or on iOS, and otherwise uses a Location redirect. The supplied read-only Moodle app checkout was inspected at `src/core/features/login/services/login-helper.ts` and `src/core/services/urlschemes.ts`.

The fixed verifier accepts both the checked canonical root and the advertised wwwroot when they share the school's domain. It distinguishes malformed data from signature mismatches and reports the matched scheme and host without reporting the signature or secrets.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm security:check`, `pnpm build`, and the real Electron harness pass. The test suite reports 522 passed tests and 13 skipped tests across 83 passed and 4 skipped files. Production output contains no `VSTUDY_SSO_HARNESS` override.

## Live confirmation still required

Run `pnpm dev`, choose CYCU at https://ilearning.cycu.edu.tw, press Connect, and complete Microsoft sign-in. Confirm that the school window appears, the main app stays open, and the account appears as connected. This harness does not contact CYCU or Microsoft, reproduce their cookies, MFA, CORS requests, or establish the precise cause of the reported app exit.

If sign-in fails, send the JSON lines whose phase begins with `moodle-sso-`, especially `moodle-sso-load` and `moodle-sso-outcome`. A signature mismatch reports `signature-mismatch`; a verified callback reports `moodle-sso-signature` with `HTTP_MATCH` or `HTTPS_MATCH` and the signing host. If the app exits, also send `main-uncaught-exception`, `main-unhandled-rejection`, `main-child-process-gone`, `main-render-process-gone`, and `main-exit` lines, plus the terminal exit code. Send these diagnostic lines only. Do not send sign-in URLs or callback payloads.

Fix Root Causes shaped the TLS reproduction and the original-versus-fixed socket reset experiment. Model the Domain shaped the explicit success/error outcome and distinct authentication error codes. Implementation and verification ran in-thread because this task is an implementation delegate; the parent owns independent review and any PR.
