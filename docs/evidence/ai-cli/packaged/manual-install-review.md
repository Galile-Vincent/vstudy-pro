# Packaged manual-install review

Students need clear steps when automatic download verification is unavailable. Branch `t3/ai-cli-copy` starts from main `b402c424`. Implementation and capture code are in `0f78688`. One packaged app passed the native PTY smoke and captured the real Antigravity manual-install sheet in English, Traditional Chinese, and Japanese, in Paper light and dark.

The app used an isolated home and user-data directory. Real file-only discovery reported Antigravity missing. No renderer state or CLI inventory was mocked. Settings and setup used the existing IPC. The publisher policy required manual installation. The sheet showed one short explanation, a confirmed official-source link, three numbered steps, and the exact official command. Copy command and Open Terminal are secondary buttons. Check again is the only primary button. The permission label describes using the tool after installation.

## Screenshots inspected

Every PNG below was opened and visually reviewed at 1200 by 900 pixels.

| Language | Light | Dark | Review |
| --- | --- | --- | --- |
| English | [PNG](manual-install-en-light.png) | [PNG](manual-install-en-dark.png) | Pass. One explanation, the official-source link, three numbered steps, full command, and all three buttons are visible. |
| Traditional Chinese | [PNG](manual-install-zh-Hant-light.png) | [PNG](manual-install-zh-Hant-dark.png) | Pass. Traditional characters and labels render correctly. The instructions and all three buttons fit above the footer. |
| Japanese | [PNG](manual-install-ja-light.png) | [PNG](manual-install-ja-dark.png) | Pass. Instructions and permission text wrap within their columns. The full command and all three buttons fit above the footer. |

The two-column Quiet folio layout stays aligned in both schemes. No horizontal clipping, overlapping controls, untranslated namespace keys, or missing glyphs were observed. Optional management and help content continues in the scroll area. The primary Check again button remains visible in all six screenshots.

Runtime assertions checked the localized current step, exact official command, single explanation, three numbered steps, visible source link, three enabled visible buttons, one primary Check again button, no embedded Run preview, and no horizontal overflow. After each capture, the script pressed Check again and waited for the localized missing-tool result. The real inventory remained missing, without a version probe or test. The screenshots cover manual installation on macOS, not native Windows behavior or a new-account login.

## Native PTY and cleanup

Both packaged helper candidates started at mode `0644`. The runtime repaired the selected `build/Release/spawn-helper` to `0755`; the unused prebuild stayed `0644` during the run. A native PTY command answered, the action closed, and update/advanced preferences reset to false. Script cleanup restored both original helper modes.

The ad-hoc package passed deep strict signature verification. RunAsNode and inspector arguments remained disabled, and ASAR-only loading and integrity validation remained enabled. The app exited with code 0. `pgrep -fl "VStudy Pro|Electron"` returned no processes before and after the single launch. The shared GUI slot release was announced immediately after exit.

[The runtime result](result.json) records the helper, fuse, and six DOM checks. [The review record](manual-install-checks.json) records screenshot hashes, dimensions, visual inspection, ASAR hash, and command results. Typecheck, lint, build, native packaging, Knip, vendor checks, and static security checks passed. Static security retained three existing external-link warnings. The full desktop suite passed 1,466 tests, with 15 skipped. A final renderer run passed all 44 tests after the other-Unix wording and Codex platform regression were added.

## Provider and terminal coverage

Component tests exercise the shared manual path for Claude, Codex, and Antigravity in all three languages. They check the single explanation, numbered steps, command copying, official-source link, permission label, and external-terminal capability. Windows wording and PowerShell commands are covered for Claude and Antigravity. Codex stays macOS-only.

Main-process tests verify native confirmation, cancellation without clipboard or launch changes, fixed terminal argv, no installer command in process argv, document reload rejection, and rejection of every manual terminal capability by the embedded runner. These tests mock terminal process creation. The packaged run exercises the real PTY and file-only Check again, without opening the user's terminal or executing a vendor installer.

Native Windows acceptance remains P-owned. The earlier fixture fixes and their [CI handoff](../../../AI_CLI_WINDOWS_FIXTURES.md) were already merged before this branch.

Model the Domain kept manual terminal capabilities separate from embedded actions. Test Behavior required the observable copy, consent, cancellation, and detection checks. Prove It Works required the packaged process and inspection of every PNG. All work ran in-thread as the implementation delegate. Independent review and the PR gate remain coordinator-owned.
