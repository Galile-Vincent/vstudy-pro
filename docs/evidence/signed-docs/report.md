# Signed installation documentation report

The goal is to make every installation statement agree with published VStudy Pro v0.4.4. The Mac app is signed by Developer ID Application Hung-Yeh Chiang, Team X3AX6U5NLA, with hardened runtime, Apple notarization, and a stapled ticket. The Windows installer remains unsigned and SmartScreen may warn. The DMG container itself is not signed.

The release verification is the owner's supplied evidence. This change does not rebuild or republish those artifacts.

## Branch and implementation

Branch is `t3/signed-docs`. Verified implementation HEAD is `ab98a101497c4c4792af5eb27c842af80b8abe82`. The following evidence-only commit records this report, logs, and screenshots. The final handoff gives that commit’s exact HEAD.

## Files changed

- `README.ja.md`.
- `README.md`.
- `README.zh-Hant.md`.
- `apps/website/src/components/DownloadPage.astro`.
- `apps/website/src/data/docs.ts`.
- `apps/website/src/data/install-copy.ts`.
- `apps/website/src/data/legal-en.ts`.
- `apps/website/src/data/translations.ts`.
- `apps/website/src/data/ui.ts`.
- `docs/INSTALL.ja.md`.
- `docs/INSTALL.md`.
- `docs/INSTALL.zh-Hant.md`.
- `docs/SIGNING.md`.
- `packaging/homebrew/Casks/vstudy-pro.rb`.
- `scripts/install/install.sh`.
- `scripts/install/install.test.sh`.

The website FAQ, requirements, help, and terms copy also contained stale signing claims. Their text now agrees with the download page. The page layout stays the same. Its first-open link retains the existing anchor and now allows native hash navigation after opening the section.

The three README and three install-guide files each retain one marked signing-status block. The guides explain normal first-open confirmation, legacy troubleshooting, signature checks, and the one-time Keychain permission after upgrading from v0.3.0 or earlier. Update and uninstall instructions remain accurate and retain user data.

`docs/releases/0.4.4.md` and `scripts/install/install.ps1` were checked and left unchanged. Their Mac and Windows statements were already accurate. The Homebrew cask retains its version and checksum and no longer strips quarantine. Signing credential instructions are unchanged.

## Final signing wording

### English

> The Mac app is signed with an Apple Developer ID and notarized by Apple. It opens like any other Mac app. The Windows installer is not signed yet, so SmartScreen may warn on first run. [Install guide](../../INSTALL.md#mac-apple-silicon).

### 繁體中文

> Mac 版已使用 Apple 開發者 ID 簽署，並通過 Apple 公證，可像其他 Mac app 一樣開啟。Windows 安裝程式尚未簽署，首次執行時 SmartScreen 可能會顯示警告。 [安裝指南](../../INSTALL.zh-Hant.md#macapple-晶片)。

### 日本語

> Mac 版は Apple の Developer ID で署名され、Apple の公証も受けています。他の Mac アプリと同じように開けます。Windows インストーラーはまだ未署名のため、初回実行時に SmartScreen の警告が表示される場合があります。 [インストールガイド](../../INSTALL.ja.md#macapple-シリコン)。

## Installer behavior

The installed app passes `codesign --verify --deep --strict` and `/usr/sbin/spctl -a -t exec -vv`. The accepted path requires `source=Notarized Developer ID`. It reads Authority and TeamIdentifier from `codesign -dv` and reports the signing identity. It leaves quarantine intact.

Only an explicitly selected legacy version through v0.3.0 can use the unsigned fallback. The fallback removes quarantine from this app only and names its legacy status. A modern release that fails signature or notarization checks is removed. The previous app is restored if one existed. SHA-256 verification still fails closed before mounting. All flags and the no-sudo behavior remain.

Fake releases use a real DMG, real checksum verification, and real copy and replacement operations. Test-only shims provide signing outcomes and prevent process control from touching the user's app. The test copies the installer and replaces its absolute spctl path in that temporary copy. Production keeps the system path.

## Signing audit

The requested recursive grep output is saved in [signing-audit.txt](signing-audit.txt), including the website source directory.

Every match is deliberate. README, guide, FAQ, terms, and AI-prompt unsigned statements refer to Windows. Legacy troubleshooting and Keychain migration statements explicitly name v0.3.0 or earlier. Installer fallback and test assertions describe that legacy path. The PowerShell warning describes Windows. Other matches affirm Mac notarization or show its expected Gatekeeper output. No current Mac release is described as unsigned or unnotarized. Packaging has no remaining matching claim or quarantine-removal hook.

## Verification

All final commands passed. Log files retain command output with trailing whitespace removed.

| Check | Result | Evidence |
| --- | --- | --- |
| `bash -n scripts/install/install.sh scripts/install/install.test.sh` | Exit 0 | [bash-syntax.log](bash-syntax.log) |
| `shellcheck scripts/install/install.sh scripts/install/install.test.sh` | Exit 0, no findings | [shellcheck.log](shellcheck.log) |
| `bash scripts/install/install.test.sh` | Signed acceptance without quarantine removal, legacy fallback, modern rejection and rollback, invalid signature rejection, real DMG install, replacement, uninstall, dry-run, mismatch, missing checksum | [install-tests.log](install-tests.log) |
| `brew style packaging/homebrew/Casks/vstudy-pro.rb` | One file inspected, no offenses | [brew-style.log](brew-style.log) |
| `node scripts/check-readme-links.mjs` | 262 local links across 10 files | [readme-links.log](readme-links.log) |
| `pnpm --filter @vstudy/website typecheck` | 51 files, zero errors, warnings, or hints | [typecheck.log](typecheck.log) |
| `pnpm --filter @vstudy/website lint` | 51 files, zero errors, warnings, or hints | [lint.log](lint.log) |
| `pnpm --filter @vstudy/website build` | 64 pages built | [build.log](build.log) |
| `pnpm --filter @vstudy/website verify:static` | 64 pages, 3,715 links, zero failures | [website-tests.log](website-tests.log) |
| `node apps/website/scripts/verify-downloads.mjs` | 17 platform cases and three download routes passed | [website-download-tests.log](website-download-tests.log) |
| `pnpm knip` | Exit 0, one existing CSS configuration hint | [knip.log](knip.log) |
| `pnpm test --pool=forks --maxWorkers=2` | MCP 14 files and 132 tests passed. Desktop 301 files and 2,707 tests passed. Newsletter one file and 25 tests passed. Existing skips remain. | [tests.log](tests.log) |
| T3 browser rendering | All six language and viewport combinations passed. The link opens the section, sets `#mac-first-open`, and scrolls. No horizontal overflow. | [browser.json](browser.json) |

The first repository test run encountered an Electron binary setup error. Completing Electron installation and rerunning the same full command passed. The first fake-release test encountered a running app. Process-control shims now isolate all test runs. The website download test caught an extra nested disclosure during implementation. The final page preserves the existing six disclosures and passes the test.

Pre-commit and commit-msg hooks ran normally. Commitlint accepted the conventional implementation commit. No hooks were bypassed. The pre-push command was run manually because pushing is prohibited for this task.

## Screenshots

All screenshots are from the final page with first-open help expanded. They use a 1,000-pixel viewport height.

- [English at 375](en-375.png).
- [English at 1280](en-1280.png).
- [繁體中文 at 375](zh-Hant-375.png).
- [繁體中文 at 1280](zh-Hant-1280.png).
- [日本語 at 375](ja-375.png).
- [日本語 at 1280](ja-1280.png).

## Limits and decisions

Native published installer execution, clean-machine Gatekeeper dialogs, Windows SmartScreen, and real Keychain migration were not rerun. The owner already verified the published Mac artifact. Installer tests simulate the signing results and do not prove Apple notarization independently.

Model the Domain kept signing outcomes in one installer decision. Prove It Works led to real-DMG tests and browser checks of the actual localized page. Both principle files were read. Technical-writing and unslop guided the translations and report. Deslop was applied before commit.

Implementation and review stayed in-thread because this task explicitly assigns the implementation sub-agent and instructs children to do the work themselves. No independent review or PR was requested or performed. No push, tag, deployment, release-artifact change, CI change, desktop source change, signing-script change, or write to the owner's project checkout occurred.
