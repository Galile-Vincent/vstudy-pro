# Authenticated Moodle pages

`webview.ts` owns one WebContentsView per app window and one ephemeral Chromium partition per connected Moodle account. The app renderer owns the toolbar, errors, theme tokens, and measured bounds. The school's page keeps its own colors: the app sets only the pane's empty background and injects no CSS, because forcing a dark foreground and background onto a third-party theme left light text on white cards. The remote view has no preload and cannot call app IPC.

`webview-session.ts` models the account lifecycle as idle, authenticating, ready, expired, or disposed. It coalesces concurrent opens and waits at least six minutes between key requests, including failed requests. Closing a pane keeps its account cookie in memory. Disconnect and application shutdown clear the partition and close its connections.

The web-service token and private token travel in a main-process POST to `tool_mobile_get_autologin_key`. A second main-process POST submits the one-use key to `admin/tool/mobile/autologin.php`. Chromium receives the cookie. A document navigation never contains either token or the one-use key. There is no token-in-URL fallback. Schools without a private token or mobile autologin show a reconnect page.

`webview-policy.ts` is the shared boundary for navigation, resource requests, external links, and pluginfile detection. The installation root pins school navigation. Additional SSO origins and CDN origins must come from trusted main-process configuration through `MoodleWebviewDependencies.configuredHosts`. They cannot come from renderer IPC. No additional origins are enabled by default. The `loopback` dependency option exists for the local HTTP fixture and is never enabled by production IPC.

A page can start an import only while the user is interacting with it. Electron 42 navigation events carry no gesture flag, so main treats a mouse press or key press in the view as a gesture that lasts 10 seconds and covers one import; downloads use `DownloadItem.hasUserGesture()`. Opening a file from the app counts as the user's gesture. Each pane accepts at most 5 imports per minute; the sixth shows the blocked page, and a request without a gesture is dropped and logged.

`webview-files.ts` streams supported pluginfiles through `DocumentService.importPath`, with a 50 MiB limit, a private temporary file, cancellation, and cleanup. DocumentService performs format validation, content hashing, library storage, and conversion. Other downloads are canceled. Original external pages require a native confirmation, and copied or external links omit session parameters.

The view sends a bounded state snapshot when the app polls it. State contains an opaque pane ID, loading phase, redacted URL, page title, connection status, history availability, zoom, an error code, retry time, and an optional imported document ID. Every request and response uses the strict schemas in `shared/moodle-webview.ts`. Reloading or navigating the app destroys its owned native view.

The four-minute keepalive runs only while an authenticated pane is visible. A login redirect attempts one fresh exchange. The key cooldown can prevent that exchange, in which case the pane reports when Reconnect becomes available. The API service's token status and the Chromium cookie lifetime remain separate.

## Reference findings

iCYCU uses `MoodleSharedWebViewContext` to share the default WKWebView data store and process pool between login and course pages. Its session store validates account ownership and clears website data on logout. Its module sheet refreshes authentication after resuming from the background. Its HTML renderer renders descriptions before the original page. Its `iLearningWKWebView` redirects popups into the current view without a host policy. Its autologin helper falls back to attaching the web-service token to the target URL when a private token or key is missing.

VStudy keeps the native detail-first interaction and cookie reuse. It uses separate account partitions, blocks unapproved navigation, cancels downloads into the system Downloads folder, and fails closed instead of attaching a token to a page URL.

Protocol references are Moodle's [key exchange implementation](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/admin/tool/mobile/classes/external.php), [autologin endpoint](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/admin/tool/mobile/autologin.php), and Electron's [WebContentsView API](https://www.electronjs.org/docs/latest/api/web-contents-view).

## Verification

From `apps/desktop`, run focused logic tests with `pnpm exec vitest run src/main/moodle/webview-policy.test.ts src/main/moodle/webview-session.test.ts --pool=forks --maxWorkers=2`. Build the app with `pnpm build`, then run `node e2e/moodle-webview.mjs`. The e2e owns one local mock Moodle server and one Electron instance, and closes both in `finally`. It writes screenshots and its report to `docs/evidence/moodle-webview`.
