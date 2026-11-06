Goal. Make the Electron first-run onboarding calm, monochrome, and constant in size across all eight steps.

## Before critique

Inferred from inspecting every before image in both schemes.

- Welcome looked like a screenshot pasted into a panel. The black image rectangle disagreed with the dark panel, the light edges disappeared, and fixture usage numbers distracted from the product. The colored brand also disagreed with the requested monochrome dialog.
- Language put its label and control hundreds of pixels apart. The empty area looked broken rather than intentional.
- Appearance exposed theme packs, creation tools, and interface settings before the user had started. The selected outline crowded the next heading, and the controls continued below the fold.
- Acquisition stretched a small optional question into ten oversized blocks.
- Privacy separated related paragraphs and consent actions with excess empty space.
- Goal cards used height without adding useful information. Their rhythm differed from the other choices.
- AI had a dense single-column explanation and competing setup actions.
- Start let a large walkthrough push the caption, transcript, and practical action out of the initial view. The example also showed a raw `preview_passage` key.

Measured. The baseline frame was 880 × 760. The start body needed 903 pixels inside a 509-pixel region. Baseline screenshots are `before-{dark,light}-{step}.png` in this directory.

## Design and refinement

Inferred. A 720 × 640 frame gives short steps an intentional reading width and leaves room for disclosures. Pixel dimensions keep the outer frame independent of root text scaling. Existing spacing, `--ob-tone`, `Button`, `Dialog`, and `ThemePreview` provide the visual vocabulary.

Measured. Round one replaced the stretched grid with top-aligned content, introduced shared native radio cards, merged language with four UI-scale samples, removed the full AppearanceSection from onboarding, and reduced the frame. Every step measured 720 × 640. AI still needed 477 pixels in a 401-pixel body.

Measured. Round two changed AI to a two-column definition list while retaining its disclosure text. It made Back and Save quiet, preloaded both hero schemes, and used the existing root View Transition at 320 ms. All eight default-size bodies fit.

Measured. Round three recaptured the real reader and chat at 150% source text size for a more legible hero. Capture-only CSS hides usage counters and the floating scroll button. The fixture answer is shorter, and the chat is positioned at its beginning. The hero has a deliberate rounded border in both schemes. Native radio focus, immediate checked states, explicit selection of the detected language, and error rollback were verified. A closed walkthrough mounts no animation or completion timer. The final 200% review caught an image grid shrinking behind its clipping boundary. Aligning the hero frame to its content fixed that crop, and the capture script now checks the image bounds directly.

Inferred. I disagree with keeping a fourth abstract System language card after the detection addendum. Three native language names communicate the current result more directly. The stored value remains `auto` until a deliberate click or keyboard selection. I also removed the brand lockup from every step, including welcome, and put the unchanged start walkthrough behind Watch walkthroughs. This keeps the first task in view. Privacy retains equal consent buttons rather than an emphasized primary choice.

Measured. Appearance contains only System, Light, and Dark. Theme packs and interface controls remain in Settings. The default theme remains `vstudy`. Both UI scale and scheme selections use `settings:set` and `applyAppearance`. The progress model still has eight steps, so no progress migration was needed.

## Geometry and final images

Measured. Each entry below is width × height in CSS pixels at a 1280 × 800 content viewport and device scale 2. The same dimensions were measured in dark and light at both 100% and 200%. See `after-3-sizes.json`, `scale-200-sizes.json`, and their console logs for all 32 rows, positions, scroll heights, and overflow checks.

| Step | Dark 100% | Light 100% | Dark 200% | Light 200% | Best dark screenshot | Best light screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| Welcome | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [welcome](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-welcome.png) | [welcome](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-welcome.png) |
| Language | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [language](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-language.png) | [language](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-language.png) |
| Appearance | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [appearance](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-appearance.png) | [appearance](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-appearance.png) |
| Acquisition | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [acquisition](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-acquisition.png) | [acquisition](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-acquisition.png) |
| Privacy | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [privacy](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-privacy.png) | [privacy](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-privacy.png) |
| Goal | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [goal](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-goal.png) | [goal](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-goal.png) |
| Ai | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [ai](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-ai.png) | [ai](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-ai.png) |
| Start | 720 × 640 | 720 × 640 | 720 × 640 | 720 × 640 | [start](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-dark-start.png) | [start](/Users/vincent/vstudy-pro/docs/evidence/onboarding/design-pass/after-3-light-start.png) |

Measured. No default-size body scrolls. No dialog scrolls or has horizontal body overflow at either scale. At 200%, welcome, language, acquisition, privacy, goal, AI, and start use body scrolling. Appearance fits. The footer remains outside the scroll region.

## Detection and transition evidence

Measured. `VSTUDY_LOCALE=ja`, `zh-TW`, and `en` each preselect the resolved language and retain `auto`. Both schemes were captured as `detected-ja-{scheme}-language.png`, `detected-zh-TW-{scheme}-language.png`, and `detected-en-{scheme}-language.png`. The audit also clicks the detected card and checks that its explicit language is saved, then uses arrow keys to select another language and verifies a visible focus outline.

Measured. The existing View Transitions API now cross-fades the root for 320 ms with `cubic-bezier(.2,.8,.2,1)`. System-following changes use the same transition, so welcome blends as well. Token fallback blends the preloaded light hero through opacity. Reduced motion applies immediately.

Measured. `transition-verification.json` records ten real compositor frames per screen at 0, 40, 80, 120, 160, 200, 240, 280, 320, and 400 ms. The compositor is paused at exact offsets, not sampled through slow screenshot timing. These are deterministic frames rather than an unpaused video. Dialog bounds are identical before and after. The sampled panel changes from 255 to intermediate gray values to 17. Both frame sheets were visually inspected and show a blend, including the hero, rather than an instantaneous image swap. Entrance animations finish before recording begins.

## Verification

Measured. All commands ran against the built Electron artifact or local source. The final outputs are saved beside this report.

- `pnpm typecheck` passed. See `typecheck.log`.
- `pnpm build` passed. See `final-build.log`.
- `NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer/onboarding src/shared src/renderer/home --pool=forks --maxWorkers=2` passed 16 files and 57 tests. See `vitest.log`.
- The transition suite passed six tests. See `theme-transition-tests.log`.
- `node e2e/first-time-user.mjs` passed all nine language and goal combinations. See `first-time-user.log`.
- The final capture audit passed 16 axe checks with no serious or critical violations. Keyboard focus and forced-color screenshots are included.
- `pnpm contrast:check` passed all built-in theme contrast settings. See `contrast.log`.
- The repository-root `pnpm knip` passed its configured files, dependencies, unlisted, and binaries checks. It prints one CSS configuration hint. See `knip.log`.
- A separate bare `pnpm knip` from the desktop directory invokes the binary with its default scope and reports 100 files, including manually invoked e2e scripts, plus existing unused exports. Its output is retained in `knip-final.log`. No used script or unrelated export was deleted to satisfy that broader scan.
- `git diff --check` passed. The existing Vite process still listens on 127.0.0.1:5173.

Measured. The original first-time-user script failed before the redesign with the following output. It skipped the acquisition and privacy steps before looking for the school goal. See `before-first-time-user.log`.

```text
locator.check: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('input[value=school]')
```

Measured. The script now uses native language and scheme radios, walks all eight steps, and opens the existing reader-tip popover before testing dismissal. Intermediate verification exposed asynchronous radio checks and stale bundled files during a concurrent rebuild. Checked states now update immediately with rollback on failure, and the final acceptance run ran after the last build. The final run has no failing cases.

## Reuse

Measured. The documented command from `apps/desktop` is:

```sh
pnpm build && node e2e/capture-onboarding-steps.mjs after-3 --audit
```

Measured. `e2e/capture-onboarding-transition.mjs` records the scheme frame sequence. `VSTUDY_CAPTURE_SCALE=200` and `VSTUDY_LOCALE=ja`, `zh-TW`, or `en` extend the step capture. See `src/renderer/onboarding/README.md`.

## Limits and principles

Measured. The optional newsletter was unavailable in this fresh-profile configuration. Its configured visible layout was not captured. Expanded walkthroughs and enlarged text can scroll by design. Live school sign-in, external AI billing, and VoiceOver were not exercised. School and AI acceptance use fixtures.

Measured. The existing AI disclosure still ends with an unconditional statement that VStudy sends no analytics. The privacy step offers optional analytics consent. That pre-existing copy inconsistency is preserved because this task explicitly protects disclosure text.

Inferred. The default layout is ready for design review. Native-speaker review of the short revised copy remains useful.

Inferred. Laziness Protocol kept the existing eight-step state machine and Settings controls. Model the Domain led to one typed radio-card shape shared by language, UI scale, scheme, and goal. Build the Lever produced the reusable capture and transition scripts. Prove It Works required inspecting the actual Electron screenshots and compositor pixels instead of treating a build as visual proof.

Measured. No commit, stash, checkout, or reset was performed. Existing unrelated working-tree edits remain in place.
