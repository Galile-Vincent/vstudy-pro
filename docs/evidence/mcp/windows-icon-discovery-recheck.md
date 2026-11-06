# Windows NSIS icon discovery recheck

VStudy's global-agent MCP access uses the app session, keeps school credentials in main, and requires exact student consent. This review checks whether the configured NSIS metadata lets an agent find a custom installation without changing those boundaries.

Reviewed immutable HEAD `95168df8100a7338f3bd423136d2bcfaf767068b` against parent `23b4f72878e29d422d886ec4feec86d395bc1a23`. The review ran on macOS arm64 on 2026-11-06 with Node `24.19.0` and pnpm `10.28.2`. Every command ran in `/Users/vc/.t3/worktrees/vstudy-pro/t3-33df44f1`. Only this report is committed.

## Verdict and P2 status

Pass for the scoped discovery fix. The P2 custom-path failure in the [previous discovery report](windows-discovery-recheck.md) is resolved in portable replay. Its exact source-derived fixture now calls the mocked runner once with the custom `VStudy Pro.exe`, `['--mcp-background']`, and detached mode. The same inputs still reproduce `DISCONNECTED` and zero launch calls against the parent source.

No remaining defect was found in this narrow diff. The actual built CLI/core fixture passed on this Mac. Native Windows installation, discovery, and background launch could not run and remain unaccepted.

## Scope and unchanged boundaries

`git diff 23b4f72..95168df` changes only [launch.ts](../../../apps/mcp/src/launch.ts), [platform.test.ts](../../../apps/mcp/test/platform.test.ts), and [CLIENT_FORMATS.md](../../../apps/mcp/CLIENT_FORMATS.md). Production changes only icon candidate extraction in `launch.ts:26-30`.

The recognized-product predicate still runs before any candidate extraction. The new branch accepts only the Windows case-insensitive basename `uninstallerIcon.ico`, then derives the neighboring `VStudy Pro.exe`. Quoting and numeric icon indexes are metadata syntax. They do not become process arguments. Other icon basenames do not supply a candidate.

The resolver still requires a drive-qualified absolute path, no control characters, the exact case-insensitive executable basename, and an available regular non-symlink file. It keeps HKCU priority, followed by the standard per-user Programs path, native HKLM, and HKLM WOW6432Node. Registry queries still use absolute `reg.exe` and fixed `['query', key, '/s']` argv. The detached launcher still uses `shell=false` and only `['--mcp-background']`.

Discovery is not authentication. A scoped `git diff --exit-code` confirmed no changes to `connection.ts`, `windows-pipe.ts`, `windows-pipe-script.ts`, or `windows-acl.ts`. The separate same-handle SID and ACL client remains unchanged. The completed security and deadline reviews were not repeated. This review does not extend their verdicts or re-review the transport or backend.

## Installed builder source and profile evidence

`pnpm install --frozen-lockfile --ignore-scripts` succeeded without lifecycle scripts or a lockfile change. `createRequire` rooted at the desktop package resolved installed `electron-builder@26.15.0`. Resolution from that package selected `app-builder-lib@26.15.0` in this checkout's `node_modules/.pnpm` tree.

The following observations come from those installed files and the pinned desktop profile.

| Source | Observed behavior |
| --- | --- |
| [Desktop package profile](../../../apps/desktop/package.json), `build.nsis` | Configures `uninstallerIcon` as the existing `build/icon.ico`. Uses `oneClick=false`, `allowElevation=false`, and `perMachine=false`. No uninstall-name or executable-name override exists. |
| Installed `out/targets/nsis/NsisTarget.js:466-473` | Resolves that icon and defines `UNINSTALLER_ICON`. The default uninstall name is `${productName} ${version}`, expanded without product-name sanitization. |
| Installed `templates/nsis/include/installer.nsh:104,111-129` | Writes InstallLocation to `INSTALL_REGISTRY_KEY`. Writes the expanded DisplayName to `UNINSTALL_REGISTRY_KEY`. With `UNINSTALLER_ICON`, DisplayIcon is `$INSTDIR\uninstallerIcon.ico`. Without it, DisplayIcon is `$appExe,0`. |
| Installed `templates/nsis/multiUser.nsh:8-9` | Defines the separate install key as `Software\${APP_GUID}` and the uninstall key as `Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}`. |
| Installed `templates/nsis/multiUser.nsh:21-54` | Per-user mode selects HKCU, reuses a prior install location or the UserProgramFiles root, and permits a `/D` directory override. The source explicitly supports a relocated Programs root. |
| Installed `templates/nsis/installSection.nsh:9,60-68` and `common.nsh:16` | Places the executable and `uninstallerIcon.ico` in `$INSTDIR`. The executable name is `${PRODUCT_FILENAME}.exe`. |
| Installed `out/appInfo.js`, `out/targets/targetUtil.js`, and `out/util/macroExpander.js` | Executing `AppInfo`, `getWindowsInstallationDirName(info, true)`, and `expandMacro('${productName} ${version}', null, info, {}, false)` with this profile returns product filename `VStudy Pro`, executable `VStudy Pro.exe`, assisted install directory `VStudy Pro`, and DisplayName `VStudy Pro 0.2.2`. |
| [Packaging entry point](../../../apps/desktop/scripts/package-platform.mjs) | Selects `--win nsis dir` without overriding the profile. It was read, not executed. |

Installed template SHA-256 values were recorded directly.

| Template under installed `app-builder-lib@26.15.0` | SHA-256 |
| --- | --- |
| `templates/nsis/include/installer.nsh` | `0e319437dd01dcbf911f3f48f664fde0cefbaef704f1cdb1739f63d563f5d4a0` |
| `templates/nsis/multiUser.nsh` | `9aca256695c289ec8a875143101fae8c6236bc8c6a7cf369bbe8b4986e09c9cb` |

These sources support the original failing fixture. A custom uninstall record can contain the versioned DisplayName and icon-file DisplayIcon without containing InstallLocation. Deriving the executable beside this particular icon matches the configured profile. It does not require parsing or executing an uninstall or protocol command.

## Independent registry replay

The data shape was synthetic registry text, an explicit environment map, a candidate-file predicate, and a mocked launch runner. The checks called the exported resolver and launcher. Registry access and process APIs were mocked. Filesystem validation checks used mocked `existsSync` and `lstatSync` results. No Windows process or registry operation occurred.

The previous report's TypeScript fixture was copied verbatim from its code block into `apps/mcp/test/windows-icon-review.temp.test.ts`. It supplies no InstallLocation in the uninstall record. Its custom directory is the literal `E:\Student's files & notes\$(literal); [course]`. The runner received exactly the neighboring executable and the background flag.

A second temporary module contained `git show 23b4f72:apps/mcp/src/launch.ts`, with only its relative `errors` import adjusted for the temporary test directory. Replaying the same registry, environment, and file inputs against that module confirmed the earlier P2. It returned `DISCONNECTED`, called no runner, and queried HKCU, native HKLM, then WOW6432Node. That expected baseline failure passed its regression assertion.

The final temporary run passed 102 tests. Of these, 101 checked HEAD and one checked the expected parent failure.

| Checks at HEAD | Observed outcome |
| --- | --- |
| Exact previous report fixture | Pass. One mocked launch at the custom path with no uninstall metadata forwarded as argv. |
| 24 icon metadata combinations | Pass. Quoted and unquoted icons, no index, index `0`, and negative index `-101` work with both `REG_SZ` and `REG_EXPAND_SZ`, using literal and environment-expanded custom directories. Spaces, apostrophes, `$()`, `&`, semicolons, and brackets remain literal directory text. |
| Product and icon identity | Pass. Bare, stable, prerelease, build, and combined version labels work. Windows icon-basename case variants work. Eight unrelated, missing, or malformed product names do not launch. |
| Unrelated and malformed icons | Pass. Other icon names, prefixed names, backup suffixes, other extensions, alternate-stream text, appended commands, and malformed quotes do not launch. |
| Absolute paths and executable validation | Pass. Relative, drive-relative, root-relative, UNC, device, protocol, and control-character candidates fail even when the file predicate would accept them. Unresolved root variables fail. Wrong executable basenames and command-bearing executable values still fail. |
| Command-only metadata | Pass. UninstallString, QuietUninstallString, protocol, and shell-command fields provide no launcher. |
| Existing metadata and record isolation | Pass. Executable DisplayIcon and quoted expanded InstallLocation still work. Four cross-record field combinations do not launch. A later recognized record can supply an available executable. An available InstallLocation retains priority over an icon in the same record. An unavailable location permits icon fallback. |
| Lookup priority and legacy records | Pass. HKCU icon discovery wins over standard and machine paths. The standard per-user executable wins over legacy records. Native HKLM and WOW6432Node icon-only records work in the existing order. A failed HKCU query permits legacy fallback. |
| Default file checks | Pass. Missing files, directories, and symbolic-link leaves fail. A regular non-symlink leaf succeeds. These are portable mocked checks, not Windows filesystem acceptance. |
| Default query and spawn adapters | Pass. Mocked `execFileSync` receives the fixed absolute `reg.exe` command and native argv. Unsafe SystemRoot values fail before querying. Mocked spawn receives the exact custom executable, one background argument, detached mode, ignored stdio, hidden windows, and `shell=false`. The child environment excludes `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and `NODE_PATH`. |

The first temporary run passed 100 tests and failed one over-strict assertion about an unmatched leading quote. `registryAppPaths` returns an intermediate relative candidate for that input. The full resolver rejects it before launch. The corrected check asserts `DISCONNECTED` and zero runner calls. This was a fixture correction, not a production defect or code change. The corrected 101-case run passed before the parent comparison was added.

Both temporary files were removed before final checks and commit. Their final SHA-256 values were `94cc45142e0b158dca1d0faee19953e67ed581a12c8c806ab24e6eebb3cbf180` for the test and `193a75a042e9f8f5f66ceb5b770c5cf41fa2324c267ee70b25e946b6bc31d433` for the parent module.

## Commands and actual built artifact

| Command | Observed result |
| --- | --- |
| `git rev-parse HEAD` and `git diff 23b4f72..95168df` | Pass. Confirmed the immutable reviewed SHA and the three-file scope. |
| `pnpm install --frozen-lockfile --ignore-scripts` | Pass. Installed locked dependencies without lifecycle scripts. |
| `node --input-type=module` with desktop-rooted `createRequire` and the installed builder functions above | Pass. Confirmed both package versions and the exact profile-derived defaults. No installer ran. |
| `pnpm --filter @vstudy/mcp exec vitest run test/windows-icon-review.temp.test.ts --pool=forks --maxWorkers=2` | Final pass. 102 tests, including the exact prior fixture and the expected parent failure. The preliminary assertion failure and correction are recorded above. |
| `pnpm --filter @vstudy/mcp test` | Pass after temporary-file removal. Built the actual bundles, then ran Vitest with the package's `--pool=forks --maxWorkers=2`. Result was 130 passed and two skipped tests across 12 passed files and one skipped native Windows file. |
| `pnpm --filter @vstudy/mcp typecheck` | Pass with the HEAD temporary checks and again after their removal. |
| `pnpm --filter @vstudy/mcp lint` | Pass with the HEAD temporary checks and again after their removal. |
| `pnpm --filter @vstudy/mcp verify:core` | Pass against the actual built `dist/vstudy-mcp.cjs`, official MCP SDK, main core engine, and compiled native Unix peer helper. The disposable-home synthetic backend fixture reported 27 schemas, pending pairing, one-shot finish, cursor roundtrip, queued reads, approved local write, restart, doctor probes, reset, and fresh consent. Electron did not run. |
| `git diff --exit-code 95168df -- apps/mcp/src apps/mcp/test apps/mcp/CLIENT_FORMATS.md pnpm-lock.yaml` | Pass. Reviewed production files, tracked tests, client-format documentation, and lockfile remained unchanged. |
| `git diff --exit-code 23b4f72..95168df -- apps/mcp/src/connection.ts apps/mcp/src/windows-pipe.ts apps/mcp/src/windows-pipe-script.ts apps/mcp/src/windows-acl.ts` | Pass. The separate authenticated client files did not change. |

The actual built artifact verdict is **pass for macOS CLI/core execution**. It is **could-not-run for native Windows installation, discovery, and background startup**. The source-level win32 fixtures do not change that distinction.

| Built file exercised or produced by the final build | SHA-256 |
| --- | --- |
| `apps/mcp/dist/vstudy-mcp.cjs` | `b0da74f4bc2642490ca08d9f1e503c5171437405e0788dfc827c9265981a2802` |
| `apps/mcp/dist/installer.cjs` | `9555dc4afb6bc3b6ecc0b5602b91357a4a9aa5900214e257b394cf3d93219b30` |
| `apps/mcp/dist/windows-acl.cjs` | `b1e0ab7ccdb2e6d68d997a9f9350aefd6c816857c3a7c7abecccf7ce0c2e169f` |

## Native Windows gaps and review limits

No Windows installer was built or installed. No actual registry mutation, desktop app launch, real client configuration change, school access, real credential use, other-user login, or external message occurred. Packaging and Electron remain parent-owned.

Native acceptance still needs an actual installation and emitted-registry observation for this profile, a custom `/D` directory and relocated Programs root, native registry-view behavior, real file and symlink behavior, native background argv, and integration with the unchanged Windows authenticated pipe. Both native Windows tests skipped on this Mac. None of these Windows checks is marked passed.

The Prove It Works principle required running the actual bundled CLI/core fixture and recording native Windows as unverified. Test Behavior, Not Implementation kept the independent assertions on launch or rejection, including the malformed-quote fixture correction. Model the Domain kept the synthetic inputs in explicit registry, environment, file, and runner shapes. All review work ran in-thread because the owner prohibited children.
