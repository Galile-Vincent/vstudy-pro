# Easy installation evidence

The goal is to let users install the unsigned, un-notarized VStudy Pro desktop app with a verified command or a prompt for an AI agent, document that flow in English, Traditional Chinese, and Japanese in the READMEs and website, and show VStudy Pro throughout the app without changing existing data or credential identities. The owner does not intend to sign the app.

Work is on `t3/easy-install`, based on main `47b6af890d801c6f569056f1c30f6642ed18cb61`. The branch already existed and was clean at that exact main commit when implementation began. Implementation HEAD is `c3b4af06e9280d2f7b0ea6a7f39761088e713e92`. This report and transcripts are added in the following evidence commit. Resolve the final evidence HEAD with `git rev-parse t3/easy-install`.

## Changes

- `scripts/install/install.sh` installs the full Apple silicon Mac app. It resolves latest once to a release tag, supports version pins and custom destinations, verifies exactly one SHA-256 entry, mounts read-only, stages with ditto, quits politely, moves the old app aside, and renames the staged app into place. Exit cleanup detaches the image and restores the old app if replacement fails. Quarantine removal applies only to this app. It reports signing and Gatekeeper assessment, supports open/uninstall/dry-run/help, and never uses sudo or changes user data.
- `scripts/install/install.test.sh` builds a real small DMG and covers install, replacement, uninstall, dry-run, checksum mismatch, and missing checksum. `VSTUDY_RELEASE_BASE` is documented as a test-only asset-directory override.
- `scripts/install/install.ps1` downloads and verifies the Windows x64 installer before running its per-user installation without elevation.
- `packaging/homebrew/Casks/vstudy-pro.rb` pins v0.3.0 and its published hash, requires arm64 and macOS Monterey or later, installs the app, strips quarantine in postflight, and provides GitHub latest livecheck. Current Homebrew requires `postflight_steps` and `run` syntax. Zap includes the actual data namespace, its internal Chromium caches, and the observed bundle-ID preferences file. It does not remove Keychain items.
- `scripts/update-cask.mjs` updates the version and hash from a published release or a fixture. Its test covers successful replacement and missing/duplicate checksum rejection.
- The Download and install areas of all three READMEs include the headline Mac command, a download/read/run alternative, Windows commands, localized agent prompts, unsigned/quarantine explanations, and update/removal instructions. The shared website DownloadPage and `install-copy.ts` render all three locale routes with copy buttons. The existing manual DMG fallback remains. Script URLs point to the single source on raw GitHub; no website script duplicate is maintained.
- `docs/ENGINEERING.md` documents tests, release maintenance, and the exact owner commands to create and publish `ava-apple/homebrew-vstudy`. User-facing text does not advertise the unpublished brew command.
- Desktop packaging corrects helper CFBundleName fields before signing. `scripts/brand-dev-electron.mjs`, wired into dev, brands the local app and helper bundle names, executables, and icon, updates Electron's local path file, and applies a local ad-hoc signature. It is idempotent and skips missing bundles and non-Mac systems.
- `scripts/check-app-name.mjs` rejects incorrect root/helper bundle, display, or executable names. The distribution smoke CLI runs it for Mac bundles. The runtime smoke reports app.getName() and rejects names containing Electron.

No renderer files, data paths, package identity, bundle identifiers, or safeStorage item names were changed. No push, tag, release, tap publication, npm publication, or website deployment was performed.

## Real v0.3.0 installation

One complete real installer run used the published GitHub release and `/tmp/vstudy-easy-e2e-apps`, never the real /Applications.

```sh
bash scripts/install/install.sh --version 0.3.0 --dest /tmp/vstudy-easy-e2e-apps
```

[Full output](real-install.log) includes these actual results.

```text
SHA-256 verified: e981578a43522926e82baa57fdc4e882ad481f1b84fd0f914683eec87925693e (VStudy-Pro-mac-arm64.dmg)
Signature=adhoc
TeamIdentifier=not set
/tmp/vstudy-easy-e2e-apps/VStudy Pro.app: rejected
Gatekeeper assessment rejected. This app is unsigned/un-notarized; quarantine was removed only from this copy.
Installed /tmp/vstudy-easy-e2e-apps/VStudy Pro.app. Re-run this script to update.
"disk12" ejected.
```

The published [checksum manifest](SHA256SUMS-v0.3.0.txt) contains the same hash for stable and versioned DMG names. A separate audit download produced the same shasum. The subsequent script edit only added explicit download-step messages; the fixture harness was rerun after that edit.

`plutil -p Info.plist | grep -i name` produced the [recorded output](release-plist-names.log).

```text
  "CFBundleDisplayName" => "VStudy Pro"
  "CFBundleName" => "VStudy Pro"
      "CFBundleURLName" => "VStudy Moodle sign-in"
  "DTSDKName" => "macosx15.5"
```

The app opened with `open -n` and a separate `--user-data-dir`. [Process evidence](vstudy-real-processes.log) shows its main executable and helpers running. [Menu evidence](vstudy-real-menu.log) shows `Apple, VStudy Pro, File, Edit, View, Window`. AppleScript clicked `About VStudy Pro`, observed the app windows, and successfully quit the app. The released app also passed its native smoke with `ok: true`, `exitCode: 0`, `windowCreated: true`, and `rendererLoaded: true`. See [release-smoke.json](release-smoke.json). Initial smoke-launch attempts used invalid temporary roots, were terminated, and were replaced with a valid root under the system temporary directory. Those harness mistakes were not counted as passes. All test processes are stopped and all DMGs detached.

## Where Electron appeared

| Item | Finding and action |
| --- | --- |
| Released root Info.plist | CFBundleName, CFBundleDisplayName, CFBundleExecutable were already VStudy Pro. Bundle identifier was already com.vstudy.pro. |
| Released helper bundles | All four CFBundleName values were Electron Helper, including GPU, Plugin, and Renderer suffixes. Display names and executable names were already VStudy Pro Helper variants. The afterPack fix changes only CFBundleName. [Original fields](release-helpers.log). |
| Process names, menu, and About entry | Released main/helper executable names, app menu, and About VStudy Pro entry were already correct. Captured with ps and System Events. |
| Runtime internal name | The released app.asar package contains name @vstudy/desktop and no productName. The matching Electron probe reports @vstudy/desktop and the established Application Support/@vstudy/desktop path. This internal identity intentionally remains unchanged. No runtime app.setName was added. |
| Development bundle | Root display, bundle, and executable names were Electron. Helpers were Electron Helper variants. The dev step now brands app/helper paths and metadata. A live window probe shows only VStudy Pro executable names for this worktree and VStudy Pro in the menu bar. [Process evidence](vstudy-dev-processes.log), [menu evidence](vstudy-dev-menu.log). |
| Dock and About panel | Root display-name metadata was already correct in the release and is fixed for dev. About menu and app-window names were observed. The Dock tooltip and every About-panel text field were not separately captured. |
| Native dialogs | Source audit found the existing startup error title VStudy Pro and attached dialogs using the app/window identity. No literal Electron dialog title was found. Every dialog was not individually exercised. |
| Permission and Keychain prompts | Requester metadata/executables now use the product name. No permissions or saved secrets were deliberately accessed, so actual first-run permission/Keychain prompts remain unverified. Their existing storage identity is unchanged. |
| Windows | productName, shortcutName, installer icons, and asInvoker/per-user NSIS settings were already correct in package.json. No Tray constructor was found in desktop main code. Native Windows behavior remains unverified. |

The name check intentionally [fails on the original v0.3.0 helpers](release-namecheck.log). Applying the actual afterPack hook to a temporary copy of that real app, then running the name check, [passes for all five bundles](branded-namecheck.log). That copy also [passes the complete distribution smoke CLI](branded-smoke.log). This proves the metadata fix against a real bundle. A newly built app containing the new runtime smoke guard was not packaged during this task. The existing v0.3.0 release assets remain unchanged and retain their old helper CFBundleName values until the owner publishes a new release.

## Verification

[Command output](checks.log) and [installer harness output](install-tests.log) retain the evidence.

| Check | Result |
| --- | --- |
| bash -n and shellcheck on install scripts | Pass. |
| Real-DMG local fixture harness | Pass, including fail-closed missing and mismatched checksums. |
| Real v0.3.0 temp-destination install, launch, polite quit | Pass. |
| Cask update fixture test | Pass. The updater also consumed the actual v0.3.0 checksum file successfully. |
| brew style | Pass, no offenses. |
| brew audit --cask --new | Could not run to completion. File-path audits are disabled; named audit reports no available cask because the tap is unpublished. |
| Windows execution / PSScriptAnalyzer | Could not run. This machine is macOS and has no PowerShell/PSScriptAnalyzer. Script was reviewed manually. |
| Website typecheck, lint, build | Pass, 49 files with no diagnostics and 64 pages built. |
| Desktop typecheck and lint | Pass. |
| Related native-menu vitest | Pass, 1 test, --pool=forks --maxWorkers=2. No vitest files were changed or added. |
| Existing release node tests | Pass, 17 tests. |
| Original and corrected bundle-name checks | Expected failure on old helpers, pass after the packaging hook. |
| Dev branding twice and live process/menu probe | Pass. [Brand log](dev-brand.log). |
| pnpm security:static | Pass with 3 existing dynamic-openExternal warnings and 0 errors. |
| README local links and git diff --check | Pass, 155 local Markdown links checked. |
| Lefthook and commitlint | Pass on implementation commits. Hooks were not bypassed. |

The Model the Domain principle kept installer cleanup state explicit as the mount, stage, and backup paths. Prove It Works led to the real DMG fixture, the actual release install, and a before/after check on a copy of the delivered app. Both principle leaf files were read this session. The diff was reviewed for narrating comments, unnecessary abstractions, and unrelated changes before committing. Independent review remains for the parent task; no subagents were spawned by this implementation delegate.

## Owner follow-ups

1. Review and push this branch, then merge so the documented raw main URLs exist. The commands intentionally reference main and do not work until the scripts land there.
2. Publish a new release to distribute the helper metadata fix. v0.3.0 assets are immutable in this work and still contain the baseline helper names. Run the new package verification on each new release.
3. Create and publish the Homebrew tap using the exact commands in ENGINEERING.md, then run its named brew audit. Run the updater after each published release and copy the revised cask into the tap. The future user command is `brew install --cask ava-apple/vstudy/vstudy-pro`.
4. Verify the PowerShell installer on Windows x64, including SmartScreen and per-user install behavior.
5. Deploy the website after the main script URLs are available. No signing or notarization is required by these changes.

Implementation and verification ran in-thread because this task explicitly assigned the implementation sub-agent role.
