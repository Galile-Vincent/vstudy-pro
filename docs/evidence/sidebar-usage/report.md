# Sidebar and subscription usage

The sidebar no longer lists AI tool versions, login warnings, or update actions. The profile and labelled Settings icon share one row. Settings > AI services > AI tools opens the existing setup dialog, which retains provider status, login, and update actions.

Subscription meters show both five-hour and weekly windows for Claude and Codex. Settings > Usage shows reset times, fetch timestamps, manual refresh, and optional Claude Keychain access. English, Traditional Chinese, and Japanese strings are included. Unknown windows remain unknown.

## Reader

`shared/subscription-usage.ts` defines the IPC data shape. Main validates percentages, windows, and reset times. The in-memory cache deduplicates requests, refreshes after 60 seconds, retains successful values as stale after errors, and backs off failures up to 15 minutes. Manual refresh respects failure backoff. Codex probing requires its existing integration to be enabled.

Claude reads the CLI OAuth environment token or credential file. On macOS, the user can explicitly allow reading the Claude Code Keychain entry for this renderer session in Usage settings. The checkbox starts off and the choice is not persisted. Tokens are neither returned to the renderer nor logged or persisted. The only direct OAuth request is GET https://api.anthropic.com/api/oauth/usage with redirects rejected. Token renewal stays with Claude Code. Expired credentials require CLI login again.

Codex uses the existing approved CLI executable and its app-server authentication through account/rateLimits/read. VStudy does not extract Codex credentials. Unsupported CLIs, missing credentials, API failures, and unreported windows remain explicit unavailable states. A Codex RPC failure does not reliably distinguish authentication failure from a network outage.

## References inspected

Both repositories were cloned locally under `.references` for inspection and removed after verification.

- OpenUsage f7e38d7608da061e609e6d0c8285531e56c2f950. `Sources/OpenUsage/Providers/Claude/ClaudeUsageClient.swift` and `ClaudeUsageMapper.swift` define the fixed OAuth usage URL and five_hour / seven_day utilization fields.
- T3 Code 09a54f01bc0ae83865347a965ced50f8c8ec2953. `packages/effect-codex-app-server/src/_generated/schema.gen.ts` defines account/rateLimits/read and rate-limit snapshots. `packages/provider-core/src/server/usageLimits.test.ts` covers separate 300-minute and 10080-minute windows.

## Evidence

T3 preview loaded the real Vite renderer with its development mock bridge. No live account usage was claimed. PNGs are local verification artifacts ignored by the repository.

- `sidebar-en.png` shows the footer at 1280 by 800.
- `sidebar-zh-Hant.png` shows the Traditional Chinese footer.
- `sidebar-ja-900.png` shows the Japanese footer at a narrower 900 by 768 viewport.
- `dashboard-zh-Hant.png` shows both provider windows, resets, timestamps, and the Keychain opt-in.

Desktop typecheck and lint passed. The full desktop Vitest suite passed with 287 files, 2613 tests passed, and 20 tests skipped before the final disabled-Codex guard. After that guard, the focused provider and IPC suite passed with 16 tests and one live-login smoke test skipped. The guard has its own regression test. Full output is saved locally in `vitest.log`.

Model the Domain led to separate typed provider windows instead of overloading the existing single rate limit. Boundary Discipline kept external validation in main and credentials out of IPC.

Live OAuth and Keychain access were not exercised. Provider endpoint or CLI protocol changes can make the reader unavailable. Cached stale values retain their timestamp rather than estimating new usage.
