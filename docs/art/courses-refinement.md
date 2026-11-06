# Courses color and hero refinement

The first Courses redesign had the right structure but its covers mixed back into dark theme colors. Ember became brown and the hero's broad 90% scrim hid the artwork. This round makes the art visible while preserving the course actions and Quiet folio chrome.

## Palette and layout

The deterministic identity still uses the course ID and term. It now also returns a hue offset, a 40–90 degree hue gap, and a lightness value. Relative OKLCH colors derive from the active accent. Two hues, a luminous highlight, and a deeper gradient stop create each composition. Thin SVG contours remain crisp as art scales. Image-backed covers blend their luminance into the same palette.

The page keeps Quiet folio's base mesh and adds stronger accent-derived color behind the grid. Courses aliases its 20px radius, 10px controls, glass, and ring-plus-24px shadow roles. The sidebar and top bar come directly from U2.

Cards use 180px artwork with a due chip at the top right and a 44px progress ring at the bottom right. The code stays at the bottom left. A 20px semibold title and a 12px teacher line sit in a shorter body. Completion is still exposed through a real labelled progress element. Missing progress remains absent.

The hero bleeds through the page gutters directly beneath the top bar. Its navigation, code pill, 32px title, teacher chips, glass actions, and glowing next deadline overlay continuous artwork. The text region has a minimum 76% scrim. The contrast script tests that opacity over a worst-case white source for every theme and contrast setting. High contrast uses flat surfaces, visible ink progress rings, and no glow or contour art.

The CSS color audit permits only relative OKLCH expressions sourced from approved semantic tokens. Literal OKLCH colors remain rejected. The shared contrast script retains both the Courses checker and U2's contrastRatio import and checks.

## Critique and evidence

Before captures used main at 3a6ba28. The latest main, 5d12844, was then merged during refinement, so final captures include Quiet folio's sidebar and top bar. The before/after card comparison isolates the Courses change from that shared chrome change.

Round 1 replaced muddy covers with vivid color but the box-shadow motif made broad bands. The correction uses fine SVG contours and explicitly sets the media's flex basis so the old 142px rule cannot shrink it.

Round 2 compares the actual card with both owner references in one board. It keeps the first reference's quiet type below art and the second's saturated color. The final correction makes the high-contrast ring use ink and removes its deadline glow.

The result is geometric gradient artwork rather than raster marble. It is generated without remote image requests and retains a stable identity across launches. This follows the owner references' color, composition, and hierarchy without adding heavy cover assets.

Evidence lives in `docs/evidence/art/courses/refine/`. Before and both critique rounds include Ember and Grove in both schemes. Final includes 80 Electron screenshots plus the reference comparison and before/after boards. It covers all nine packs in both schemes, home, grid, course hero, card close-up, and 720px/1200px layouts. The reusable capture and comparison scripts are in `apps/desktop/e2e/`.

The PNGs remain local under the repository's generated-evidence ignore rule. Text critiques, verification records, source, and tests are committed.

## Verification

Build, desktop typecheck, lint, knip, and contrast checks pass after the U2 merge. The full suite passes with 997 tests and 14 skipped. No independent reviewer ran inside this implementation sub-agent. The captures use the public Moodle fixture and prove presentation and local keyboard opening, not live school authentication or VoiceOver comprehension.

Model the Domain keeps hue and geometry in one deterministic artwork model. Prove It Works adds the real Electron matrix and reference comparison boards. The same eight-course fixture remains reusable for later marketing captures.
