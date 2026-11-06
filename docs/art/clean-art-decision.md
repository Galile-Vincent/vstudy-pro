# Calm course art and appearance changes

Students need to scan coursework without contour lines, grain, permanent header rules, or abrupt theme changes.
The U4 change keeps the existing card hierarchy and controls. It replaces the decoration and appearance update behavior.

## Art decision

The throwaway prototypes live at `/tmp/vstudy-clean-art-<theme>-<scheme>.html`.
Run `node e2e/clean-art-prototypes.mjs` from `apps/desktop` to regenerate them and the comparison screenshots.
The [all-theme comparison](../evidence/art/clean/prototypes/all-themes.png) contains all nine packs in both schemes, with card and hero proportions.

| Direction | Card observation | Hero observation | Decision |
| --- | --- | --- | --- |
| Aurora field | Broad blends leave pills and completion readable. | One translucent curve supplies identity without drawing a line. | Selected. |
| Soft wave | The wave becomes a horizontal stripe. | The lower edge divides the hero into bands. | Rejected. |
| Halo | The circle attracts attention before the labels. | Its bright center competes with the title. | Rejected. |

`courseArt(id, term)` returns deterministic CSS variables for hue, field position, and the deadline accent.
The hue offset stays within 35 degrees of the theme accent. The second field is 30 to 50 degrees away.
`soft-art.css` owns two large radial fields, a low-chroma base, and one low-contrast filled curve.
The fields use OKLCH relative colors. They need no raster assets, filters, grain, dots, contour strokes, or dither.
Course cards and heroes use the same treatment. Home and Library document cards share it through `DocumentArt`.
Empty course states use diluted fields. High contrast and forced colors use flat surfaces.
Remote course images remain supported and retain their existing scrim and failure fallback.

## Borderless chrome

`useScrollChrome` marks the actual scrolling element with `data-scrolled` when it passes one pixel.
The shell, Reader, Settings, and Library use that state to reveal an opacity-only gradient fade below their bars.
At rest, those bars have no bottom border or shadow. Nonsticky course and section headers remain borderless.
The Reader has a nested `.reading-scroll` element. Watching its outer pane misses the actual scroll.
Keyboard focus indicators and table rules remain available.

## Transition decision

`createThemeTransition` owns one active snapshot, one fallback cleanup timer, and a generation counter.
A newer change cancels the previous snapshot. Late callbacks cannot paint a stale selection.
`applyAppearance(settings, true)` is the user entry point. Startup, initial cache reads, and system synchronization use immediate updates.
Identical persisted slider values do not cancel their preview transition.
Layout preferences remain independent of appearance animation.

| Approach | Observed behavior | Decision |
| --- | --- | --- |
| Registered tokens | Smooth computed colors and gradient inputs. Scheme-dependent CSS and material changes can switch independently. | Fallback when snapshots are unavailable or refused. |
| View Transitions | Blends the complete window, including scheme-dependent art, glass, and controls. | Preferred in Electron. |

The cross-fade lasts 280 ms with `cubic-bezier(.2,.8,.2,1)`.
All 31 theme colors have inheriting `<color>` registrations. Glass opacity has a percentage registration.
The fallback scopes transitions to the root tokens and color properties during a user change.
No permanent transition rules affect first paint or normal interaction.
Reduced motion disables both paths.
Native background colors interpolate for 280 ms, cancel older targets, and respect the system motion setting.
Vibrancy updates only when its requested value changes.

## Visual critique rounds

Round one removed the contour SVG and grain. The card labels stayed crisp.
The page backdrop still overpowered the softened covers, and the hero deadline chip still glowed.
Round two reduced the backdrop field weights from 48 and 40 percent to 18 and 14 percent and removed that glow.
The [final course grid](../evidence/art/clean/round-2/course-grid.png) gives the cover art more space than the backdrop.
The [dark Ember hero](../evidence/art/clean/round-2/ember-dark-course-en-100-1440.png) retains a readable title and a quiet right side.
The [Ocean Library](../evidence/art/clean/round-2/chrome-ocean-light-library-1440.png) uses the same curve without the old orbit rings.
The [Reader at rest](../evidence/art/clean/transitions/workspace-rest.png) has no horizontal header rule.

The first transition run found that slider persistence cancelled preview animation. A regression test now covers it.
The scroll check found the nested Reader scroller and corrected the fade selector.
A later screenshot check caught the test switching before the Settings entrance had painted.
The harness now waits for that entrance and verifies that the dialog bounds do not change during the theme switch.

## Evidence and measurements

- [Before captures](../evidence/art/clean/before/) include course cards, hero, Home, Library, Reader, and Settings at 1200x768 and 1440x900, in VStudy and Ocean light and dark. The chrome baseline was captured from the original source before restoring the implementation.
- [Round one](../evidence/art/clean/round-1/) records the first implementation and its language and width checks.
- [Round two](../evidence/art/clean/round-2/verification.json) records all nine packs in light and dark, axe checks, all course tabs, connection and detail surfaces, empty and loading states, and the assistant keyboard path.
- [Chrome checks](../evidence/art/clean/round-2/chrome-verification.json) cover Home, Library, Reader, and Settings in two packs, both schemes, and both requested window sizes.
- [Pseudo-localization](../evidence/art/clean/pseudo/verification.json) covers en-XA at 720x768 and 125 percent scale in light and dark. The main matrix also covers English, Traditional Chinese, and Japanese, minimum, default, and wide windows.
- [Transition checks](../evidence/art/clean/transitions/verification.json) contain exact compositor offsets, separate live captures, native colors, fallback colors, and frame intervals.

The exact 0, 80, 160, and 320 ms screenshots pause the real compositor animation at those offsets.
A stable background pixel changes from `[181,186,197]` to `[103,109,124]`, `[88,94,110]`, and `[85,91,107]`.
The separate `*-live-<offset>ms.png` captures run without pausing. Actual capture request times are recorded beside each image.
For Courses, the native colors at approximately 0, 83, 163, and 322 ms were `#171B28`, `#7F828A`, `#D0D1D7`, and `#F5F6FA`.

Five alternating snapshot and token trials run on each of the Courses and Reader with chat screens, without screenshots during timing.
The fixtures use seven visible course cards and a long local Markdown document with saved fake-provider chat.
The machine had 12 logical CPUs and a load average of 2.78 before measurement. Other worktrees also ran checks.
No trial recorded a layout shift. Snapshot trials occasionally took about 33 ms between frames during snapshot setup.
Token trials were steadier, with maximum gaps below 23 ms in this run.
These are renderer animation observations, not a promise of uninterrupted 60 fps on every screen or machine.
The snapshot path wins on complete visual blending, not on a claimed performance improvement.

## Verification commands

Run from the repository root unless a desktop-relative command is shown.

- `pnpm typecheck` passes for desktop and website.
- `pnpm lint` passes for desktop and website.
- `pnpm knip` passes with its existing CSS configuration hint.
- `pnpm vendor:check` passes. No vendor component changed.
- `pnpm --filter @vstudy/desktop contrast:check` passes for every pack, scheme, and contrast step, including the existing cover-label and hero-scrim checks.
- `pnpm security:check` runs reviewed dependency policy, lint, security lint, contrast, and the complete two-worker unit suite.
- `pnpm --filter @vstudy/desktop build` produces the Electron artifact.
- From `apps/desktop`, `ART_PHASE=round-2 node e2e/clean-art.mjs`, `ART_PHASE=round-2 node e2e/clean-chrome.mjs`, `ART_PHASE=pseudo node e2e/clean-art.mjs`, and `node e2e/theme-transitions.mjs` pass.

The final full suite passes 1,007 tests across 134 files. It retains 14 skipped tests across five optional transport and live-provider files.
Security policy reports existing reviewed advisories and three existing dynamic-URL warnings.
The visual fixtures do not prove live-school authentication, Moodle image delivery, or live-provider behavior.
An independent parent review remains outside this implementation sub-agent's work. No PR was opened.

Model the Domain shaped the single transition controller and deterministic cover variables.
Prove It Works shaped the repeatable Electron checks and rendered-pixel evidence.
The implementation and design comparison ran in-thread because this task assigns the implementation sub-agent directly.
