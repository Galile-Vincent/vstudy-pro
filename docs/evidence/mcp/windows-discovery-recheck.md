# Windows discovery recheck

VStudy lets selected global agents read Moodle through the app session, keeps school credentials in main, and requires student consent for writes. This review checks only whether the Windows installer-name fix helps agents find the app without changing those boundaries.

Reviewed immutable commit `301c9608ec552752f2e676a36cccb69f77b3eead`, whose parent is `aec9908cc4d1ee672bd0a8e16737595ff9f1524e`. Review ran on macOS arm64 on 2026-11-06 with Node `24.19.0` and pnpm `10.28.2` in the prepared checkout. Only this report is committed.

## Verdict

The display-name correction is valid. Bare names and the intended versioned names pass the synthetic discovery checks. The diff preserves executable validation and native argv, and introduces no credential or school-network handling.

One P2 functional gap remains for custom installs under this app's configured NSIS profile. The builder emits an icon-file DisplayIcon and stores InstallLocation outside the queried uninstall tree. A source-derived synthetic fixture reproduces `DISCONNECTED` despite an available app executable. This gap predates `301c960`; the name correction alone does not resolve it. Custom-path discovery for the configured installer is therefore not accepted by this review.

Native Windows installation and execution were not tested. Neither the passing portable tests nor the passing built CLI/core check constitutes native Windows acceptance.

## Scope and installed default

The reviewed diff contains only [launch.ts](../../../apps/mcp/src/launch.ts), [platform.test.ts](../../../apps/mcp/test/platform.test.ts), and [CLIENT_FORMATS.md](../../../apps/mcp/CLIENT_FORMATS.md). Production code changes only the DisplayName predicate on `launch.ts:24`. The tests add two versioned custom DisplayIcon launch fixtures and a near-name rejection fixture. The documentation records the builder default and the native Windows gap.

The existing [security recheck](security-recheck.md) and [deadline recheck](security-deadline-recheck.md) remain outside this review. Their scoped controls were not independently reviewed again.

After `pnpm install --frozen-lockfile --ignore-scripts`, Node resolution from the desktop package selected installed `electron-builder@26.15.0` and `app-builder-lib@26.15.0`. The lockfile did not change. The following evidence comes from those installed files, not from a remembered default.

| Source | Observed behavior |
| --- | --- |
| `app-builder-lib/out/targets/nsis/NsisTarget.js:473` | Uses `options.uninstallDisplayName` or `${productName} ${version}`, then expands macros without product-name sanitization. |
| `app-builder-lib/templates/nsis/include/installer.nsh:111-119` | Sets `$1` to an empty string for both install modes and writes `${UNINSTALL_DISPLAY_NAME}$1` to uninstall DisplayName. |
| [Desktop package profile](../../../apps/desktop/package.json) | Product name is `VStudy Pro`, version is `0.2.2`, and no uninstall-name or executable-name override exists. NSIS is assisted, with `oneClick=false`, `allowElevation=false`, and `perMachine=false`. |
| Installed `out/util/macroExpander.js` | Executing `expandMacro` with the profile's product name and version returns exactly `VStudy Pro 0.2.2`. |
| [Packaging entry point](../../../apps/desktop/scripts/package-platform.mjs) | Selects `--win nsis dir` without overriding that profile. The entry point was read, not executed. |

The unchanged strict bare-name check would reject the builder's ordinary versioned DisplayName. The new predicate addresses that mismatch.

## Name, path, and launch boundaries

The predicate anchors the entire trimmed DisplayName. It accepts `VStudy Pro` or that exact case-sensitive name followed by one ASCII space, three numeric components, and optional prerelease and build suffixes. Valid labels tested include stable, prerelease-only, build-only, and combined suffixes. The suffix character set is `[0-9A-Za-z.-]+`. This is a discovery-label pattern, not a full canonical SemVer validator.

Temporary fixture inputs were synthetic registry text and typed path tables. Registry queries, file results, and launch calls were mocked. They exercised the exported discovery and launch functions rather than copying the regex into a second implementation.

| Temporary checks | Observed result |
| --- | --- |
| 14 valid launches | Seven names each resolve through quoted, environment-expanded InstallLocation and executable DisplayIcon. The custom directory contains spaces, an apostrophe, and shell metacharacters. Only the exact executable and `['--mcp-background']` reach the mocked runner. |
| 25 rejected names | Missing names, similarly named products, altered case, extra prefixes or words, missing version components, Unicode digits or separators, empty suffixes, and command-shaped tails do not launch. |
| 12 rejected path candidates | Relative paths, drive-relative paths, rooted paths without a drive, UNC and device paths, wrong executable basenames, appended arguments, control characters, alternate-stream text, protocol text, and unresolved environment variables do not launch. |
| Four command-only records | UninstallString, protocol commands, and argument-bearing icon commands never supply a launcher. |
| Record isolation and path fallback | Fields do not carry across product records. A valid executable DisplayIcon can follow an unavailable InstallLocation candidate. |
| Two legacy lookup cases | Native HKLM and then WOW6432Node are queried only after HKCU and the standard per-user path fail. Existing committed tests also retain HKCU priority over the standard path and standard-path priority over HKLM. |
| Four filesystem cases | Mocked default filesystem calls reject missing files, non-files, and symbolic-link leaves, and accept a regular non-symlink file. These are portable logic checks, not Windows filesystem tests. |
| Default launch function with mocked spawn | Preserves executable and argv, uses `shell=false`, detached mode, ignored stdio, and hidden windows. Removes `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and `NODE_PATH` from the child environment. No desktop process starts. |

Static inspection of unchanged `launch.ts:32-76` also confirms drive-qualified absolute-path validation, the `VStudy Pro.exe` basename requirement, and fixed native `reg.exe` query argv. Registry text remains discovery information. It does not authenticate the app connection. The unchanged [connection.ts](../../../apps/mcp/src/connection.ts) separately checks the current-SID namespace and the attested server SID on the returned authenticated handle before exposing its stream.

## Remaining custom-install defect

P2. Custom installs can remain undiscoverable with the configured uninstaller icon.

The installed builder and current profile establish this source-derived registry shape:

1. `apps/desktop/package.json:168` configures `uninstallerIcon` as `build/icon.ico`. That resource exists in this checkout.
2. `NsisTarget.js:466-470` defines `UNINSTALLER_ICON` when that resource resolves.
3. `installer.nsh:126-129` then writes DisplayIcon as `$INSTDIR\uninstallerIcon.ico`. It writes an executable DisplayIcon only when `UNINSTALLER_ICON` is absent.
4. `multiUser.nsh:8-9` defines separate install and uninstall keys. `installer.nsh:104` writes InstallLocation under `Software\${APP_GUID}`, not under the uninstall key.
5. `launch.ts:25-27` needs InstallLocation in the same named uninstall record or a DisplayIcon ending in `.exe`. `launch.ts:46-51` queries only uninstall trees and the hard-coded standard-path fallback. It does not query the separate install key.

The per-user NSIS template supports `/D` overrides in `multiUser.nsh:52-56` and a non-default UserProgramFiles location in lines 35-49. A nonstandard install directory is therefore a supported source-level scenario even though this profile does not enable the install-directory wizard page.

The failing temporary test supplied a versioned uninstall record with the configured `.ico` DisplayIcon and no InstallLocation in that record. Its `isFile` double accepted only the custom `VStudy Pro.exe`. The resolver queried HKCU and both HKLM uninstall trees, never called the mocked runner, and returned `DISCONNECTED` instead of launching. The other 64 checks passed. The two committed versioned fixtures pass because they supply an executable DisplayIcon, which differs from this profile's configured output. The existing InstallLocation fixture places that value in the uninstall record.

This minimal fixture preserves the failure for reproduction in a temporary MCP test file:

```ts
import { expect, it, vi } from 'vitest';
import { launchApplication } from '../src/launch';

it('finds a custom install with the configured NSIS icon', async () => {
	const directory = String.raw`E:\Student's files & notes\$(literal); [course]`;
	const executable = directory + String.raw`\VStudy Pro.exe`;
	const key = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`;
	const record = [
		'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\fixture',
		'    DisplayName    REG_SZ    VStudy Pro 0.2.2',
		'    DisplayIcon    REG_SZ    ' + directory + '\\uninstallerIcon.ico',
		'',
	].join('\r\n');
	const run = vi.fn(async () => {});
	await expect(launchApplication({
		platform: 'win32',
		environment: { SystemRoot: String.raw`C:\Windows`, LOCALAPPDATA: String.raw`C:\Users\Synthetic\AppData\Local` },
		query: (_command, args) => args[1] === key ? record : '',
		isFile: path => path === executable,
		run,
	})).resolves.toBeUndefined();
	expect(run).toHaveBeenCalledExactlyOnceWith(executable, ['--mcp-background'], true);
});
```

Recommended follow-up is to align discovery metadata with this actual profile, retain executable and native-argv validation, and add this source-derived fixture. Parsing or executing UninstallString is not needed. No implementation or packaging change was made during this review.

## Observed checks and actual artifact

| Command | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile --ignore-scripts` | Pass. Installed the pinned dependencies without lifecycle scripts. |
| `pnpm --filter @vstudy/mcp test` | Pass before temporary tests and after their removal. Each invocation builds the CLI, then runs Vitest with `--pool=forks --maxWorkers=2`. Final result is 126 passed and two skipped tests across 12 passed files and one skipped native Windows file. |
| `pnpm --filter @vstudy/mcp exec vitest run test/windows-discovery-review.temp.test.ts --pool=forks --maxWorkers=2` | Fail. Both runs reproduced only the custom-install defect above, with 64 passed and one failed test. The final diagnostic explicitly observed `DISCONNECTED`, zero launch calls, and the three uninstall queries. |
| `pnpm --filter @vstudy/mcp typecheck` | Final pass. A preliminary run rejected the temporary EventEmitter-to-ChildProcess double. An unspawned, typed ChildProcess fixture replaced it and passed typecheck. The final run after fixture removal also passed. |
| `pnpm --filter @vstudy/mcp lint` | Pass, including the final run after temporary fixture removal. |
| `pnpm --filter @vstudy/mcp verify:core` | Pass using the actual built `dist/vstudy-mcp.cjs`, the official MCP SDK, the main core engine, and the native Unix peer helper. The script uses disposable home and app-data directories and a synthetic backend. It reports 27 schemas, pairing, reads, an approved local write, restart, doctor probes, and reset coverage. This is macOS CLI/core acceptance. |

The verified CLI artifact has SHA-256 `b1755f1270c9fb5b567a84567d855444fb118ea54f998cb82062c88e2bccf857`. Its companion `dist/installer.cjs` has SHA-256 `61bc363ee41f0c852dfe6a6ffdcea1edfdf6c357db8f91bde25397bf27bf3b0d`. Both hashes also match the final rebuild after temporary fixture removal.

The 65-case temporary file was removed before handback. Its final SHA-256 was `85bdf3eefe649e35846b4f0dfd0c4dd3d69eb1cc340aeb3d8d89ee1d98c82478`. The three reviewed files remain byte-for-byte unchanged from `301c9608ec552752f2e676a36cccb69f77b3eead`.

## Native Windows gaps and limits

No Windows installer was built, installed, or launched. No real registry, client config, school, credential, or external recipient was accessed. Electron was not started. Packaging remains parent-owned.

Native Windows acceptance still needs actual NSIS installation and emitted-registry observation, custom-path and relocated Programs discovery, registry-view behavior, real file and symlink checks, native background startup, and integration with the Windows authenticated pipe. The two native Windows tests skipped on this Mac. None of those native checks is marked passed here.
