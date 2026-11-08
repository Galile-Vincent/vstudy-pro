# Download cards implementation report

The owner's goal is to restore the original installer-card content at the top of the download page, improve it with Apple and Windows logos, and replace the arrows in the header and home Download buttons with the matching OS logo. The owner subsequently requested only supported downloads. Intel Mac and Windows ARM64 cards and the entire Other platforms section are omitted.

## Changes

- `apps/website/src/components/DownloadPage.astro` restores architecture names, chip and OS requirements, and DMG or EXE format descriptions. Each supported asset has one fully clickable card, a compact primary action, and a keyboard focus ring. The six remaining collapsed help sections retain their order. Checksum and verification links remain intact.
- `apps/website/src/components/PlatformLogo.astro` holds the shared monochrome Apple and Windows SVG paths. The icons use currentColor and aria-hidden. Visible text identifies their meaning.
- `apps/website/src/components/OsDownloadButton.astro` supplies the existing localized device labels and matching logos to the header and home buttons. The server renders the neutral Download label with both icons hidden. Existing OS detection updates the label and icon. Unknown devices retain the neutral label.
- `apps/website/src/layouts/Base.astro` uses that same button in the header and preserves aria-current.
- `apps/website/src/styles/download.css` supplies equal desktop columns, stacked mobile cards, tinted logo containers, hover feedback, and focus outlines from the existing design tokens.
- `apps/website/src/data/install-copy.ts` removes Other platforms and planned-platform strings in English, Traditional Chinese, and Japanese. All three signingStatus blocks keep their original wording.

Visibility remains registry-driven in DownloadPage.astro through `installers.filter(installer => installer.releaseEnabled)`. The inventory in `apps/website/src/data/downloads.ts` already reads `apps/desktop/distribution-targets.json`. Enabling another target there automatically adds its localized card on the next website build. The registry itself was not edited. Version and size still render only when releaseMetadata contains verified values. That registry currently has no values.

## Design and visual inspection

The original lower cards were inspected in the b468f4e7 source and download-guide screenshot. Their architecture, requirements, format, and whole-card interaction return at the top. The owner's updated two-card layout replaces the original four-card inventory.

The first iteration had excessive mobile padding and download actions that looked too quiet. The second iteration removes the extra inset, uses compact filled actions, and reduces the Windows mark from 28px to 24px to balance its visual weight against Apple. Initial captures remain in iteration-1-mobile.png and iteration-1-desktop.png.

I inspected individual mobile, desktop, dark, focus, and hover captures, plus contact sheets covering all 12 download layouts and 24 home layouts. The final cards align on desktop, keep consistent spacing, and have clear contrast in both schemes. Hover is deliberately subtle. Focus is substantially stronger. English and Japanese header labels wrap onto two lines on mobile. This keeps their full labels legible but makes that button denser than the Chinese version.

Measured card bottoms are 658.5px for English mobile and 681.6px for Chinese and Japanese mobile. Desktop bottoms are 443.3px for English and Japanese and 466.4px for Chinese. All fit the 800px viewport. Every measured scrollWidth equals its viewport width.

## Verification

- Website typecheck and lint each pass with 50 files, zero errors, zero warnings, and zero hints.
- Website build passes with 64 pages.
- Website verify:static passes with 3,715 checked local links and zero failures.
- The production browser runner passes 12 download combinations across en, zh-Hant, ja, 375px, 1280px, light, and dark. It compares visible installer IDs against registry-enabled targets, checks both cards fit, confirms absent disabled targets and copy, checks focus and hover, opens 72 help sections by keyboard, and verifies 36 real clipboard writes.
- The same runner captures 24 home combinations for Mac and Windows. All three Download buttons on each home page have the correct localized labels and OS logos without arrows. Unknown devices and disabled JavaScript retain neutral labels and hidden icons.
- pnpm knip passes. It emits the existing compiled CSS configuration hint.
- The README checker passes with 262 local Markdown links across 10 files.
- The actual lefthook pre-push hook passes. MCP has 132 passing tests, desktop has 2,707, and newsletter has 25. Existing skipped tests remain skipped.
- The first pre-push attempt failed because Electron was not fully installed in this fresh worktree. Running Electron's local dependency installer repaired it. The complete hook passed on rerun. No desktop source changed.
- git diff --check passes.

Logs, browser.json, and the rerunnable verify-browser.cjs are in this directory. The website has no separate package test command. Its static verifier and production browser runner provide website behavior coverage.

## Evidence and limits

Primary screenshots are en-375-light.png, en-1280-dark.png, zh-Hant-375-dark.png, and ja-375-light.png. All other locale and theme captures use the same naming pattern. Home screenshots use home-{locale}-{mac|win}-{width}-{theme}.png. Focus and hover captures use the corresponding prefixes. Three contact sheets summarize the full matrix.

The runner uses the production Astro preview at http://127.0.0.1:4322. Start it with `pnpm --filter @vstudy/website preview --host 127.0.0.1 --port 4322` after building. Run `node docs/evidence/download-cards/verify-browser.cjs` from the repository root.

Chromium was verified. Firefox, Safari, actual installer execution, and downloading release binaries were not verified. Future target enablement was checked through registry-driven rendering and current inventory equality, without changing release flags. No independent reviewer was spawned because this task is the implementation sub-agent's assigned work. No PR was opened, and nothing was pushed, deployed, or tagged.

Model the Domain kept visibility in the existing installer registry and logos in one typed component. Prove It Works led to production screenshots, measured viewport bounds, keyboard checks, and real clipboard comparisons.

The throughput checkpoint used source inspection and dependency setup as blocking steps. Independent command checks ran concurrently. Source edits remained serialized in this worktree. One implementation owner was the smallest safe decomposition because the cards and buttons share the same platform presentation.

Branch is t3/download-cards. Implementation revision is f38aaac617da5db066aa0bb81172aad64b9eb945. The report-only commit follows that revision. The final handoff records the final HEAD.

Dispatch ledger. All work ran in-thread because the requested role is the implementation sub-agent.
