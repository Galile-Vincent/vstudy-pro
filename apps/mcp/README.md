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

Use `reset --client <client>` to clear a local bearer and expiry while preserving its client UUID. This command does not pair, launch, or revoke app state. Restart the agent server before requesting fresh consent. It supports dry-run and JSON output.

Use `install --client <client> [--dry-run]`, `uninstall --client <client> [--dry-run]`, or `doctor [--client <client>]`. Add `--json` for the desktop integration. Install and uninstall print only the VStudy entry. They preserve unrelated text, refuse conflicts and symlinks, save existing contents in a private adjacent backup, and replace configurations atomically. Dry-run creates nothing. Uninstall does not revoke grants or remove optional skills. Revoke access in VStudy.

## Pairing and recovery

Turn on **Settings > Agents** in VStudy. The first tool or resource read connects to `<userData>/mcp/bridge.sock` on Unix. On macOS the default userData is `~/Library/Application Support/@vstudy/desktop`. `VSTUDY_USER_DATA` selects an explicit development or test profile. It is a local filesystem path, never a school URL. Windows uses the shared SID-derived pipe endpoint and requires the authenticated connector described below.

If the Mac socket is absent or refuses connection, the CLI runs `/usr/bin/open -g -j -a 'VStudy Pro' --args --mcp-background` with bounded backoff and a launch cooldown. Windows resolves installed app metadata and uses native argv, then retries for up to 95 seconds after launch to allow P's 90-second ARM cold server startup. Linux requires the user to open the app. Permission or authentication failures do not trigger a launch.

Pairing begins and finishes on one connection. Compare the code on stderr with VStudy before approving. Discovery, help, install, and doctor do not pair. Doctor authenticates stored bearers through `list_accounts` on its existing ping connection, discards account content, and reports revoked, expired, disabled, or insufficient-scope results without launching the app. On Unix the per-client file `~/.config/vstudy-mcp/<client>.json` contains a random client UUID, an opaque local grant, and its expiry. The directory is 0700 and the file is 0600. Nothing reads a Moodle password, cookie, WS token, or autologin key.

Pairing polls `pair.finish` on the same connection when the app returns pending `DENIED`, until the advertised expiry. Core currently allows two minutes for pairing. Tool roundtrips allow 130 seconds for the core's 120-second whole-call bound, including its 60-second write approval window. Installed Claude Code, Codex, and agy entries allow 300 seconds per tool call, including initial pairing and a write approval. Desktop and Cursor timeout behavior still needs live-client acceptance.

A disconnected read may reconnect once. Writes never replay after a disconnect or timeout. Inspect pending and completed actions in VStudy before a new write request. Expired or revoked grants fail rather than silently broadening access. To pair again, stop the client server and run `vstudy-mcp reset --client <client>`. After restarting the server, the next tool call requests fresh consent. Reset does not revoke app state. The app replaces the previous grant for that persistent client UUID after the new consent succeeds.

## Contracts and modules

The app-owned [shared contract](../desktop/src/shared/mcp.ts) defines all 27 input schemas, risks, scopes, and the result union. It is unchanged by this package. `server.ts` publishes those schemas with the official MCP SDK. A successful result contains a fixed human summary plus `data.trust`, `data.notice`, provenance, content, an optional `data.redacted` flag, and a pagination cursor. `save_assignment_draft` replaces `submit_assignment` and saves only approved student text as a draft. Its result supplies an `open_in_app` target. Final assignment submission is always manual in Moodle. An error contains a fixed code, message, and hint. Raw bridge errors never enter stdio.

Resources use the same bridge tool calls and account checks:

- `vstudy://accounts/{account}/courses/{courseId}` invokes `get_course`.
- `vstudy://accounts/{account}/courses/{courseId}/modules/{moduleId}` invokes `get_module`.
- `vstudy://accounts/{account}/files/{fileId}` invokes `read_file`.

Resources accept optional `cursor` and `limit` query parameters. IDs are local UUIDs, never school URLs. Resource templates advertise these patterns. The resource list is empty because enumeration would initiate authorization during discovery.

Prompts are `plan-my-week`, `prepare-for-exam`, `catch-up`, and `summarize-announcements`. They treat school content as untrusted data, preserve provenance, and keep writes behind app approvals. They do not fetch content during prompt discovery.

`transport.ts` owns framing, response correlation, and a four-request queue matching the core bridge limit. `bridge.ts` owns lazy pairing and retry policy. `credentials.ts` owns the private identity. `client-config.ts`, `config-edit.ts`, and `installer.ts` own verified client paths, source-preserving edits, and file transactions.

## Desktop integration

`detectClients.command` is a quoted, actionable install command for display or copying. Execute installer APIs or argv arrays rather than passing that display string to a shell in main.

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
pnpm --filter @vstudy/mcp verify:core
```

`--core-root /absolute/path` selects an isolated extraction of a core commit. `--bin /absolute/path` and `--peer-helper /absolute/path` select packaged artifacts. This check uses the actual security engine and native same-UID verifier with a controlled backend. It verifies pending consent, one-shot finish, opaque cursors, approved writes, concurrent reads, restart, and disabled errors. It never connects to a school.

After building an app directory, run `pnpm --filter @vstudy/mcp verify:package`. It checks the actual resources, standalone CLI, and executable native helper outside ASAR. The release workflow runs this after packaging.

## Windows client support

Windows uses the parent-owned app-data and endpoint helpers. The bridge is a current-SID local named pipe, not a TCP socket. The SID comes from the native whoami resolver, not a client name. The client rejects remote pipe hosts and skips Unix filesystem checks for a named pipe. The app-data default is the native APPDATA namespace for `@vstudy/desktop`.

The local bearer lives under `%APPDATA%\@vstudy\mcp-clients`. On Windows, POSIX chmod modes do not establish privacy. `src/windows-acl.ts`, also exported as `@vstudy/mcp/windows-acl`, protects newly app-owned paths with a current-SID-only DACL and verifies owner and the complete DACL before private reads. It uses a constant PowerShell script with literal environment inputs. It does not alter existing client config-directory ACLs. Bearer files are staged in an already-private directory, and every newly created private file remains empty until enforcement succeeds. Missing or unsafe native enforcement fails closed.

Windows launch reads uninstall registry metadata or the known per-user Programs path and spawns the resolved executable with `--mcp-background`. It does not interpret uninstall commands or use a shell. `reset --client` clears a bearer under the same private-file rules and preserves the client UUID. Windows behavior has fixture coverage on macOS only. Native Windows ACL and transport acceptance has not run.

The desktop build dispatch wrapper is `apps/desktop/scripts/build-mcp-platform.mjs`. It skips the core-owned Unix C helper on Windows. The package wrapper is `apps/desktop/scripts/package-platform.mjs`, which invokes electron-builder through Node with host-specific targets. The Unix helper resource filter tolerates its absence on Windows. Packaged Windows verification reads `win*-unpacked/resources` and does not require the Unix helper. Stream P owns the Windows host, resource wiring, and persistence. These changes alone do not enable Windows MCP.

`pnpm --filter @vstudy/mcp verify:clients` probes installed client config readers in temporary homes. It does not start conversations or modify actual client configs. These explicit npm script entries also make both manual verification tools discoverable to knip.

### Windows authenticated connector

A predictable SID-derived pipe name does not authenticate the server. `src/connection.ts` now uses `createWindowsPipeConnector` from `src/windows-pipe.ts` by default. Its constant PowerShell script opens a .NET Framework pipe at Identification impersonation, then reads the owner and complete protected DACL from that same handle. The DACL must contain exactly a current-SID FullControl allow and a Network-SID FullControl deny. Foreign, inherited, callback, or unexpected ACEs fail closed. Windows checks additional server instances against this DACL, so an ordinary different user cannot become another server instance after verification.

Only then does the script emit its checked SID and start the raw relay. It consumes no client stdin before verification and keeps the verified handle without reconnecting. `ConnectionOptions.authenticatedPipe` retains the injection seam; explicit `null` disables it for fail-closed fixtures. Its optional AbortSignal cancels pending authentication and connected forwarding. Stream destruction closes the handle and owned process. Native errors become fixed diagnostics. A missing pipe is retryable; failed authentication is not.

The script uses built-in .NET Framework APIs without `Add-Type` or an assumption that `PipeOptions.CurrentUserOnly` exists. Microsoft's [GetAccessControl contract](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.pipestream.getaccesscontrol?view=netframework-4.8), [constructor overload](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipes.namedpipeclientstream.-ctor?view=netframework-4.8), and [pipe access rules](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) support this choice. Missing APIs fail closed. Portable tests cover byte withholding, malformed attestations, timeout, cancellation, and cleanup. `test/windows-pipe-native.test.ts` checks an actual protected pipe, server-observed Identification level, and foreign-ACE rejection on Windows. Those native cases skip on this Mac and require Windows CI. Stream P still supplies the server host, transport wiring, and app-state adapter.
