# Distribution verification

Goal: direct installer downloads for Mac and Windows, with unsigned builds today and automatic signing after complete credentials are supplied. Implementation remains on `t3/cross-platform`. No production tag, release, main push, or live provider conversation is part of this verification.

## Publication scope

The approved first release enables Apple silicon Mac and Windows x64. Intel Mac and Windows ARM64 remain planned in `apps/desktop/distribution-targets.json`. Qualification runs build all four; publication builds only enabled targets. A qualification manifest cannot be published. The website shows planned architectures without active installer links.

PDF and Office imports remain part of the product. A Markdown/TXT-only fallback is not presented as a complete installer. Intel uses current cryptography built from hash-pinned source with static OpenSSL; runtime installs accept binary wheels only. Windows ARM64 requests x64 Python under Windows 11 emulation. Neither candidate is enabled by a source-only test.

## Hosted native evidence

| Target | Evidence | Result and limits |
| --- | --- | --- |
| Mac arm64 | [42168618179](https://github.com/ava-apple/vstudy-pro/actions/runs/42168618179), source `5641e55` | DMG/ZIP, real hardened app window, renderer, SQLite durability/integrity, converter availability, staging/upload passed. Predates M/C integration. Keychain untouched. |
| Mac x64 | [42163956595 / job 127716031927](https://github.com/ava-apple/vstudy-pro/actions/runs/42163956595/job/127716031927), source `2a5bd6d` | Full 11-case converter integration, native cryptography wheel/hash/linkage checks, DMG/ZIP, hardened app window/SQLite, staging/upload passed. Remains a qualification candidate. [Summary](intel-native-smoke.json). |
| Windows x64 | [42168618179 / job 127731257599](https://github.com/ava-apple/vstudy-pro/actions/runs/42168618179/job/127731257599), source `5641e55` | NSIS and ZIP built. Assisted per-user install, Start menu shortcut, installed EXE launch, and uninstall passed under a restricted non-admin token. Window/renderer, SQLite durability/integrity, async DPAPI round-trip with ciphertext zeroed, and three-language settings/Ctrl/lazy storage checks passed. Predates M/C integration. [Summary](windows-x64-native-smoke.json). |
| Windows ARM64 | [42168618179](https://github.com/ava-apple/vstudy-pro/actions/runs/42168618179), source `5641e55` | Converter cases ran using verified AMD64 Python. Cleanup and an ACL inspection fixture failed. No installer success is claimed. |
| Windows cross-user pipe isolation | [42167005272](https://github.com/ava-apple/vstudy-pro/actions/runs/42167005272), source `ada6be2` | A disposable ordinary local user with a distinct interactive SID was denied minimal read, write, and duplex access by the Windows kernel. Account removal was verified. [Report](windows-pipe-isolation.json). Administrators remain outside the isolation claim. |
| Windows production SDK connector | [42170046285 / job 127735490398](https://github.com/ava-apple/vstudy-pro/actions/runs/42170046285/job/127735490398), source `16eed21` | Both native connector cases passed: byte round-trip with Identification-level peer identity, and rejection of a connected pipe with a foreign allow ACE before sending client bytes. The overall job failed on separate SDK file-ACL/timeout tests. |

Integrated qualification is being rerun after merging main `75cc2c6` at `183515f`. Windows server/state wiring is `330d43b`, native terminal verification is `726be20`, MCP-off/on installer gates are `2bd55ec`, and the SDK ACL environment fix is `7932603`. Current runs: [CI 42170686410](https://github.com/ava-apple/vstudy-pro/actions/runs/42170686410), [distribution 42170686466](https://github.com/ava-apple/vstudy-pro/actions/runs/42170686466). The Windows CI SDK stage passed with real standalone CLI installers, the stripped-environment protected-file fixture, and both native connector cases. Desktop native engine/host acceptance and packaging are still running; their results must be recorded before declaring integrated acceptance complete. Coordinator-owned C/M2 security fixes require a final main merge and checks.

## What the native gates assert

The normal installed executable is `%LOCALAPPDATA%\Programs\VStudy Pro\VStudy Pro.exe`, with the known-folder and existing HKCU install-location behavior documented in the plan. The installer test uses `/S /currentuser`, refuses an existing installation, drops an enabled Administrator token, verifies non-admin membership, and launches the actual installed EXE. It does not substitute an unpacked source app for that EXE.

The hardened launch keeps RunAsNode and inspector fuses disabled. Reports require a real renderer and nonempty window capture, SQLite write/read/reopen/integrity, native node-pty command round-trip for the target architecture, and Windows DPAPI. Mac Keychain stays unprobed. Converter resources, tool availability, Intel wheel integrity, and the ARM Python request are checked. Full PDF/Office conversion runs separately in the real source integration suite after explicit fixture consent; the packaged probe never claims to have converted a document or implicitly bootstrapped Python.

Windows installer acceptance now launches sequentially with MCP off and with protected enabled state present before startup. The enabled launch waits for the trusted `mcp:enable` IPC and checks `mcp:state`. Staging validates both complete smoke reports, their version/architecture/native dependency results, and the non-admin installation report.

The server adapter uses M's `protocol.ts` and `engine.ts`. Its host creates a protected current-SID DACL before accepting peers, rejects network clients, verifies the connected SID before forwarding bytes for JSON parsing, and bounds frames/connections/queues/timeouts. A native test connects the production SDK client, pairs, approves and reads through the shared engine, checks protected state without a bearer in it, round-trips fragmented Unicode, rejects oversized frames before dispatch, and verifies host survival and shutdown. Its hosted result is still pending.

## Local commands and results

On the local Apple silicon Mac, after the M/C merge:

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm security:static`, `pnpm vendor:check`, and `pnpm knip` passed. Security lint retains three existing warnings; no errors. Knip reports one configuration hint, no unused-file/dependency failure.
- The pre-push hook ran `pnpm test --pool=forks --maxWorkers=2`: 1,429 desktop tests passed, 18 skipped; 130 MCP tests passed before the additional native ACL fixture/policy test. Native Windows cases are skipped locally.
- `pnpm --filter @vstudy/desktop test:release`: 17 tests passed. These cover credential completeness, unsigned secret removal, tag/branch gates, target scope, metadata/checksums, smoke rejection, native terminal/MCP reports, and publication refusal.
- `actionlint .github/workflows/ci.yml .github/workflows/release.yml` passed. Actions are pinned to commit SHAs; only the gated publish job has write permission.
- `pnpm --filter @vstudy/website build` and `verify:static`: 52 pages, 2,668 links, zero failures. README checks cover 152 local links across four files.
- `node apps/desktop/e2e/website-download.mjs`: 12 installed-Chrome cases passed across three languages. Six enabled recommendations produced a download from synthetic installer responses; six planned-target cases had no link. [Report](website-download-browser.json). This does not verify a public GitHub installer URL.

No local Electron was launched during the resumed integration work. Native CI performs packaging and Windows UI checks. Large captures and logs remain Actions artifacts; small JSON summaries are committed here.

## Cancelled original main/tag runs

The original [main run 42158439018](https://github.com/ava-apple/vstudy-pro/actions/runs/42158439018) and [v0.2.2 run 42154047535](https://github.com/ava-apple/vstudy-pro/actions/runs/42154047535) were rejected before a runner or step was assigned. Both check annotations say `The configuration 'macos-14-arm64-us-default' is not supported`. See [main annotation](cancelled-main-annotation.json) and [tag annotation](cancelled-tag-annotation.json). This is direct evidence of an unsupported runner configuration; billing or repository privacy is not inferred as the cause. Current public-repository runner labels have executed real Mac and Windows jobs. Rerunning an old tag retains its old workflow; do not move that tag.

The superseded unsigned branch run 42170046286 was explicitly cancelled after Windows SDK tests and the cold Mac compiler fixture failed, freeing its concurrency slot for the corrected run. That cancellation is separate from the original main/tag rejection.

## Remaining limits and rollout

Real signing, Apple notarization/stapling, Windows publisher reputation, SmartScreen, Gatekeeper on a quarantined download, clean consumer machines, and every minimum supported OS version remain unverified. No signing secrets were used by a branch/dry run. Windows converter network interception is a Python policy, not a kernel sandbox; resource limits and directory-metadata durability are weaker than on Mac. A trusted uv or compatible Python installation is still a documented prerequisite. Windows MCP requires usable Windows PowerShell/.NET; managed-device policies can make it unavailable, and it must fail closed without blocking the rest of the app.

The owner supplies signing accounts/credentials using [SIGNING.md](../../SIGNING.md), reviews the final source and results, chooses the next version and release notes, and authorizes the production tag. Publish and verify the enabled stable URLs before the main/Pages deployment advertises them. The current published release predates these stable aliases, so public HTTP-200 checks cannot pass before that owner-approved release. The workflow enforces those checks after publication. Automatic updates remain a separate change after signing.

M merge points: `shared/mcp-platform.ts` adds optional `closed`; `main/mcp/transport.ts` selects the Windows factory; `main/index.ts` injects real Windows persistence; `runtime.ts` drops a lost host and requires explicit re-enable. M's framing, engine, grants, launcher and SDK identity model are retained. The new Windows adapter files and resource scripts are P-owned. C/M2 changes must preserve these seams.

Dispatch ledger: the two earlier workers delivered CI/packaging and isolated downloads/signing/docs on separate worktrees. Their commits are integrated. No additional subagents were started for the resumed work. Model the Domain shaped the shared target registry; Boundary Discipline shaped credential, ACL and publication gates; Prove It Works kept native evidence separate from source checks and signing claims.
