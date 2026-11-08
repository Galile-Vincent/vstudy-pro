# Simple README and download evidence

The goal is to give VStudy Pro users a short README that explains downloads and app functions, with detailed Markdown guides linked below. The website must put the Mac DMG and Windows EXE cards first and keep help collapsed below them.

## Branch and scope

Work is on `t3/simple-readme`, created from `8e61c379`. The implementation HEAD is `67e8c6b45b29adf976ed6843e45c433502f310bf`. This report and the screenshots are recorded in the following evidence commit. Resolve that commit with `git rev-parse t3/simple-readme`.

No push, tag, deployment, or release change was made. No desktop source file or file in `/Users/vc/.t3/projects/vstudy-pro` was changed. Dependencies were installed in this worktree with `pnpm install --frozen-lockfile`.

## README structure

| File | Before | After |
| --- | --- | --- |
| `README.md` | 362 lines | 61 lines |
| `README.zh-Hant.md` | 362 lines | 61 lines |
| `README.ja.md` | 362 lines | 61 lines |

All three follow the same structure in their own language.

1. Title, one sentence, the existing 0.4.0 badge format, and the existing reader screenshot.
2. Two download links, short install steps, the unchanged Mac Terminal command, and a link to the localized AI installation prompt.
3. One short paragraph between the existing signing markers. The detailed status and opening steps live in INSTALL.
4. Nine plain feature bullets covering documents, AI citations, Moodle, planning, tabs, MCP, AI connections, local storage, and languages.
5. Links to installation, the feature guide, MCP, security, engineering, and release notes.
6. Five lines introducing desktop, MCP, website, newsletter, docs, and scripts.

The bullets are supported by the original README feature and setup sections. Practice and exam review were not added as separate claims. The original README does not establish that feature. The planner supports exam entries.

## Moved documentation

- [INSTALL.md](../../INSTALL.md), [INSTALL.zh-Hant.md](../../INSTALL.zh-Hant.md), and [INSTALL.ja.md](../../INSTALL.ja.md) contain the original download options, Terminal and PowerShell commands, AI prompt, Mac opening steps, checksum verification, update, uninstall, data deletion, and source build instructions. They also identify current requirements and explain safeStorage and Keychain access after an update.
- [GUIDE.md](../../GUIDE.md), [GUIDE.zh-Hant.md](../../GUIDE.zh-Hant.md), and [GUIDE.ja.md](../../GUIDE.ja.md) retain tabs, detailed features, screenshots, shortcuts, settings, AI setup, MCP, privacy, architecture diagrams, development commands, and known limits.
- Each page starts with language links, a README backlink, and a short table of contents.
- The [documentation index](../../README.md) points to the new guides.
- The README link checker now checks all six new guides as well as the original four files.

[The content comparison](content-move.log) checked every original nonblank detail line against INSTALL or GUIDE. It normalized moved relative links, the signing block formatting, and one sentence about analytics. No original detailed section was discarded.

## Website structure

The page starts with one heading and two large download cards. They are side by side on desktop and stacked on mobile. The existing OS detector highlights the matching enabled card. The existing verified metadata object controls version and size. It is empty, so neither value is invented.

A short first-open link follows the cards. It opens and focuses the Mac help section. Seven native details sections follow in this order.

1. Mac says it cannot be opened.
2. Install with one line in Terminal.
3. Let an AI agent install it.
4. Windows SmartScreen.
5. Verify your download with SHA-256.
6. Update and uninstall.
7. Other platforms, including planned Intel Mac and Windows ARM64 builds.

All seven start closed. The existing copy handler, live status, design tokens, OS detector, and `installCopy[language].signingStatus` are reused. No runtime dependency was added. The locale routes and OsDownloadButton already route correctly and required no edits.

## Verification

| Check | Result |
| --- | --- |
| Website typecheck | Pass. 49 files, no errors, warnings, or hints. [Output](typecheck.log). |
| Website lint | Pass. 49 files, no diagnostics. [Output](lint.log). |
| Website build | Pass. 64 pages. [Output](build.log). |
| Website static verification | Pass. 3,655 local links across 64 pages. [Output](static.log). |
| Download verification | Pass. 17 detection cases, three locale contracts, publication scope, seven closed help sections, and section order. [Output](downloads.log). |
| README links and anchors | Pass. 262 local links across ten files. [Output](readme-links.log). |
| Knip | Pass. One existing CSS configuration hint. [Output](knip.log). |
| Browser matrix | Pass. Twelve combinations of three languages, two widths, and two themes at 800px height. [Output](browser.log), [metrics](browser.json), [rerunnable script](verify-browser.cjs). |
| Keyboard and clipboard | Pass. 84 section openings with Enter or Space and 36 actual clipboard comparisons. First-open links open and focus Mac help. |
| OS recommendation | Pass. Mac and Windows cards are highlighted for matching browser information. |
| Pre-commit and commitlint | Pass without bypasses. Desktop-only commands skip these paths. [Output](implementation-commit.log). |
| Pre-push | Pass. README links and the full root test suite pass without bypasses. [Output](pre-push.log). |
| Diff whitespace | `git diff --check` passes. |

The browser metrics prove both complete cards are inside the first viewport at 375×800 and 1280×800. The cards follow the heading without intervening prose. There is no horizontal overflow, including with all help expanded. The captured screenshots show the default closed state. The website has no standalone Vitest suite. Its static and download scripts were run directly. The root suite runs Vitest with forks and at most two workers through the pre-push hook.

The first full test run failed because two workers raced while installing the missing Electron binary. It passed 300 desktop test files and 2,657 tests, with seven files and 20 tests skipped. [Initial output](tests-initial.log). Running the Electron package installer once repaired the local dependency before the hook rerun. The rerun passed all 301 desktop test files and 2,707 tests, with seven files and 20 tests skipped. Newsletter tests also passed all 25 cases.

The shared preview first confirmed mobile layout. Clipboard verification failed there with `Preview automation evaluate timed out after 15000ms` and `Read permission denied`. After those two failures, the browser checks switched to the repository's Playwright dependency with explicit clipboard permissions. The final screenshots and clipboard results use the built website served by Astro preview, with one browser and one context at a time.

## Screenshots

| Language and viewport | Light | Dark |
| --- | --- | --- |
| English, 375×800 | [Screenshot](en-375-light.png) | [Screenshot](en-375-dark.png) |
| English, 1280×800 | [Screenshot](en-1280-light.png) | [Screenshot](en-1280-dark.png) |
| Traditional Chinese, 375×800 | [Screenshot](zh-Hant-375-light.png) | [Screenshot](zh-Hant-375-dark.png) |
| Traditional Chinese, 1280×800 | [Screenshot](zh-Hant-1280-light.png) | [Screenshot](zh-Hant-1280-dark.png) |
| Japanese, 375×800 | [Screenshot](ja-375-light.png) | [Screenshot](ja-375-dark.png) |
| Japanese, 1280×800 | [Screenshot](ja-1280-light.png) | [Screenshot](ja-1280-dark.png) |

## Limits and handoff

The task explicitly requires unsigned wording. That wording remains in each README, INSTALL, and the website signingStatus key. The existing [0.4.0 release notes](../../releases/0.4.0.md) claim Developer ID signing and notarization. This inconsistency remains for the owner to resolve after inspecting the release build. No release or signing code was changed.

No native installer, Gatekeeper prompt, SmartScreen prompt, real AI-agent installation, uninstall, or live-school operation was executed. No published asset metadata was verified or populated. No screen reader audit was performed. Independent review remains with the parent task. No subagents were spawned.

The Model the Domain principle kept installer cards driven by the existing target registry and signing text in the existing typed locale object. The Prove It Works principle led to real browser geometry, keyboard, and clipboard checks, saved screenshots, and the content comparison. Both leaf skills were read. Technical-writing and unslop guidance shaped the short README prose. The deslop pass found no new abstractions or narrating comments to remove. Only the requested signing markers were added to Markdown.

Implementation, prose review, and verification ran in-thread because this task assigned the implementation sub-agent role.
