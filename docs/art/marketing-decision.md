# Marketing image direction

Show the redesigned product with a believable semester already in progress. Keep the existing website window frame and let the app supply the visual detail.

## Hero comparison

Three browser compositions use the same website heading, spacing, and frame at 1440 pixels wide. Evidence is in `docs/evidence/marketing/hero-reader.png`, `hero-courses.png`, and `hero-course-page.png`.

Choose Courses. The art covers and short course names remain readable when the app is reduced into the website frame. The Reader communicates selection and grounded chat, but its paragraph text is denser at that size. The individual course page belongs beside the course explanation, where a reader can inspect the materials and deadlines.

The final home page uses Courses in the hero, the real course detail beside courses, the populated planner beside planning, and the answered Reader beside reading. Theme buttons swap two real light and dark app captures as well as the website palette.

## Capture decisions

- Reuse the eight-course fixture. Keep six English and Traditional Chinese readings in two folders, five tasks, an exam, three approved study blocks, and eight saved simulated conversations.
- Capture the actual app at 1440 × 900 CSS pixels and 2× resolution. Use a disposable profile, one Electron at a time, no native window chrome, and no paid or school services.
- Use the real sidebar toggle for the course collection so seven current course cards fit completely. Keep the eighth, past course in the fixture.
- Collapse the Planner's empty add-task form and frame its populated Today view.
- Preserve the Reader's selection metadata and source citation. Dismiss the citation hint and onboarding tips before capture.
- Serve the teacher page in the production sandboxed Moodle view. Give its surfaces the native theme variables so dark mode remains readable.
- Reset the course detail scroll position after content loads. Wait for native Moodle theme application before capture.
- Keep WebP quality at 82. Fail above 220,000 bytes per image. Generate AVIF separately, and let Astro generate smaller site images.

## Review trail

The initial capture rejected clipped course cards, an answer placed before its question, a truncated model label, and the empty Planner form. The second review rejected inherited course scroll and white Moodle cards in dark mode. The accepted captures keep controls aligned, source names readable, complete course cards, visible selections and citations, and no cursor or scrollbar overlay.

The original README Reader, Courses, and Moodle images are preserved under `docs/evidence/marketing/before/`. The final contact sheet and size manifest live beside them. Raw full-resolution PNGs and individual review sheets remain local evidence. The source WebP and AVIF files are committed.

## Implementation choices

Model the Domain led to a registry of named view preparations and a manifest keyed by view, theme, and mode. Build the Lever led to the reusable capture script and filtered reshoots that merge their manifest entries. Prove It Works led to real Electron captures and browser checks against the built site.

This is an implementation sub-agent. Independent review remains with the parent coordinator. No nested reviewers were started.
