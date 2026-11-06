# Packaged manual-install review

One packaged app ran from main `9434d667` on branch `t3/ai-cli-windows-tests`. It passed the native PTY smoke and captured the real Antigravity manual-install sheet in English, Traditional Chinese, and Japanese, in Paper light and dark. Capture code is `27c18a1`.

The app used an isolated home and user-data directory. Real file-only discovery reported Antigravity missing. No renderer state or CLI inventory was mocked. Settings and setup used the existing IPC. The managed installer was unavailable under the publisher policy, and the sheet showed the official copy-only command.

## Screenshots inspected

Every PNG below was opened and visually reviewed at 1200 by 900 pixels.

| Language | Light | Dark | Review |
| --- | --- | --- | --- |
| English | [PNG](manual-install-en-light.png) | [PNG](manual-install-en-dark.png) | Pass. The current Install step, explanation, full command, and primary Copy button are visible. |
| Traditional Chinese | [PNG](manual-install-zh-Hant-light.png) | [PNG](manual-install-zh-Hant-dark.png) | Pass. Traditional characters and labels render correctly. The command and primary action remain visible. |
| Japanese | [PNG](manual-install-ja-light.png) | [PNG](manual-install-ja-dark.png) | Pass. The longer instructions wrap within the column. The complete command and Copy button fit above the footer. |

The two-column Quiet folio layout stays aligned in both schemes. No horizontal clipping, overlapping controls, untranslated namespace keys, or missing glyphs were observed. Optional management and help content continues in the scroll area. The primary install action remains visible in all six screenshots.

The runtime assertions independently checked the localized current step, exact official command, enabled and visible Copy button, one action button in the manual pane, no managed Run preview, and no horizontal overflow. The screenshots cover manual installation on macOS, not native Windows behavior or a new-account login.

## Native PTY and cleanup

Both packaged helper candidates started at mode `0644`. The runtime repaired the selected `build/Release/spawn-helper` to `0755`; the unused prebuild stayed `0644` during the run. A native PTY command answered, the action closed, and update/advanced preferences reset to false. Script cleanup restored both original helper modes.

The ad-hoc package passed deep strict signature verification. RunAsNode and inspector arguments remained disabled, and ASAR-only loading and integrity validation remained enabled. The app exited with code 0. `pgrep -fl "VStudy Pro|Electron"` returned no processes before and after the single launch. The shared GUI slot release was announced immediately after exit.

[The runtime result](result.json) records the helper, fuse, and six DOM checks. [The review record](manual-install-checks.json) records screenshot hashes, dimensions, visual inspection, and command results. Typecheck, scoped lint, build, native packaging, Knip, and static security checks passed. The relevant setup component and helper tests passed all 44 tests. No full suite was repeated for this capture-only change.

## Windows fixture work already merged

The Windows fixture changes are already in `e707d93`, with the full file list and CI handoff in `38e254b`. Main merged them as `9434d667`, before this branch was created. No duplicate fixture patch was made. [The ten changed files, platform gates, ConPTY assertion, and P's rerun command](../../../AI_CLI_WINDOWS_FIXTURES.md) remain the handoff. Native Windows confirmation is still P-owned.

Prove It Works required the real packaged process and inspection of every PNG. Model the Domain kept each capture's language, scheme, action state, and evidence in one record.
