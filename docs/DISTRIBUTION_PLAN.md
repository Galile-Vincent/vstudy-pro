# Cross-platform distribution plan

## Goal and acceptance

A student downloads an installer directly from the website on macOS or Windows, installs per user, and launches without signing credentials. Adding valid signing secrets changes the same release workflow to signed builds. A public tag publishes a release, stable installer aliases, versioned archives, update metadata, and checksums.

Acceptance requires real GitHub-hosted macOS and Windows packaging runs. The packaged smoke must create a window, exercise SQLite, probe converter availability without an implicit download, and exit successfully. Unit tests on a Mac alone do not verify Windows. Signing remains unverified until the owner supplies credentials.

## Existing architecture

Electron main owns lifecycle, paths, SQLite, credentials, native chrome, converter processes, and provider processes. Preload exposes validated IPC to a sandboxed renderer. SQLite is bundled `node:sqlite`, not an external native addon. Python is provisioned on demand after consent. Codex uses a verified macOS kernel sandbox. Safe storage is lazy and requires explicit unlocking after restart.

The existing builder produces host-architecture Mac packages. Its afterPack hook assumes a Mac bundle and calls codesign. The release workflow uses macos-14, publishes drafts, and has no Windows verification. The website currently links to the releases page. GitHub reports the repository PUBLIC as of this work.

## Decisions and alternatives

- Use electron-builder with explicit targets. The first cross-platform publication includes Mac arm64 DMG and ZIP, and Windows x64 per-user NSIS EXE and portable ZIP. Intel Mac and Windows ARM64 remain qualification candidates. Dry runs build all four on matching hosted runners. Do not claim an architecture works until its full converter and packaged launch checks pass.
- Keep publication scope in `apps/desktop/distribution-targets.json`. `releaseEnabled` controls tag builds, assembly, public URL checks, and the website's installer links. A candidate stays visibly planned without a download link. Enabling a qualified target changes that flag, followed by the three README and guide updates. No workflow rewrite is needed. Qualification artifacts cannot pass the publication gate.
- Prefer native Windows title bars and system window controls. Preserve Mac chrome and vibrancy. Do not add custom minimize or close IPC merely to imitate Mac controls.
- Keep API providers available on both systems. Disable Codex CLI outside macOS before probing or launching it and explain the unavailable kernel sandbox in all three languages. Resolve native Windows Claude and Antigravity executables without invoking arbitrary shell scripts.
- Keep Electron's existing userData namespace to preserve installations. Windows uses Electron's per-user AppData location and DPAPI safeStorage. Explain the OS-specific unlock behavior without implying a Windows Keychain dialog.
- Keep native paths native internally. Validate portable archive names independently of host OS with both POSIX and Windows semantics. Reject traversal, alternate streams, reserved device names, and case-colliding archive entries. Realpath containment remains required at filesystem boundaries.
- The converter has a scrubbed environment on all systems. macOS additionally denies network with sandbox-exec. Windows has no equivalent kernel network deny in this implementation. Offline mode and Python socket interception are not an OS security boundary. Disclose that limit in UI and docs.
- Preserve Electron's macOS 12 launch minimum while disclosing the converter's newer dependencies. Full conversion targets macOS 14+ on Apple silicon and 13+ on Intel. Use a universal hashed Python lock, pin the last Intel ONNX wheel, and build current cryptography against hash-pinned static OpenSSL on Intel CI. Keep a separate hashed build-tool lock and package the wheel plus its hash overlay. Do not downgrade cryptography to older available wheels with published advisories. Windows ARM64 keeps native Electron and SQLite, and runs supported x64 Python through Windows 11 emulation.
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

Stream M owns `shared/mcp-platform.ts`, `main/mcp/transport.ts`, endpoint resolution, lifecycle, protocol, and engine. P owns `resources/mcp/windows-pipe.ps1` and the Windows server adapter. The endpoint is `\\.\pipe\vstudy-<32-hex-SID-hash>`. The approved PowerShell/.NET host creates a protected DACL allowing only the current SID, rejects remote clients and an existing pipe owner, then verifies the peer SID before forwarding any bytes to the shared JSON parser. Clients use the same four-byte big-endian length prefix and 1 MiB frame maximum as Unix. The helper's parent protocol is bounded `ready`, `open`, `data`, and `close` lines carrying base64 chunks.

M's SDK owns a same-handle authenticated Windows connector and Identification-level impersonation, current-user ACLs for bearer state, and the hidden platform launcher. It must verify the connected server SID before sending credentials. A plain `net.connect` fallback is not sufficient. Missing native adapters fail closed. M lands first, then P merges main and wires platform selection to the existing factory and engine. The ordinary NSIS path uses `FOLDERID_UserProgramFiles` with a `%LOCALAPPDATA%\Programs` fallback, while an existing HKCU install location may override it. CLI discovery must honor that override.

## Workflow and verification sequence

1. Commit this plan and audit the current architecture and macOS assumptions.
2. In parallel, implement packaging and release CI, and the isolated download UI and installation/signing docs. Keep workers on separate worktrees and disjoint files.
3. Port runtime paths, CLI/converter discovery, credential copy, native chrome, shortcuts, and the MCP transport boundary. Verify targeted tests after each unit, then typecheck and lint.
4. Integrate workers and merge current main. Validate workflows with actionlint. Run the complete unit and security suite with at most two Vitest fork workers.
5. Push only the owner-authorized temporary `ci/cross-platform-dryrun` branch to trigger a nonpublishing release build from its own workflow. Later, `workflow_dispatch` with `dry_run: true` provides the same unsigned behavior. Inspect actual logs and artifact smoke reports. Fix failures and repeat as needed. Dry runs receive no signing secrets and never upload to Releases. Delete the temporary remote branch after verification. Never push main or create tags during implementation.
6. Record verified OS and architectures, run URLs, signing gaps, and exact MCP and website merge points. Hand the coordinator reviewable commits. No merge or production release is authorized by this implementation task.

## Throughput checkpoint

There are four build targets, three CI operating systems, three documentation languages, and two parallel-stream seams. The risky unknowns are hosted Windows packaging, native converter/CLI discovery, portable restore paths, and Windows ARM64 tool availability. The implementation coordinator handles runtime code. At most two delegated workers handle independent CI/packaging and downloads/docs. One Electron runs locally at a time. CI performs architecture packaging and Windows launch checks.

## Risks and rollout

Unsigned Mac builds can trigger Gatekeeper and unsigned Windows builds can trigger SmartScreen. Users must verify the checksum and trust the source before overriding either. Signing removes unsigned status but reputation can still take time. The installer must never request elevation or replace another user's data. Windows long-path limits vary with OS policy and third-party Python tools. ARM64 depends on hosted runner availability and Electron/NSIS support. Keep failures visible rather than shipping an untested label.

Windows flushes file data through writable handles but has no matching directory fsync operation in this implementation. Do not claim the same directory-metadata power-loss durability as Mac. Python has no POSIX resource limits on Windows, and process-tree cleanup depends on the leader remaining alive for taskkill. The hosted pipe test can inspect the kernel ACL and test the same user, but cannot impersonate an independent ordinary account without that account's credentials. An administrator is outside the cross-user isolation claim. Minimum OS versions follow declared native dependency requirements; the hosted image alone does not verify every older supported OS release.

The first rollout is a successful dry run with retained unsigned artifacts. Publish Apple silicon Mac and Windows x64 first. Intel Mac and Windows ARM64 remain planned until their complete converter, package, install where applicable, and launch checks pass. Do not offer a Markdown/TXT-only installer as the ordinary product. PDF and Office imports are central to student use. Such a restricted preview would require a separate product decision, import controls, localized limitations, and recovery guidance.

The next owner-approved tag publishes release notes from docs/releases/<version>.md and checks the enabled stable URLs. Later credentials enable signing without changing targets or workflow structure. The owner validates signatures on real downloaded artifacts before describing them as signed. Auto-update is a separate subsequent change.
