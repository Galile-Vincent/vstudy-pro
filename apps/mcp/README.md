# VStudy MCP

Global agents read coursework and propose actions through the student's existing VStudy session. This package holds no school credentials and opens no school connections. Electron main owns Moodle access, scopes, account selection, content redaction, and approvals.

## Build and run

Use Node.js 24 or later and the workspace's pinned pnpm.

```sh
pnpm --filter @vstudy/mcp build
node apps/mcp/dist/vstudy-mcp.cjs --help
node apps/mcp/dist/vstudy-mcp.cjs install --client codex --dry-run
```

Run the bin without a subcommand for MCP stdio. Pass `--client claude`, `codex`, `agy`, `claude-desktop`, or `cursor` to select a persistent local identity. `generic` is the default for manually configured clients. The client name is a display label, not authentication.

Install requires an available Node runtime. The installer pins its absolute path and the bundled CLI path. The packaged Electron executable cannot act as Node because VStudy disables its RunAsNode fuse. Plugin installations instead use `node` from the client's PATH.

Use `install --client <client> [--dry-run]`, `uninstall --client <client> [--dry-run]`, or `doctor [--client <client>]`. Add `--json` for the desktop integration. Install and uninstall print only the VStudy entry. They preserve unrelated text, refuse conflicts and symlinks, save existing contents in a private adjacent backup, and replace configurations atomically. Dry-run creates nothing. Uninstall does not revoke grants or remove optional skills. Revoke access in VStudy.

## Pairing and recovery

Turn on **Settings > Agents** in VStudy. The first tool or resource read connects to `<userData>/mcp/bridge.sock`. On macOS the default userData is `~/Library/Application Support/@vstudy/desktop`. `VSTUDY_USER_DATA` selects an explicit development or test profile. It is a local filesystem path, never a school URL.

If the socket is absent or refuses connection, the CLI runs `/usr/bin/open -g -j -a 'VStudy Pro' --args --mcp-background` with bounded backoff and a launch cooldown. Other platforms require the user to open the app. Permission failures do not trigger a launch.

Pairing begins and finishes on one connection. Compare the code on stderr with VStudy before approving. Discovery, help, install, and doctor do not pair. The per-client file `~/.config/vstudy-mcp/<client>.json` contains a random client UUID, an opaque local grant, and its expiry. The directory is 0700 and the file is 0600. Nothing reads a Moodle password, cookie, WS token, or autologin key.

Pairing polls `pair.finish` on the same connection when the app returns pending `DENIED`, until the advertised expiry. Core currently allows two minutes for pairing. Tool roundtrips allow 130 seconds for the core's 120-second whole-call bound, including its 60-second write approval window. Installed Claude Code, Codex, and agy entries allow 300 seconds per tool call, including initial pairing and a write approval. Desktop and Cursor timeout behavior still needs live-client acceptance.

A disconnected read may reconnect once. Writes never replay after a disconnect or timeout. Inspect pending and completed actions in VStudy before a new write request. Expired or revoked grants fail rather than silently broadening access. To pair again, revoke the old grant in the app, stop the client server, and remove only that client's local grant file. The next tool call requests fresh consent.

## Contracts and modules

The app-owned [shared contract](../desktop/src/shared/mcp.ts) defines all 27 input schemas, risks, scopes, and the result union. It is unchanged by this package. `server.ts` publishes those schemas with the official MCP SDK. A successful result contains a fixed human summary plus `data.trust`, `data.notice`, provenance, content, and a pagination cursor. An error contains a fixed code, message, and hint. Raw bridge errors never enter stdio.

Resources use the same bridge tool calls and account checks:

- `vstudy://accounts/{account}/courses/{courseId}` invokes `get_course`.
- `vstudy://accounts/{account}/courses/{courseId}/modules/{moduleId}` invokes `get_module`.
- `vstudy://accounts/{account}/files/{fileId}` invokes `read_file`.

Resources accept optional `cursor` and `limit` query parameters. IDs are local UUIDs, never school URLs. Resource templates advertise these patterns. The resource list is empty because enumeration would initiate authorization during discovery.

Prompts are `plan-my-week`, `prepare-for-exam`, `catch-up`, and `summarize-announcements`. They treat school content as untrusted data, preserve provenance, and keep writes behind app approvals. They do not fetch content during prompt discovery.

`transport.ts` owns framing, response correlation, and a four-request queue matching the core bridge limit. `bridge.ts` owns lazy pairing and retry policy. `credentials.ts` owns the private identity. `client-config.ts`, `config-edit.ts`, and `installer.ts` own verified client paths, source-preserving edits, and file transactions.

## Desktop integration

`dist/installer.cjs` exports `installClient`, `uninstallClient`, `restoreConfigBackup`, `detectClients`, and `doctor`. Installer functions return `{changed, diff, configPath, backupPath?}`. Doctor returns `{ok, checks}`. These functions do not write stdout or start a stdio server. Call them only behind validated main-process IPC. `ClientOptions` in `src/client-config.ts` documents explicit runtime and bin path overrides.

Alternatively, invoke the bundled CLI with an argv array and `--json`. Never use a shell command string. Never pass a grant in arguments or environment variables. Use a separately detected Node runtime rather than the fused Electron binary.

The desktop build first builds MCP, then invokes the app-owned root `scripts/build-mcp-peer.mjs`, then builds Electron. Root build and packaging use that desktop build. Extra resources include `mcp/dist`, `mcp/plugins`, and the client-format reference. The core stream owns the root native helper build script. Its output is packaged at `Resources/mcp-peer`, outside ASAR, with executable permissions.

## Verification

```sh
pnpm --filter @vstudy/mcp typecheck
pnpm --filter @vstudy/mcp lint
pnpm --filter @vstudy/mcp test
pnpm --filter @vstudy/mcp verify
```

Tests spawn the real bundled CLI through the official SDK Client and StdioClientTransport against a private controlled socket. They cover schemas, resources, prompts, pairing, permission checks, malicious content, reconnects, uncertain writes, and temporary-home client adapters. No test changes the user's actual client configurations or launches Electron. Electron-backed and live-school tests belong to the parent integration stream.

[Client format evidence](CLIENT_FORMATS.md) separates installed-binary checks, parsing, plugin validation, and live launch acceptance.

After the core stream is integrated, run the real-engine check without Electron:

```sh
pnpm --filter @vstudy/mcp exec node scripts/check-core-bridge.mjs
```

`--core-root /absolute/path` selects an isolated extraction of a core commit. `--bin /absolute/path` and `--peer-helper /absolute/path` select packaged artifacts. This check uses the actual security engine and native same-UID verifier with a controlled backend. It verifies pending consent, one-shot finish, opaque cursors, approved writes, concurrent reads, restart, and disabled errors. It never connects to a school.
