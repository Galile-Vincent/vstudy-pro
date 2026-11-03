# Antigravity protocol evidence

Research on 2026-11-03. Upstream clone outside this repository:
`/tmp/vstudy-agy-t3code-1793705295`, pingdotgg/t3code commit
`cefb544af3c98224874419198c0359b652ca3c94`.

Upstream paths (relative to that clone):

- `apps/server/src/provider/Drivers/AntigravityDriver.ts`: driverKind
  `antigravity`, installation resolution, disposable setup runtime, model refresh,
  and authenticated conversation runtime.
- `apps/server/src/provider/AntigravityInstallation.ts`: resolves PATH/override or
  manages `agy_acp_server.par` plus `localharness_external` releases.
- `apps/server/src/provider/antigravityAuthSupport.ts`:
  `buildAntigravityAcpSpawnInput` launches the server executable directly (no args
  on macOS, `--uid=` on Linux), sets isolated profile/auth environment and
  `ANTIGRAVITY_HARNESS_PATH`. T3 manages its own login/profile; VStudy deliberately
  uses the installed CLI's existing login instead.
- `apps/server/src/provider/acp/AntigravityAcpSupport.ts`: ACP protocol version 1,
  clientInfo `zed` for the full model catalog, no client terminal or writes,
  eager authentication, `resume` session support, cancellation waits for prompt
  completion, and `_meta.antigravity.disabledTools` extension.
- `packages/provider-acp/src/server/AcpSessionRuntime.ts`: initialize,
  authenticate, session/new/load/resume, model/config selection, session/prompt,
  session/update notifications and session/cancel over JSON-RPC stdio.
- `apps/server/src/textGeneration/AntigravityTextGeneration.ts`: text-only helper
  refuses tool calls, permissions, files, terminals and elicitation; rejects
  profiles containing global hooks/MCP config.

Local CLI: `/Users/vc/.local/bin/agy`, version 1.4.12. `antigravity` was absent.
`agy --help`, `agy chat --help`, `agy exec --help` list the main print-mode
options; chat/exec are not dedicated headless subcommands. `agy acp --help`
confirms ACP stdio, sandbox, and include-default-customizations options.
`agy models` successfully fetched all six models in the fixture.

Real print command in an empty temporary cwd:

```sh
agy --print 'Reply with exactly VSTUDY_OK. Do not use any tools.' \
  --output-format stream-json --model gemini-3.8-flash-low \
  --mode plan --sandbox --disable-slash-commands --print-timeout 30s
```

Exit 0, VSTUDY_OK. Print mode is a separate event/step_update/result NDJSON
protocol, not ACP; `--mode plan` warns it has no effect with slash expansion
turned off. The adapter therefore uses ACP, not this print protocol.

`agy-acp.jsonl` is a trimmed REAL ACP capture from `agy acp --stdio --sandbox
--include-default-customizations=false`, in an empty temp cwd. Session UUID was
replaced by fixture-session; account tier, config option and slash command
notifications were removed. The initial explicit authenticate response was
removed and subsequent request IDs renumbered for the adapter handshake. Text
and token counts are unmodified. Prompt returned VSTUDY_ACP_OK, input 7705,
output 7. A subsequent real adapter test verified session/new succeeds using
cached CLI login without invoking authenticate, enumerates models, returns
VSTUDY_ADAPTER_OK and emits usage.

VStudy starts a fresh ACP session per assembled prompt; the existing chat
service supplies conversation history. This avoids replaying document context
from a native session. It advertises no client files or terminals, supplies no
MCP servers, disables all native tools observed in the real CLI's init output,
and rejects tool/permission requests. ACP sandbox is terminal restriction,
not a complete filesystem jail. Future CLI tools and user-global hooks are not
qualified by this change; do not interpret this as full OS isolation.

Live revoked-login and quota-exhaustion cases were not induced. Error-category
coverage uses synthetic RPC errors. Other CLI versions and Windows are unverified.

Built Electron app verification also passed with real agy selected:
imported `e2e/fixtures/reading.md`, selected
`agy-cli/gemini-3.8-flash-low`, created a conversation, submitted a prompt and
received VSTUDY_APP_AGY_OK. UI showed ~8.0k input and 10 output tokens.
Screenshot: `/tmp/vstudy-agy-e2e-chat.png`. The first harness attempts imported
before initial workspace loading completed and raced that initial load; waiting
for Workspace connected resolved the harness issue without product changes.
