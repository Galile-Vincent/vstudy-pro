# MCP implementation handoff

The stdio package lets global agents read coursework and propose actions through VStudy's existing session. It holds only an opaque local bearer and imports no school transport or school credential store.

## Commits and ownership

| Commit | Change |
| --- | --- |
| `5d1b84b` | Official SDK server, shared tools, resources, prompts, installers, plugin assets and controlled SDK tests. |
| `4353103` | Authenticated doctor probe and actionable install commands. |
| `7bc5da0` | Windows configuration, launcher and ACL adapters, explicit grant reset, build dispatch, packaging and root checks. |
| `86a00ac` | Current-user Windows installation discovery precedes machine installations. |
| `2b5b088` | Same-handle Windows server authentication gate; manual verification scripts become npm entries for knip. |

The shared contract is unchanged from `728fab8`, with blob hash `40ed0533cccefef2495bfefb4f9aca116b5ea87c`. No website or root README changed. Shared build files touched are root `package.json`, `pnpm-lock.yaml`, `knip.json`, `.gitignore`, `apps/desktop/package.json`, and `.github/workflows/release.yml`.

Four parent-owned files were copied verbatim from `3141fa4` solely for compilation and remain untracked and unstaged: `shared/mcp-platform.ts`, `main/mcp/endpoint.ts`, `main/platform/app-data.ts`, and `main/mcp/errors.ts`, beneath `apps/desktop/src`. Integrate the owned commits onto the parent's interface commit; do not add these copies again. Parent reports main at `087318b`, desktop 0.2.2. This child retains version 0.2.0. Parent owns final package, CLI, server, verification and plugin version alignment.

## Integration boundaries

All 27 tools publish the fixed input schemas and result union through the official SDK. Success includes a human summary and an untrusted envelope with provenance. Errors retain known codes and discard raw diagnostics. Resources invoke the same scoped tools. Prompts treat course content as data.

The private client file is `{clientId, grant?, expiresAt?}`. Unix uses directory 0700 and file 0600. Windows uses the ACL adapter below. First tool or resource calls pair; discovery and administration do not. `pair.finish` polls pending JSON-RPC `DENIED` on the original connection until advertised expiry and consumes success once. Reads reconnect at most once; writes never replay. Closing cancels pending consent. Wire permits four active requests and 32 total queued requests. Public `mcp:<UUID>` cursors remain opaque.

Core advertises two-minute pairing and a 120-second whole-call limit, including 60-second proposal approval. Tool RPC permits 130 seconds. Documented Claude Code, Codex and agy entries permit 300 seconds, including initial consent. Desktop and Cursor timeout acceptance remains unverified.

Doctor pings and authenticates stored bearers with `list_accounts` on that same connection, discards account content, and distinguishes revoked/rejected, expired, disabled, unknown and unsuitable-scope grants. `SCOPE_REQUIRED` means the app recognized the bearer. Doctor never pairs, launches or updates credentials. `reset --client <kind>` clears only the local bearer and expiry, preserving UUID and private-file rules. It does not connect, pair, revoke app state or reset automatically on denial. Restart the server; its next tool call can request fresh consent.

`dist/installer.cjs` exports install, uninstall, backup restore, detection and doctor APIs without signature changes. `detectClients.command` is an actionable POSIX or PowerShell install command. Main should execute APIs or native argv rather than interpreting this display string. Use an absolute Node runtime; fused Electron cannot run this CLI as Node.

## Windows seams and acceptance gap

`src/paths.ts` consumes parent app-data and SID endpoint helpers. Endpoint shape is `{kind: 'unix' | 'named-pipe', path: string}`. Windows userData defaults to `%APPDATA%\@vstudy\desktop`. Fixed absolute `whoami.exe /user /fo csv /nh` argv supplies the actual SID, hashed by the shared helper to a 32-hex pipe identity. Windows never performs Unix lstat checks on the pipe.

**Default Windows transport fails closed.** Pipe names and server-side first-instance/DACL checks cannot authenticate a counterfeit server. `src/connection.ts` exports `AuthenticatedPipeConnector` and `ConnectionOptions.authenticatedPipe`, passed through `BridgeOptions.connection` to `Wire.connect`. The callback receives `{path, expectedServerSid, impersonationLevel: 'identification'}`. It must authenticate the actual server owner on the same handle before sending bytes, then return `{stream: Duplex, serverSid}` while retaining that handle. Destroying the stream must close the handle and any forwarder. Probe-then-reconnect is invalid. Missing connectors reject with `UNSUPPORTED` before bare Node connection or credential reads; SID mismatch destroys the stream without writes. Fixtures cover these cases and Identification-level inputs.

P must wire a secure native client connector for the CLI and administration transport. No client forwarder or PowerShell 5.1/.NET Framework capability assertion is bundled. Microsoft's [PipeOptions documentation](https://learn.microsoft.com/dotnet/api/system.io.pipes.pipeoptions) describes client-side server-user validation in `CurrentUserOnly`; [named-pipe impersonation documentation](https://learn.microsoft.com/en-us/windows/win32/ipc/impersonating-a-named-pipe-client) explains client control of impersonation. Actual Windows acceptance is required before enabling this path.

`src/windows-acl.ts`, exported by `@vstudy/mcp/windows-acl`, exposes `protectWindowsPath` and `verifyWindowsPath`. A constant encoded PowerShell script uses literal environment inputs and fixed native argv, never shell text. New app-owned private paths receive a current-SID-only protected DACL, removing inherited and foreign explicit ACEs. Reads verify owner and the complete DACL. New files remain empty until enforcement succeeds; bearer staging occurs inside an already-private directory. Existing user config-directory ACLs are never rewritten. Missing enforcement fails closed. Mac fixtures verify inputs, failures and write ordering; actual Windows ACL security is unverified.

Launcher order is HKCU uninstall metadata, known per-user Programs path, then legacy HKLM native/WOW6432Node metadata. It accepts exact VStudy Pro display metadata and actual `InstallLocation`/`DisplayIcon` executable paths, never `UninstallString` or arbitrary command parsing. Fallback is `%LOCALAPPDATA%\Programs\VStudy Pro\VStudy Pro.exe`. Native spawn uses only `--mcp-background`, with `shell: false`. Custom HKCU paths, precedence and quoting have fixtures. All five Windows config paths use USERPROFILE/APPDATA and have fixture coverage. Installed Windows parsing and launch remain unverified. Exact mappings and official sources are in [CLIENT_FORMATS.md](../../../apps/mcp/CLIENT_FORMATS.md).

## Build and package integration

`apps/desktop/scripts/build-mcp-platform.mjs` invokes core-owned root `scripts/build-mcp-peer.mjs` on Unix and skips it on win32. P owns Windows host resources and persistence. `apps/desktop/scripts/package-platform.mjs` invokes electron-builder through Node with host-specific targets. Desktop builds MCP before bundling; root build/package route through desktop without recursion.

Unix helper is executable at `Resources/mcp-peer` outside ASAR. MCP is under `Resources/mcp/dist`, assets under `Resources/mcp/plugins`. The resource filter tolerates a missing Unix helper on Windows. `verify:package` inspects actual Mac app resources or `win*-unpacked/resources`; Windows fixtures do not require a Unix helper and do not certify P's host. Assisted NSIS uses `oneClick=false`, `allowElevation=false`, `perMachine=false`. Release checks validate CLI before packaging and actual resources afterward.

## Verification and artifacts

Final checks at `2b5b088`, with only documentation edits afterward:

- Root `pnpm security:check` passes: 108 MCP tests across 11 files and 997 desktop tests with 14 skipped. Root lint passes. The accepted advisory baseline has no unreviewed entries; three pre-existing Electron lint warnings remain. Every Vitest invocation uses `--pool=forks --maxWorkers=2`.
- Root `pnpm typecheck` and `pnpm knip` pass. `verify:clients` and `verify:core` explicitly register both manual scripts, resolving the parent's unused-file failures.
- Frozen-lockfile install with scripts disabled and direct `electron-vite build` passed earlier. No Electron process was launched.
- Unsigned Mac app-directory packaging passes. `verify:package` checks current CLI, installer, Windows ACL bundle, hidden plugin manifests, skills and executable helper outside ASAR.
- Official SDK tests against the packaged CLI pass 12 stdio cases covering schemas, tools, resources, prompts, reconnects and uncertain writes.
- `verify:core` passes against actual source extracted from `b333505`, using packaged CLI and native same-UID helper with controlled backend. It covers pending `DENIED`, one-shot finish, public/private cursors, eight queued reads, approved writes, restart, disabled JSON-RPC errors, doctor revocation/expiry/scope probes, reset and fresh consent.
- Installed Claude Code 2.1.318, Codex 0.166.0 and agy 1.4.12 accept generated entries through isolated config readers. Claude Code and agy strict plugin validators pass. All 17 bundled skills pass skill-creator validation. Actual private config syntax/counts were inspected without printing contents. Claude Desktop and Cursor were unavailable. No actual client config changed or live conversation launched.

Final artifact commands:

```sh
pnpm --filter @vstudy/mcp verify
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @vstudy/desktop exec electron-builder --mac dir --publish never -c.mac.notarize=false -c.mac.identity=null
pnpm --filter @vstudy/mcp verify:package
pnpm --filter @vstudy/mcp verify:core --core-root /Users/vc/.t3/worktrees/vstudy-pro/t3-531641e7/apps/mcp/node_modules/.cache/core-fixture --bin '/Users/vc/.t3/worktrees/vstudy-pro/t3-531641e7/apps/desktop/release/mac-arm64/VStudy Pro.app/Contents/Resources/mcp/dist/vstudy-mcp.cjs' --peer-helper '/Users/vc/.t3/worktrees/vstudy-pro/t3-531641e7/apps/desktop/release/mac-arm64/VStudy Pro.app/Contents/Resources/mcp-peer'
VSTUDY_MCP_TEST_BIN='/Users/vc/.t3/worktrees/vstudy-pro/t3-531641e7/apps/desktop/release/mac-arm64/VStudy Pro.app/Contents/Resources/mcp/dist/vstudy-mcp.cjs' pnpm --filter @vstudy/mcp exec vitest run test/stdio.test.ts --pool=forks --maxWorkers=2
```

| Final artifact | SHA-256 |
| --- | --- |
| Standalone and packaged CLI | `ea5cf6e4c281c40ed75d980b426ebbd651d7a83815249a489af8c3c51c9e57ae` |
| Installer API | `0b955066ca417349bb93c784f5fb1a4ad6d7317e83d3e4d466af6f0d4257382d` |
| Windows ACL API | `b1e0ab7ccdb2e6d68d997a9f9350aefd6c816857c3a7c7abecccf7ce0c2e169f` |
| Packaged Unix peer helper | `4698fd1e0e78a194ae56d43bc10343253da1dc2900d5f31f46618185bf36b8aa` |

Logs beside this report retain command output. `root-build.txt` records the expected failure because this child base lacks core's root native build script. The wrapper reaches that exact path; parent owns the missing integration. Packaging used the helper compiled from actual core source in an ignored cache. This child does not claim a successful full root build/package.

Parent separately reports actual Electron-backed SDK acceptance. Live schools, live client conversations, Windows native acceptance, URI-redaction fixes and final version alignment remain parent-owned. No independent review is claimed and no child agents were spawned.

Model the Domain kept tool schemas and risks in the shared registry. Boundary Discipline kept validation at socket, file, config and SDK boundaries. Prove It Works required real bundled and packaged CLI checks with actual core/native code. Implementation and verification stayed in-thread under the no-children constraint.
