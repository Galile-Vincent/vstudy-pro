# Verified download release metadata

The owner's goal is to show the current published release version and release date on the English, Traditional Chinese, and Japanese download pages. Version and file size must come from published assets. Unknown values must stay hidden.

## Previous sources

`apps/website/src/data/downloads.ts` reads installer names and publication flags from the desktop distribution registry. Its `releaseMetadata` object was empty. The card template supported version and size but displayed neither. No updater populated that object. Separately, the shared footer used the desktop package version, which was already 0.4.4 while the latest published release was 0.3.0.

## Published source

`gh release list --repo ava-apple/vstudy-pro --limit 3` returned v0.3.0 marked Latest, followed by v0.2.2 and v0.2.1. The snapshot uses [v0.3.0](https://github.com/ava-apple/vstudy-pro/releases/tag/v0.3.0). GitHub reported `publishedAt` as `2026-11-06T08:50:42Z`. The committed UTC value is `2026-11-06T08:50:42.000Z`. Both isDraft and isPrerelease were false. No unpublished tag was used.

`gh release view v0.3.0 --repo ava-apple/vstudy-pro --json tagName,publishedAt,assets,isDraft,isPrerelease` supplied the metadata. Its response is preserved in published-release.json. The updater fetched the release again to write the committed snapshot.

- VStudy-Pro-mac-arm64.dmg has 123600629 bytes. It displays as 123.6 MB.
- VStudy-Pro-win-x64.exe has 111704642 bytes. It displays as 111.7 MB.

Sizes use decimal MB. The fixture preserves those published asset values.

## Changes

- `apps/website/src/data/release.json` stores version, publication timestamp, and exact byte sizes.
- `apps/website/src/data/release.ts` validates the snapshot. Missing files, malformed JSON, invalid timestamps, and missing required sizes produce no metadata.
- `scripts/update-site-release.mjs` reads GitHub through gh or an optional JSON fixture. It rejects drafts, prereleases, invalid tags and dates, duplicate or missing stable aliases, incomplete uploads, and invalid sizes before writing. The requested tag must match the response.
- `scripts/update-site-release.test.mjs` and `scripts/fixtures/site-release.json` cover published values, publication state, asset rejection, UTC date normalization across midnight, invalid dates, and website fallback parsing.
- `apps/website/src/data/downloads.ts` extends the existing metadata path with a function that maps verified assets onto the installer inventory.
- `apps/website/src/config.ts` loads the snapshot at build time. `apps/website/src/layouts/Base.astro` now uses its verified version for the footer and hides it when unavailable.
- `apps/website/src/components/DownloadPage.astro` renders a muted paragraph directly below the heading, with semantic time markup. Intl.DateTimeFormat uses fixed locales and UTC at build time. File sizes share the existing muted format row. Installer and checksum links pin the snapshot's release tag so metadata and downloaded assets stay consistent across later publications.
- `apps/website/src/data/ui.ts` adds localized Updated labels beside existing Version labels. `apps/website/src/styles/download.css` reuses spacing, text, and muted color tokens.
- `apps/website/scripts/verify-downloads.mjs` checks verified sizes and timestamps. Its stale seven-section expectation now matches the existing six-section page.
- `docs/ENGINEERING.md` documents the post-publication updater, commit, website rebuild, and deploy step.

There is no browser fetch for release metadata and no added hydration. Maintainers refresh the snapshot after a release publishes. Until that refresh, the website retains the verified release and links to its assets.

## Verification

- Website typecheck and lint pass. Each reports 51 files and zero errors, warnings, or hints.
- Website build passes with 64 pages.
- Website verify:static passes with 3715 local links and zero failures.
- The download verifier passes 17 platform cases, all three generated download pages, installer visibility, verified sizes, timestamp markup, checksum links, and home and guide routing.
- Updater tests pass all five cases.
- verify-fallback.mjs builds the real site with a missing snapshot and malformed JSON. Both builds hide metadata in all three languages and retain working latest-download links. It restores the committed snapshot and rebuilds in a finally block.
- Knip passes with its existing compiled CSS configuration hint and a Node deprecation warning.
- The README checker passes with 262 local Markdown links across 10 files.
- The actual `pnpm exec lefthook run pre-push` passes. It runs the normal `pnpm test --pool=forks --maxWorkers=2` command. MCP has 132 passing tests, desktop has 2707, and newsletter has 25. Existing skips remain.
- The first test attempt failed during Electron dependency installation in this fresh worktree. Running the local Electron install.js repaired the dependency. The full hook passed on rerun. No desktop source changed.
- Normal pre-commit and conventional commit-message hooks pass. No hooks were bypassed. `git diff --check` passes.

Logs in this directory preserve the output. Website has no package test command. verify:static, verify-downloads, updater tests, fallback builds, and production browser checks provide its coverage.

## Browser evidence and critique

verify-browser.cjs adapts the existing download-cards runner. Start the production preview with `pnpm --filter @vstudy/website preview --host 127.0.0.1 --port 4322`, then run `node docs/evidence/download-version/verify-browser.cjs`. It checks 12 combinations of en, zh-Hant, ja, 375px, 1280px, light, and dark at 800px height. It verifies exact localized text, datetime, sizes, pinned links, keyboard focus, hover, 72 help openings, and 36 clipboard comparisons. Three additional contexts verify metadata with JavaScript disabled. browser.json records the measurements.

The rendered lines are:

- English shows `Version 0.3.0 · Updated Nov 6, 2026`.
- Traditional Chinese shows `版本 0.3.0 · 更新日期 2026年11月6日`.
- Japanese shows `バージョン 0.3.0 · 更新日 2026年11月6日`.

All measured scroll widths equal viewport widths. Final mobile card bottoms are 689.55px in English and 712.64px in Chinese and Japanese. Desktop bottoms are 474.38px in English and Japanese and 497.47px in Chinese. Both cards fit the first viewport in every combination.

Screenshots are `{locale}-{375|1280}-{light|dark}.png`. Primary captures are en-375-light.png, en-1280-dark.png, zh-Hant-375-dark.png, and ja-375-light.png. Focus and hover captures use matching prefixes. contact-sheet.png covers all 12 layouts.

I inspected individual mobile and desktop screenshots and the contact sheet. The first iteration put sizes on separate rows. Chinese mobile then ended near 768px, leaving little space below the cards. The final iteration combines format and size, saving 56px across the stacked cards. Initial mobile captures remain in iteration-1-en-375-light.png and iteration-1-zh-Hant-375-dark.png.

The release line stays subordinate to the heading and legible in both schemes. The Japanese release line is longer but still fits on one line at 375px. Muted file metadata is deliberately small and less prominent than architecture and requirements. Desktop cards retain generous space. No metadata arrives after hydration, so the new text introduces no hydration layout shift.

An inherited browser assertion first waited for a responsive hidden header span to become visible. The runner now waits for attachment. An unrelated home-page check also expected the expanded header label at mobile widths. This task's runner covers the requested download pages and omits that unrelated home matrix.

## Limits and handoff

Chromium was verified. Safari, Firefox, screen-reader speech, actual binary downloads, and installer execution were not verified. Later releases require the documented updater and website rebuild. This work did not push, deploy, tag, modify release workflows, signing code, desktop source, or the protected project checkout. No PR was opened and no independent review was claimed. Review belongs to the coordinating parent.

Model the Domain kept one snapshot shape and reused the installer registry. Prove It Works led to real production builds, missing-data builds, measured screenshots, and the complete pre-push hook.

The throughput checkpoint made source discovery and dependency installation prerequisites. Independent checks ran concurrently. Snapshot mutation and builds ran sequentially after browser capture. A single implementation owner avoided overlapping edits to the same download and configuration files.

Branch is `t3/download-version`. Implementation HEAD is `3e69ab48bd86aab01897e40a69fd8a0e2c13bd7c`. The report and evidence commit follows this revision. The final handoff records its exact HEAD.

Dispatch ledger. All work ran in-thread because this task explicitly assigned the implementation sub-agent role.
