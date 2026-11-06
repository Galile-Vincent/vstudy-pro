# Cross-platform distribution handoff

Students need a direct download of the correct Mac or Windows installer. The implementation supports unsigned builds now and selects signing when complete credentials are supplied. The approved first publication targets are Apple silicon Mac and Windows x64.

The application source is `04003c0bbc0e8f5967899278de32b7a3cbca7c66`, including main `0f783318`, M/M2, C's completed setup flow, and W4. Installer verification uses `002070ba14de05f00fccb3d24bee62af55c779f6`. That commit changes only the Windows harness and focused workflow. Documentation changes after it do not change the application.

## Decisions and implementation

- [DISTRIBUTION_PLAN.md](../../DISTRIBUTION_PLAN.md) records the decisions, risks, signing matrix, and rollout. `distribution-targets.json` controls the build matrix, publishable targets, stable aliases, and website choices. Intel Mac and Windows ARM64 remain planned.
- Mac targets build DMG and ZIP. Windows targets build assisted per-user NSIS and portable ZIP, with no elevation, a Start-menu shortcut, and an uninstaller. Stable aliases survive the later switch to signing. Versioned copies and genuine builder update feeds are retained.
- [SIGNING.md](../../SIGNING.md) covers Apple accounts, Developer ID/P12 export, notarization credentials, Windows Azure signing, PFX and reviewed HSM hooks, SignPath, secret setup/rotation, verification commands, and a future updater plan. Automatic updates are not active.
- Complete credentials select signing. Missing credentials produce unsigned builds. Partial or conflicting credentials fail. Branch and dry-run jobs do not receive signing secrets or publish. Only the gated stable-tag job can create a public release.
- Windows uses native window controls, platform keyboard labels, DPAPI storage copy, Windows paths, and platform process commands. Isolated Codex chat remains Mac-only with a localized explanation. API providers and supported manual CLI flows remain available.
- Converter setup supports Windows executable paths and persistent managed Python outside temporary bootstrap directories. Intel cryptography 50.0.2 is built from hash-pinned source with static OpenSSL; its Mach-O dependency checks distinguish its own dylib identity from external linkage.
- The isolated Download component and config choose direct stable GitHub URLs using platform/architecture detection. The planned targets have no active installer links. READMEs, getting-started pages, and signing/release instructions cover all three languages.

## Native results by target

| Target and scope | Build | Install and launch | Native and converter evidence | Run |
| --- | --- | --- | --- | --- |
| Mac arm64, first publication | DMG and ZIP passed | Packaged bundle launched. DMG mount/drag was not automated. | Window/renderer, SQLite write/reopen/integrity, native node-pty, converter resource/tool probe passed. Full source converter suite passed. Keychain untouched. | [127774787770](https://github.com/ava-apple/vstudy-pro/actions/runs/42182355366/job/127774787770) |
| Mac x64, planned | DMG and ZIP passed | Packaged bundle launched. DMG mount/drag was not automated. | Same native checks passed. All 11 source converter cases and the supplemental wheel/hash/linkage checks passed. Wheel minimum macOS is 13.0. | [127774787852](https://github.com/ava-apple/vstudy-pro/actions/runs/42182355366/job/127774787852) |
| Windows x64, first publication | NSIS and ZIP passed | Actual installed EXE launched twice under a restricted non-admin token. Start menu, protocol registration, and uninstall passed. | SQLite, async DPAPI with ciphertext cleared, native node-pty, UV availability, three-language settings/Ctrl/lazy storage checks passed. Saved MCP opt-in restored a hidden production-client bridge. Full source converter suite passed separately. | [127782091530](https://github.com/ava-apple/vstudy-pro/actions/runs/42184671424/job/127782091530) |
| Windows ARM64, planned and unqualified | NSIS and ZIP built. Separate native-addon rebuild and Electron terminal round-trip passed. | Failed before app launch. The installer returned without the EXE at the expected default path. Location, timing, and installer selection need diagnosis. | No installed-app, DPAPI, hidden MCP startup, UI, or staged-asset claim. The native-addon proof does not qualify an installer. | [127782091859](https://github.com/ava-apple/vstudy-pro/actions/runs/42184671424/job/127782091859) |

The Mac jobs used `macos-latest` arm64 and `macos-15-intel`. Windows used `windows-latest` x64 and `windows-11-arm`. These are hosted runner checks, not clean consumer-machine or minimum-OS qualification.

Small reports are [Mac arm64](mac-arm64-native-smoke.json), [Intel Mac](intel-native-smoke.json), [Windows x64](windows-x64-native-smoke.json), and [Windows ARM64 failure](windows-arm64-qualification.json). Large captures and process logs are Actions artifacts. The Windows settings captures show DPAPI copy and Ctrl labels in English, Traditional Chinese, and Japanese. Native probes did not unlock Mac Keychain or use real account secrets.

## Staged files and checksums

These are unsigned 0.2.2 qualification builds. They have not been uploaded to a GitHub Release. The hashes below come from the successful CI staging inventory. Downloaded metadata files were rehashed locally. Complete binary downloads were not rehashed locally.

| Target | Stable installer | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Mac arm64 | `VStudy-Pro-mac-arm64.dmg` | 123600370 | `2e990bbe0c035f1a839dc32e34ab2db8f48716f6bc66f7463343b5b3d3643717` |
| Mac x64 | `VStudy-Pro-mac-x64.dmg` | 134483909 | `71c5421bc46c6590e049d9059d06e410ba29d9baa1b852d3e194c9847e1a8d30` |
| Windows x64 | `VStudy-Pro-win-x64.exe` | 111704208 | `76974fde78998f5ffc27a33b423544ed6a11c49b1f36f5bd506328fbcfd7bdaa` |
| Windows ARM64 | Not staged or qualified | | |

Each successful target also staged its versioned installer, `VStudy-Pro-0.2.2-<target>.zip`, blockmaps, and architecture-specific builder YAML. Mac arm64 supplies `latest-mac.yml`; Windows x64 supplies `latest.yml`. [staged-assets.json](staged-assets.json) lists every staged name, size, and SHA-256 with its source/run. [CI-ASSET-SHA256SUMS.txt](CI-ASSET-SHA256SUMS.txt) preserves those inventory hashes and the downloaded provenance/build-note hashes.

The global release `SHA256SUMS.txt` is generated by the tested assembly helper. Global assembly/publication did not run in the failed four-target qualification matrix. The corrected Windows-only job passed individual staging. The actual tag pipeline builds only the two enabled publication targets.

## Commands and verification

- [Full CI 42182316342](https://github.com/ava-apple/vstudy-pro/actions/runs/42182316342) passed on Mac, Windows, and Ubuntu, including typecheck, lint, unit tests, security/vendor checks, build, website checks, and knip.
- Normal pre-push hooks passed `pnpm test --pool=forks --maxWorkers=2`: 132 MCP tests with three skips, and 1,531 desktop tests with 19 skips on the local Apple silicon Mac. No hooks were bypassed.
- [Focused Windows CLI 42181539099](https://github.com/ava-apple/vstudy-pro/actions/runs/42181539099) passed 102 tests with seven platform skips across seven files, including C's completed setup UI. [Report](windows-cli-focused.json).
- [Focused native-addon 42181535288](https://github.com/ava-apple/vstudy-pro/actions/runs/42181535288) rebuilt through electron-builder and round-tripped node-pty under Electron 42.11.16 on x64 and ARM64. [x64](windows-native-addon-x64.json) and [ARM64](windows-native-addon-arm64.json) include native library hashes.
- The default focused workflow runs `pnpm --filter @vstudy/mcp exec vitest run test/windows-pipe-native.test.ts --pool=forks --maxWorkers=2` and the desktop server acceptance test. It passed production same-handle authentication and server/engine/state round-trips. [Pipe report](windows-mcp-roundtrip.json). The real second-user fixture also demonstrated kernel access denial; [isolation report](windows-pipe-isolation.json).
- `pnpm --filter @vstudy/desktop test:release` passed 17 helper tests. `actionlint` passed all three workflows. Source security checks had no new/unreviewed findings; three existing security-lint warnings remain.
- Website typecheck/build/static checks passed 52 pages and 2,668 links. README checks passed 152 local links. Seventeen detection cases and 12 installed-Chrome download cases passed earlier; those browser downloads used synthetic installer responses, not public release URLs.
- Source builds use pinned Node 24.19.0 and require at least 24.15.0 for node-gyp 13.1. The standalone MCP script retains its separate 24.11.1 runtime minimum. The three-language website instructions distinguish them. Historical audit records retain their measured versions.

The rejected local hook initially pulled Electron into a Node-only MCP runtime bundle. The resource resolver now uses Node APIs. Windows installation identities use `realpathSync.native`, preserving strict verification across short/long path aliases. Linux IPC policy tests keep their coverage through a Windows filesystem stub. The real transport fixture uses a small .NET executable instead of copying the entire Node runtime and exhausting the test worker heap.

The current Windows runner has Visual Studio 2026. The scoped `@electron/rebuild@4.0.3>node-gyp` override to 13.1.0 fixes compiler discovery while retaining native rebuilding. The later registry failure was test ordering; the protocol is checked after the installed app registers it at readiness.

## MCP merge points

M's framing and engine remain shared: four-byte big-endian lengths, maximum 1 MiB, validated UTF-8/JSON/schema. The Windows adapter enforces a protected current-SID ACL and peer SID before dispatch, rejects network clients, reserves the pipe name, and bounds connections, queues, and deadlines. The endpoint remains `\\.\pipe\vstudy-<32hex SID hash>`.

- `shared/mcp-platform.ts` adds optional lifecycle `closed`.
- `main/mcp/transport.ts` selects `windows-bridge.ts` on Windows.
- `main/index.ts` injects `windows-state.ts` persistence.
- `main/mcp/runtime.ts` discards a lost host, marks it unavailable, and requires explicit re-enable. M2's lazy storage and saved opt-in restoration remain intact.
- `main/platform/resources.ts` resolves packaged resources without importing Electron into Node-only modules.
- `resources/mcp/windows-pipe.ps1` and `windows-state.ps1` are packaged explicitly. State ACLs are established before data is written or parsed; Windows uses no chmod security assumption or permissive raw Node pipe fallback.

## Limits and coordinator handoff

Real signing, notarization/stapling, quarantined Gatekeeper and SmartScreen behavior, publisher reputation, minimum OS versions, and clean consumer machines remain unverified. The packaged Windows converter probe found UV and did not bootstrap Python or convert a document. Full conversion was tested separately from source. A trusted UV or compatible Python installation remains a documented prerequisite. Windows converter network blocking is a Python policy, with weaker resource and directory-metadata durability guarantees than Mac.

The original main/tag cancellations were pre-runner rejections. Both annotations name unsupported `macos-14-arm64-us-default`; [main](cancelled-main-annotation.json) and [tag](cancelled-tag-annotation.json). Repository privacy or billing is not inferred as the cause. Current public runners executed real jobs. Duplicate/superseded branch-run cancellations are separate.

No signing secrets, live provider login, production release, tag, main push, or local Electron GUI launch occurred in this integration. Public stable download HTTP-200 checks require the owner's new release. Publish and verify the two enabled stable assets before main/Pages advertises them. Automatic updates remain a separate post-signing change.

Both temporary remote branches, `ci/cross-platform-dryrun` and `ci/windows-native-pipe`, are retained at the coordinator's explicit request. Wait for its confirmation before deletion. The implementation branch is `t3/cross-platform`; the coordinator owns independent review, merge, version/release notes, and tag/publication decisions.

Model the Domain shaped the shared target registry. Fix Root Causes changed native path resolution and the compiler driver. Prove It Works keeps ARM64 disabled and separates source, stock-Electron, installed-app, and signing evidence.

Dispatch ledger: the earlier CI/packaging and downloads/docs workers are integrated. The resumed implementation and verification ran in-thread. No additional subagents were started.
