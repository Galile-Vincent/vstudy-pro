# Cross-platform distribution plan

## Goal and acceptance

A student downloads an installer directly from the website on macOS or Windows, installs per user, and launches without signing credentials. Adding valid signing secrets changes the same release workflow to signed builds. A public tag publishes a release, stable installer aliases, versioned archives, update metadata, and checksums.

Acceptance requires real GitHub-hosted macOS and Windows packaging runs. The packaged smoke must create a window, exercise SQLite, probe converter availability without an implicit download, and exit successfully. Unit tests on a Mac alone do not verify Windows. Signing remains unverified until the owner supplies credentials.

## Existing architecture

Electron main owns lifecycle, paths, SQLite, credentials, native chrome, converter processes, and provider processes. Preload exposes validated IPC to a sandboxed renderer. SQLite is bundled `node:sqlite`, not an external native addon. Python is provisioned on demand after consent. Codex uses a verified macOS kernel sandbox. Safe storage is lazy and requires explicit unlocking after restart.

The existing builder produces host-architecture Mac packages. Its afterPack hook assumes a Mac bundle and calls codesign. The release workflow uses macos-14, publishes drafts, and has no Windows verification. The website currently links to the releases page. GitHub reports the repository PUBLIC as of this work.

## Decisions and alternatives

- Use electron-builder with explicit targets. Mac arm64 and x64 each ship DMG and ZIP. Windows x64 and arm64 each ship per-user NSIS EXE and portable ZIP. Each architecture builds on a matching hosted runner when available. Do not claim an architecture works until its packaged launch passes.
- Prefer native Windows title bars and system window controls. Preserve Mac chrome and vibrancy. Do not add custom minimize or close IPC merely to imitate Mac controls.
- Keep API providers available on both systems. Disable Codex CLI outside macOS before probing or launching it and explain the unavailable kernel sandbox in all three languages. Resolve native Windows Claude and Antigravity executables without invoking arbitrary shell scripts.
- Keep Electron's existing userData namespace to preserve installations. Windows uses Electron's per-user AppData location and DPAPI safeStorage. Explain the OS-specific unlock behavior without implying a Windows Keychain dialog.
- Keep native paths native internally. Validate portable archive names independently of host OS with both POSIX and Windows semantics. Reject traversal, alternate streams, reserved device names, and case-colliding archive entries. Realpath containment remains required at filesystem boundaries.
- The converter has a scrubbed environment on all systems. macOS additionally denies network with sandbox-exec. Windows has no equivalent kernel network deny in this implementation. Offline mode and Python socket interception are not an OS security boundary. Disclose that limit in UI and docs.
- Stable assets are `VStudy-Pro-mac-arm64.dmg`, `VStudy-Pro-mac-x64.dmg`, `VStudy-Pro-win-x64.exe`, and `VStudy-Pro-win-arm64.exe`. Also retain versioned copies. Stable filenames work before and after signing. Unsigned status belongs in release notes, artifact labels, and build provenance, so adding secrets never breaks download URLs.
- Emit electron-builder update metadata now. Do not activate auto-update until signing, notarization, feed validation, rollback policy, and user controls are ready.
- Isolate website download detection and asset inventory in a small component and configuration. Mac defaults to Apple silicon and visibly offers Intel. Windows architecture uses high-entropy userAgentData when available, with x64 as fallback. Offer every installer and checksums without JavaScript.

## Signing matrix

| Platform | No secrets | Credentials present | Invalid or partial credentials |
| --- | --- | --- | --- |
| macOS | Ad-hoc bundle for hardened fuses, no Developer ID, no notarization | Developer ID using CSC_LINK and CSC_KEY_PASSWORD; notarize with Apple API key or Apple account credentials | Fail rather than silently distribute unsigned |
| Windows | Unsigned per-user NSIS and portable ZIP | Azure Trusted Signing, PFX via WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD, or explicit signtool signing hook for cloud HSM | Fail rather than silently distribute unsigned |

Mac notarization accepts APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER, or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID. Windows Azure accepts AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, endpoint, account, and certificate profile. Document exact names and setup in SIGNING.md. SignPath Foundation is an application-based option for public open-source projects. A valid signature does not guarantee immediate SmartScreen reputation.

## MCP stream merge contract

Stream M owns apps/mcp and main/mcp lifecycle and RPC. Stream P owns a separate main/platform bridge transport contract. The contract selects a user-scoped Unix socket or `\\.\pipe\vstudy-<user-hash>` and describes a detached hidden launch. The Windows implementation must fail closed until a server creates the pipe with a current-user SID-only ACL. Node net.listen alone does not supply that ACL. P provides the stub and tests, not an insecure live named-pipe server. M must call this interface rather than duplicate socket or launch assumptions. Detailed merge points will accompany implementation.

## Workflow and verification sequence

1. Commit this plan and audit the current architecture and macOS assumptions.
2. In parallel, implement packaging and release CI, and the isolated download UI and installation/signing docs. Keep workers on separate worktrees and disjoint files.
3. Port runtime paths, CLI/converter discovery, credential copy, native chrome, shortcuts, and the MCP transport boundary. Verify targeted tests after each unit, then typecheck and lint.
4. Integrate workers and merge current main. Validate workflows with actionlint. Run the complete unit and security suite with at most two Vitest fork workers.
5. Push this branch and dispatch a nonpublishing release build on public GitHub-hosted macOS and Windows runners. Inspect actual logs and artifact smoke reports. Fix build failures and repeat as needed. Never publish a release during a dry run.
6. Record verified OS and architectures, run URLs, signing gaps, and exact MCP and website merge points. Hand the coordinator reviewable commits. No merge or production release is authorized by this implementation task.

## Throughput checkpoint

There are four build targets, three CI operating systems, three documentation languages, and two parallel-stream seams. The risky unknowns are hosted Windows packaging, native converter/CLI discovery, portable restore paths, and Windows ARM64 tool availability. The implementation coordinator handles runtime code. At most two delegated workers handle independent CI/packaging and downloads/docs. One Electron runs locally at a time. CI performs architecture packaging and Windows launch checks.

## Risks and rollout

Unsigned Mac builds can trigger Gatekeeper and unsigned Windows builds can trigger SmartScreen. Users must verify the checksum and trust the source before overriding either. Signing removes unsigned status but reputation can still take time. The installer must never request elevation or replace another user's data. Windows long-path limits vary with OS policy and third-party Python tools. ARM64 depends on hosted runner availability and Electron/NSIS support. Keep failures visible rather than shipping an untested label.

The first rollout is a successful dry run with retained unsigned artifacts. The next owner-approved tag publishes release notes from docs/releases/<version>.md and checks stable URLs. Later credentials enable signing without changing targets or workflow structure. The owner validates signatures on real downloaded artifacts before describing them as signed. Auto-update is a separate subsequent change.
