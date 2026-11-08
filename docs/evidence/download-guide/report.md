# Download guide evidence

The goal is to make downloading VStudy Pro dead simple for ordinary students on the README and website. A student with no Homebrew, npm, Xcode, or Python should be able to follow the guide. Direct DMG downloads remain the first Mac option.

Work is on `t3/download-guide`. The branch was already checked out at main `47b6af890d801c6f569056f1c30f6642ed18cb61`. Creating it again reported that it already existed. The requested `git merge --ff-only t3/easy-install` succeeded and advanced it to `54f886fa`. Implementation HEAD is `b468f4e739fcc33a57febaffe837939a2b72bd66`. This report and the evidence are committed afterward. Resolve the evidence commit with `git rev-parse t3/download-guide`.

## Changes and order

`README.md`, `README.zh-Hant.md`, and `README.ja.md` now use the same sequence with localized instructions.

1. Download the Apple silicon DMG. Double-click, drag into Applications, eject, and open the installed app.
2. Follow the macOS first-open guidance if needed. Checksum verification is optional.
3. Open Terminal with Spotlight and paste the existing one-liner. Three bullets describe its download, installation, and app-specific quarantine handling. The script source is linked.
4. Copy the localized prompt to an AI agent. GitHub supplies the standard code-block copy control in the READMEs. The website supplies its existing copy-button interaction.
5. Download and open the Windows x64 EXE. Follow the SmartScreen steps if offered, or use the PowerShell command. Intel Mac and Windows ARM64 remain planned.
6. Update or uninstall with short instructions. Updates and app removal preserve the library. Delete data through Settings > Privacy first if wanted.
7. Read checksum verification later. The website keeps the commands in a collapsed details section.

DMG clicks come first because they require no command-line knowledge. No Homebrew tap command is advertised. The existing tap is unpublished.

`apps/website/src/components/DownloadPage.astro` renders the guide in that order. It reuses the existing Base layout, download styles, status announcement, copy handler, and OS detection. The recommendation panel and installer inventory remain below the guide. `apps/website/src/styles/download.css` adds spacing, wrapping, a calm signing notice, and themed copy buttons with 44px minimum height. No new runtime dependency or detection script was added.

`apps/website/src/data/install-copy.ts` holds a typed guide for all three languages. `apps/website/src/data/download-copy.ts` drops the superseded first-open strings. The `[lang]/download.astro` route already generates all three locales and needed no change.

README changes end before Build from source in each language. The original opening content and everything from Build from source onward are byte-for-byte unchanged. Desktop, CI, release, and signing code were not edited.

## Signing status

The single website owner is `installCopy[language].signingStatus` in `apps/website/src/data/install-copy.ts`. The English, Traditional Chinese, and Japanese objects each contain the status, warning title, exception steps, older-macOS guidance, and optional-verification links. The template renders that object in one aside. The AI prompt refers to the download page's signing status instead of duplicating an unsigned claim.

Each README has one block between `<!-- mac-signing-status -->` and `<!-- /mac-signing-status -->`. Replace that block when signed and notarized builds ship. The guide currently states that Developer ID signing and Apple notarization have not happened. It makes no claim that the current build is signed.

The modern macOS sequence was checked against [Apple's current guidance](https://support.apple.com/en-us/102445). Try opening once, open Privacy & Security in System Settings, scroll to Security, select Open Anyway, authenticate if asked, and confirm. Right-click > Open is identified as the older-macOS option. Proceeding is limited to downloads from this project's releases page that the student trusts.

## Verification

| Check | Result and evidence |
| --- | --- |
| `pnpm --filter @vstudy/website typecheck` | Pass. 49 files, zero errors, warnings, or hints. [Output](typecheck.log). |
| `pnpm --filter @vstudy/website lint` | Pass. 49 files, zero diagnostics. [Output](lint.log). |
| `pnpm --filter @vstudy/website build` | Pass. 64 pages built. [Output](build.log). |
| `pnpm --filter @vstudy/website verify:static` | Pass. 64 pages and 3,661 generated local links. Locale routes and fragment targets passed. [Output](static.log). |
| `node apps/website/scripts/verify-downloads.mjs` | Pass. 17 platform cases and all three locale download contracts. Enabled assets are linked and other targets remain planned. [Output](downloads.log). |
| Typed locale parity | Pass through `satisfies Record<Language, InstallCopy>` and the existing Astro checks. All three routes also passed the existing generated-page checks. |
| `node scripts/check-readme-links.mjs` | Pass. 152 local links across four files, including localized verification anchors. [Output](readme-links.log). |
| README scope and website fragments | Pass. All changed README website fragments resolve against their built locale HTML. Unrelated README sections match the starting commit. [Output](scope-and-anchors.log). |
| Browser checks | Pass. 12 combinations across en, zh-Hant, ja, 375px, 1200px, light, and dark. No page-level horizontal overflow, including expanded checksum details. All 36 copy operations matched actual clipboard contents after keyboard activation. No page errors. [Results](browser.json), [output](browser.log), [rerunnable script](verify-browser.cjs). |
| Published installer links | Mac DMG and Windows EXE return HTTP 200. [Output](published-links.log). |
| `git diff --check` | Pass before the implementation commit. |
| Lefthook and commitlint | Passed on the implementation commit without bypasses. Desktop-only pre-commit commands correctly skipped the docs/site paths. [Output](implementation-commit.log). |

No standalone website test command or Markdown lint command is defined. The existing static and download verification scripts were run directly. Package scripts, `scripts/`, and `lefthook.yml` were inspected for applicable checks.

The worktree initially had no dependencies. `pnpm install --frozen-lockfile` installed them. An initial typecheck, lint, and build launched together collided in Astro's shared Vite cache. The checks were rerun sequentially and passed. The preview clipboard check failed with an invalid-selector error and clipboard read permission denial. Verification then used the repository's Playwright 1.56.1 dependency against the built site served by `astro preview` on port 4321. The preview tab and local server were closed after verification.

## Screenshots

All captures show the built page at 900px viewport height and include the full page.

| Language and width | Light | Dark |
| --- | --- | --- |
| English, 375px | [Screenshot](en-375-light.png) | [Screenshot](en-375-dark.png) |
| English, 1200px | [Screenshot](en-1200-light.png) | [Screenshot](en-1200-dark.png) |
| Traditional Chinese, 375px | [Screenshot](zh-Hant-375-light.png) | [Screenshot](zh-Hant-375-dark.png) |
| Traditional Chinese, 1200px | [Screenshot](zh-Hant-1200-light.png) | [Screenshot](zh-Hant-1200-dark.png) |
| Japanese, 375px | [Screenshot](ja-375-light.png) | [Screenshot](ja-375-dark.png) |
| Japanese, 1200px | [Screenshot](ja-1200-light.png) | [Screenshot](ja-1200-dark.png) |

## Limits and handoff

The documented raw main URLs for both installer scripts currently return HTTP 404. The inherited one-liner was preserved as requested. The easy-install scripts must reach main before the Terminal and AI flows can work for students. The direct DMG and EXE downloads already respond successfully. The website anchors were verified against the built site. The deployed site has not been updated by this task.

No native installer, Gatekeeper dialog, SmartScreen dialog, AI-agent installation, or uninstall operation was executed during this docs/site task. No Windows machine was used. Browser keyboard and clipboard checks passed, but a full screen-reader audit was not performed. The app remains unsigned and un-notarized. A later signed build requires updating the named status blocks.

No push, tag, deployment, publication, or write to `/Users/vc/.t3/projects/vstudy-pro` was performed. Independent review remains with the parent task. No subagents were spawned.

The Model the Domain principle kept the guide in a typed locale object and collected all signing guidance under one key. The Prove It Works principle led to checks against the built pages, real clipboard contents, published-link responses, and saved screenshots. Both leaf skills were read. The diff was checked for unnecessary abstractions and narrating comments before committing. Only the requested signing-block markers were added to the READMEs.

Implementation, prose review, and verification ran in-thread because this task assigned the implementation sub-agent role.
