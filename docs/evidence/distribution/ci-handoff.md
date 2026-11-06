# Distribution CI handoff

Integration scope update. The first cross-platform publication enables Mac arm64 and Windows x64. Intel Mac and Windows ARM64 remain planned qualification candidates in `apps/desktop/distribution-targets.json`. Branch dry runs build all four. Tag matrix, assembly, website links, and publication use only `releaseEnabled` targets. The four-target worker inventory below describes available packaging machinery rather than a claim that every architecture is published or verified.

## Integration contract

The parent owns `src/main/index.ts` and all local Electron launches. This worker did not launch Electron, push, open a PR, dispatch CI, or publish a release.

Import the following exports from `./distribution-smoke` in main.

```ts
import { prepareDistributionSmoke, runDistributionSmoke } from './distribution-smoke';
```

Before app readiness and single-instance ownership, initialize the isolated smoke path.

```ts
const distributionSmokeRoot = prepareDistributionSmoke();
```

After `await createWindow()`, run the native assertions and return from startup.

```ts
if (distributionSmokeRoot) {
	await runDistributionSmoke(window!, store!, distributionSmokeRoot);
	return;
}
```

The runner sets `VSTUDY_DISTRIBUTION_SMOKE_DIR` to a fresh private directory immediately beneath the OS temporary directory. Main sets userData before acquiring ownership. Normal launches do not set this variable. The existing `VSTUDY_PACKAGED_SMOKE_DIR` path remains separate.

Merge the parent's resource `resources/mcp/windows-pipe.ps1` before packaging. `package.json` copies it to `mcp/windows-pipe.ps1` in packaged resources. The complete native test suite includes `src/main/platform/windows-pipe.test.ts` after parent integration. That test runs the real SID-restricted host on Windows and skips on other systems. The parent adds the packaged MCP protocol round-trip after stream M lands. This worker makes no packaged MCP success claim.

`src/main/signing.test.ts` currently expects the Mac missing-identity message on every OS. The wrapper preserves that diagnostic on Mac. The parent must make this existing test Windows-aware when integrating the new Windows signing wrapper. This worker did not edit runtime tests outside its scope.

## Native targets and installation

| Target | Hosted runner | Artifacts | Packaged application |
| --- | --- | --- | --- |
| `mac-arm64` | `macos-latest` | DMG and ZIP | `release/mac-arm64/mac-arm64/VStudy Pro.app` |
| `mac-x64` | `macos-15-intel` | DMG and ZIP | `release/mac-x64/mac/VStudy Pro.app` |
| `win-x64` | `windows-latest` | NSIS EXE and ZIP | `release/win-x64/win-unpacked/VStudy Pro.exe` |
| `win-arm64` | `windows-11-arm` | NSIS EXE and ZIP | `release/win-arm64/win-arm64-unpacked/VStudy Pro.exe` |

Each packaging helper rejects a mismatched native host architecture. Runner labels were checked against [GitHub's runner reference](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job).

NSIS uses an assisted installer with `oneClick: false`, `perMachine: false`, `selectPerMachineByDefault: false`, and `allowElevation: false`. It creates a Start menu shortcut and uninstaller, preserves user data on uninstall, and does not automatically launch the app. The executable requests `asInvoker`. One-click website downloads retain their direct installer aliases.

For a fresh ordinary Windows profile, the installed executable is `%LOCALAPPDATA%\Programs\VStudy Pro\VStudy Pro.exe`. More precisely, electron-builder v26.15.0 resolves `FOLDERID_UserProgramFiles` with GUID `{5CD7AEE2-2219-4A67-B85D-6C9CE15660CB}` and appends `VStudy Pro\VStudy Pro.exe`. It falls back to `%LOCALAPPDATA%\Programs`. An existing HKCU `InstallLocation` overrides this default. These paths were verified in the installed builder's `NsisTarget.js` and `templates/nsis/multiUser.nsh`.

The Windows installer smoke requires a disposable GitHub-hosted runner with no existing VStudy installation. It runs NSIS with `/S /currentuser`, launches the installed executable, verifies the Start menu entry and uninstaller, and uninstalls. When the runner has an administrator token, a PowerShell helper creates a restricted current-user token with the Administrators SID disabled and maximum privileges removed. The child independently rejects enabled administrator membership. This uses Microsoft's [CreateRestrictedToken](https://learn.microsoft.com/en-us/windows/win32/api/securitybaseapi/nf-securitybaseapi-createrestrictedtoken) and [CreateProcessAsUser](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessasuserw) APIs. There is no elevated fallback.

## Report and artifact schemas

Native smoke reports use `schemaVersion: 1`. Passing reports require the matching `platform`, `arch`, and `appVersion`, `exitCode: 0`, `windowCreated: true`, and `rendererLoaded: true`. The screenshot comes from native `capturePage`, without remote debugging. SQLite reports require `engine: node:sqlite`, `writeRead: true`, `persisted: true`, and `integrity: ok` after reopening the application's on-disk database.

Windows additionally requires `safeStorage.backend: dpapi`, `roundTrip: true`, and `ciphertextCleared: true`. Main uses Electron 42's async availability, encryption, and decryption methods with synthetic text. It clears the ciphertext buffer and logs neither plaintext nor ciphertext. Mac smoke never probes safeStorage or requests a Keychain unlock.

Converter reports verify packaged Python resources and probe trusted existing `uv` and Python executables. Python runs with `-I -S` and imports only `json` and `sys`. Reports retain `bootstrapAttempted: false` and `conversionTested: false`. Missing Python is reported as unavailable, not as a conversion failure or success.

Diagnostics live beneath `apps/desktop/release/smoke/<target>/` and upload even when the job fails. They include `report.json`, `smoke-result.json`, `window.png`, `fuses.json`, `launch.json`, `stdout.log`, and `stderr.log` when those stages complete. Windows also retains `installer-smoke.json` and installation logs. The native launch deadline defaults to 90 seconds. Timeout cleanup kills its process tree.

Per-target provenance and manifests also use `schemaVersion: 1`. Provenance records source commit, ref, workflow run, signing mode, native report, Windows installation report, and asset hashes. These JSON files describe the build. They are not a signed SLSA attestation.

Versioned assets are `VStudy-Pro-<version>-<target>.<ext>`. Stable aliases remain `VStudy-Pro-mac-arm64.dmg`, `VStudy-Pro-mac-x64.dmg`, `VStudy-Pro-win-x64.exe`, and `VStudy-Pro-win-arm64.exe`. ZIPs, available blockmaps, genuine electron-builder YAML metadata, provenance, and build notes accompany them. Metadata gets architecture-specific names such as `latest-mac-arm64.yml` and `latest-win-arm64.yml`. Defaults are `latest-mac.yml` for Mac ARM64 and `latest.yml` for Windows x64. Auto-update is not enabled.

Assembly requires exactly one artifact directory per target and verifies every manifest checksum before producing `distribution-manifest.json`, `SHA256SUMS.txt`, and release notes. Individual uploads are labeled `distribution-<target>-unsigned` or `distribution-<target>-signed`.

## Signing and publication policy

All `ci/**` pushes and default `workflow_dispatch` dry runs use the unsigned step. That step has no signing-secret references. The separate automatic signing step is skipped, and every secret expression checks publication intent and target platform before referencing a secret. Only the tag-gated publish job has `contents: write`. The publishing script repeats the event and tag checks. Electron-builder always uses `publish: never` and a generic feed, which emits metadata without uploading anything.

An actual push of `v<desktop-version>`, or `workflow_dispatch` with `dry_run: false` against that exact tag, permits signing and publication. Non-dry dispatch against a branch fails during planning. Partial credential groups fail before packaging. Release notes come from `docs/releases/<version>.md`. The publish job creates a non-draft release with `--verify-tag --latest`, then requires HTTP 200 from every enabled stable latest-download URL. Publication is serialized across tags.

| Mode | Required configuration |
| --- | --- |
| `unsigned` | No signing configuration. Mac bundles get ad-hoc signatures and no notarization. |
| `apple-api` | Secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. |
| `apple-account` | Secrets `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`. |
| `azure` | Secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT`, `AZURE_CERTIFICATE_PROFILE`, plus repository variable `WIN_PUBLISHER_NAME`. |
| `pfx` | Secrets `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`. |
| `hook` | Secret `WIN_SIGNTOOL_HOOK` containing the path to an existing electron-builder signing module, typically a `.cjs` file. |

The installed electron-builder v26.15.0 schema requires Azure `publisherName`. `WIN_PUBLISHER_NAME` must match the certificate CN. The pipeline uses the v26 `win.azureSignOptions` and `win.signtoolOptions.sign` schemas, as documented in [v26 Windows signing](https://www.electron.build/v26/docs/features/code-signing/code-signing-win/). Configure exactly one Windows backend. `WIN_PUBLISHER_NAME` is optional for PFX and hook modes. A hook must sign the paths electron-builder supplies and reject failures. Windows signatures are checked with `Get-AuthenticodeSignature` before provenance is marked signed.

`APPLE_API_KEY` accepts raw PEM, base64 PEM, or an existing key-file path. PEM content is materialized privately outside the checkout and removed after packaging, including failures. If both complete Apple methods are configured, API credentials take precedence. Local `package:signed` also supports an installed Developer ID through `CSC_NAME`. The workflow only exposes the certificate-link method. Signed Mac bundles must pass codesign, Gatekeeper assessment, and stapled-ticket validation.

## Commands and validation

Run these from the repository root after integrating the parent startup wiring and pipe resource.

```sh
pnpm install --frozen-lockfile
pnpm --filter @vstudy/desktop test:release
pnpm --filter @vstudy/desktop typecheck
pnpm --filter @vstudy/desktop lint
pnpm --filter @vstudy/desktop test --pool=forks --maxWorkers=2
pnpm security:static
pnpm vendor:check
pnpm build
actionlint .github/workflows/ci.yml .github/workflows/release.yml
pnpm knip
```

On a matching Mac host, package and smoke with the following commands. The parent owns local launches.

```sh
pnpm --filter @vstudy/desktop package:mac:arm64
pnpm --filter @vstudy/desktop package:verify --target mac-arm64
```

In the desktop directory on a disposable Windows hosted runner, use the corresponding target.

```sh
node scripts/package-release.mjs --target win-x64 --unsigned
node scripts/windows-install-smoke.mjs --target win-x64
```

To assemble a qualification run without publishing, use `--scope qualification` after all four native packages and smoke reports exist. Publication assembly uses the default release scope and requires only enabled targets. Run these from the repository root:

```sh
node apps/desktop/scripts/release-assets.mjs stage --target mac-arm64
node apps/desktop/scripts/release-assets.mjs stage --target mac-x64
node apps/desktop/scripts/release-assets.mjs stage --target win-x64
node apps/desktop/scripts/release-assets.mjs stage --target win-arm64
node apps/desktop/scripts/release-assets.mjs assemble --scope qualification
```

Local verification on this Mac passed 13 release-helper tests, desktop typecheck, desktop lint, build, actionlint, vendor checks, and security static checks. Security lint retained three existing warnings and zero errors. The full unit suite passed 1,024 tests with 14 skipped across 133 passing files and five skipped files. Tests exercise real helper filesystem output, fake Node processes, failure exits, deadlines, and a synthetic Windows fuse wire. They do not launch Electron.

Worker-time limits: the base configuration and every signing overlay passed electron-builder v26.15.0 schema validation, but that worker did not execute Windows. Subsequent parent integration wired the smoke module and native adapters. Windows x64 NSIS install/launch/uninstall, DPAPI, SQLite, the renderer, and three-language settings passed on the hosted runner in run 42168618179 at 5641e55. This predates the M/C merge. The integrated acceptance additionally requires node-pty and Windows MCP-off/on startup; see [current verification](VERIFICATION.md) for the latest source, results, and remaining limits. Real signing, notarization, and public stable download HTTP checks remain unverified.

All actions in the two owned workflows use complete upstream-verified SHAs. Refs were checked with `git ls-remote` against their official repositories for checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.1, upload-artifact v7.0.2, and download-artifact v8.0.2.
