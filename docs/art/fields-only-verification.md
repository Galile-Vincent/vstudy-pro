# Fields-only art follow-up

Students should see soft cover fields throughout the app, including courses with supplied cover images.
The coordinator found diagonal lines on CS305 and SCI108 in the previous Ocean grid.

## Cause and change

The gradient generator had no pattern variants left. `CourseArtwork` still overlaid `course.imageUrl`.
The reusable fixture supplied striped SVG images for exactly those two courses.
The image path bypassed the generated artwork and affected both cards and the course hero.

The renderer now ignores course-provided images for cover decoration.
The existing Moodle metadata remains intact. No fixture was changed to hide the failing inputs.
Obsolete image and glyph CSS rules were deleted.
Course, Home, and Library cards have only two radial fields and the existing smooth scrim.
They have no curve. Heroes retain one filled curve at six percent opacity.
High contrast remains flat, including empty course states.
Semantic completion indicators, deadlines, and focus rings retain their meaning and readability.

Fix Root Causes removed the shared image overlay that reintroduced patterns.
Prove It Works shaped the input-preserving tests and enlarged Electron capture checks.

## Regression coverage

`cover.test.tsx` checks 500 deterministic IDs across four term values, all nine themes, and both schemes.
Those 36,000 course renderings include a supplied hatch image. None can emit an image, SVG, pattern, canvas, or extra decorative layer.
Another 9,000 Home and Library document-art renderings use the same IDs and theme contexts.
The stylesheet check rejects repeating and conic gradients, image URLs, strokes, filters, border outlines, shadows, and pattern selectors in the shared artwork CSS.

The Electron runner retains the original striped image fixtures.
It audits all 18 grids, both affected heroes, Home and Library art, and empty course states.
Each grid has a normal screenshot and a seven-cover contact sheet captured at actual 200 percent Electron zoom.
The latter contains native captures of every cover after scrolling it into view.
The runner verifies a zoom factor of two and 720 CSS pixels in a 1440-pixel window.
It flushes the compositor before native capture, then crops native pixels using the zoom-adjusted bounds.
The saved enlarged covers contain the actual code, deadline, and completion labels.

A pixel check samples an undecorated central field region of each affected cover.
It measures the largest horizontal or vertical RGB second difference.
The limit of eight allows gradient quantization and rejects the previous striped screenshots.
The old CS305 and SCI108 crops score 26 and 21. New captures score at most six, and the flat high-contrast captures score zero.
This check supplements the DOM and stylesheet assertions. It does not claim to identify every possible pattern in an arbitrary image.

## Evidence

- [Previous striped grid](../evidence/art/clean/round-2/course-grid.png).
- [Ocean light grid](../evidence/art/clean/fields-only/ocean-light-grid-1x.png).
- [Ocean dark enlarged covers](../evidence/art/clean/fields-only/ocean-dark-grid-2x.png).
- [CS305 at 200 percent zoom](../evidence/art/clean/fields-only/ocean-light-CS305-2x.png).
- [SCI108 at 200 percent zoom](../evidence/art/clean/fields-only/ocean-light-SCI108-2x.png).
- [All-theme captures and verification data](../evidence/art/clean/fields-only/verification.json).

Every theme has `<theme>-<scheme>-grid-1x.png` and `<theme>-<scheme>-grid-2x.png`.
The contact sheets assemble native enlarged crops without resizing their pixels.
The final cell is transparent when seven covers occupy a two-column contact sheet.

## Commands and results

Local `main` was fast-forwarded first to `e41052e`, the coordinator's merge of the earlier commits.
An SSH fetch failed public-key authentication. The local main ref already contained the requested merge.

- `pnpm typecheck` passes for desktop and website.
- `pnpm lint` passes for desktop and website.
- `pnpm knip` passes with its existing CSS configuration hint.
- `pnpm test --pool=forks --maxWorkers=2` passes 1,026 tests. Fourteen existing optional tests remain skipped.
- `pnpm --filter @vstudy/desktop build` passes.
- From `apps/desktop`, `node e2e/fields-only-art.mjs` passes all theme and scheme checks, actual 200 percent captures, and the before/after pixel comparison.

The full test command also runs the existing contrast audit for all themes and contrast levels.
Checks ran in-thread with one Electron instance at a time.
Moodle content came from the original fixture. No live-school or provider claim is made.
