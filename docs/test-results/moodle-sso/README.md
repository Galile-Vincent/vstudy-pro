# Moodle SSO browser verification

The implementation follows the browser split in the [official Moodle login helper](https://github.com/moodlehq/moodleapp/blob/main/src/core/features/login/services/login-helper.ts) and [URL callback handler](https://github.com/moodlehq/moodleapp/blob/main/src/core/services/urlschemes.ts). Packaged typeoflogin 2 uses the system browser when protocol registration succeeds. Development, registration failure, and typeoflogin 3 use the isolated embedded window.

## Evidence

The real CYCU baseline did **not** reproduce the user's unsafe-address page on this machine. `blocked-real-load.log` records the original proxy and request guards reaching the Microsoft sign-in form without credentials. Proxy-client `EPIPE` events occurred but did not abort this run. They do not establish the cause of the user's incident.

The baseline Electron fixture reproduced a false positive. `baseline-frame-harness.log` records a child frame with a `data:` URL and no hostname. The old `will-frame-navigate` handler sent that event through the top-level guard. `networkUrl` rejected its scheme, and `showFailure` replaced the entire document.

The decisive baseline lines are:

```json
{"phase":"moodle-sso-frame","code":"SUBFRAME","host":"","scheme":"data:","port":""}
{"phase":"moodle-sso-navigate","code":"CHECK","host":"","scheme":"data:","port":""}
{"phase":"moodle-sso-load","code":"URL_REJECTED","host":"","scheme":"data:","port":""}
```

The baseline fixture returned `"mode":"frames","error":"blocked"`. The revised fixture returned `"mode":"frames","value":"connected"`. The exact full records are in `baseline-frame-harness.log` and `fixed-harness.log`.

`fixed-real-load.log` records the revised production window setup rendering CYCU's login page, clicking its OAuth2 link, and rendering Microsoft's visible email input at `login.microsoftonline.com`. No credentials were entered.

## Changes

The SSO window no longer installs a proxy or webRequest guards. The unused proxy module and its socket-reset fixture were removed. Browser networking, including secondary hosts and ports, belongs to Chromium or the system browser. Only top-level navigation is restricted to HTTPS and the verified app callback. Child frames and the internal `about:blank` document never trigger recovery. The global app lockdown still only denies popups and webviews.

Main-process discovery, credential, token, API, and download requests retain the existing URL and socket-address guard. Mixed DNS answers now return only public addresses. Private-only, empty, loopback, link-local, metadata, CGNAT, ULA, and fake-IP answers still fail. The address check still runs at socket creation, including each redirect connection.

The pending-login map owns each mode, cancellation, timeout, and cleanup. External callbacks are offered to pending logins and accepted only after passport-derived signature verification. Invalid or stale external callbacks cannot settle an unrelated login. The protocol handlers cover macOS `open-url` and Windows and Linux `second-instance` arguments. The package declares the protocol, and development or failed registration selects the embedded window. The Connect dialog polls the actual mode and offers cancellation. The recovery page shows only the failed host and reason code, without a query string.

The security lint check retains its dynamic `shell.openExternal` warning. Its new narrow exception covers only `sso-protocol.ts`, where `networkUrl` validates the URL immediately before opening it. Unit tests exercise that boundary.

## Commands

Run from the repository root:

```sh
MOODLE_E2E_REAL=1 pnpm --filter @vstudy/desktop exec node e2e/moodle-sso-real-load.mjs
VSTUDY_SSO_HARNESS=1 pnpm --filter @vstudy/desktop exec node e2e/moodle-sso-flow.mjs
VSTUDY_SSO_HARNESS=1 pnpm --filter @vstudy/desktop exec node e2e/moodle-sso-flow.mjs --baseline --baseline-ref=12d675f
pnpm typecheck
pnpm lint
pnpm test
pnpm security:check
pnpm build
```

The real-load script is opt-in and is absent from default e2e. The fixture's TLS and network exceptions exist only in its temporary bundle. Production certificate validation remains enabled.

## Verification results

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm security:check`, and `pnpm build` pass. The final suite reports 547 passed tests and 13 skipped tests across 84 passed and 4 skipped files. Both Electron scripts exit successfully. The security audit reports no unreviewed advisories. Its two accepted dynamic-URL warnings remain visible in the security log.

Fix Root Causes shaped the instrumented baseline frame reproduction. Model the Domain shaped the pending-login map and explicit browser mode. Prove It Works shaped the real CYCU and Electron fixture checks. This implementation delegate ran the work in-thread. The parent owns independent review and any PR.

## Limits

Completing Microsoft authentication and receiving a real Moodle token remain unverified. No credentials were used. Packaged protocol registration and callback delivery through the installed application on macOS, Windows, and Linux remain unverified. Unit tests cover registration failure, URL and argv routing, passport validation, replay, cancellation, and mode selection. The real network run covers the embedded fallback only. Mixed-address DNS behavior is covered with fakes, rather than a captured mixed answer from CYCU.
