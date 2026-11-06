# Marketing screenshots

These captures show the real built Electron app with synthetic coursework and saved demo AI conversations. They do not verify a live school or AI provider. No credentials or student records are used.

Run from the repository root after installing dependencies.

```sh
pnpm build
node apps/desktop/scripts/marketing-shots.mjs
```

The pipeline opens one Electron instance with a fresh temporary `--user-data-dir` and removes that profile on exit. It reuses `apps/desktop/e2e/fixtures/art-courses.mjs`, imports six English and Traditional Chinese documents into two folders, creates this week's tasks and an exam through validated IPC, and stores eight sample conversations. The Reader includes a selected passage and a source-linked answer. The fake provider is explicitly enabled. The saved answer is a simulated fixture, not a claim about a model's output.

The isolated fixture fixes generated UUIDs and the renderer clock. Main uses the same epoch with advancing elapsed time so the IPC rate limiter can refill. The capture clock is November 6, 2026 at 10:00 in Asia/Taipei. The viewport is 1440 × 900 CSS pixels at 2×. Captures exclude native window chrome. Onboarding and contextual tips are completed or dismissed, except in the welcome shot. Scrollbars and text carets are hidden for the capture. App content and controls are not restyled. The Courses capture uses the real sidebar toggle and scrolls to the course collection.

The Moodle fixture serves a styled teacher page at `http://127.0.0.1:47831` through the production session-isolated WebContentsView. The capture composites its native pixels at its actual bounds because Chromium's main renderer capture excludes native child views. The fixture's loopback permission never enters production configuration.

The default matrix covers VStudy, Ocean, Grove, Ember, Iris, and Rose, in light and dark. Every shot has a 2880 × 1800 WebP at quality 82 and an AVIF when Sharp supports it. The pipeline fails if either image exceeds 220 KB. It writes all variants to `apps/website/src/assets/shots/`. VStudy light aliases replace the README images here. `course.webp` is the actual course page; `webview.webp` is the separate teacher page. `storage.webp` adds storage settings.

For an isolated reshoot, filter by comma-separated names.

```sh
SHOT_THEMES=ocean SHOT_MODES=dark SHOT_ONLY=reader-chat-with-answer node apps/desktop/scripts/marketing-shots.mjs
```

Filtered runs update matching entries in the evidence manifest and regenerate its contact sheet. Run the complete matrix to start the evidence set again. Raw PNGs stay under `docs/evidence/marketing/raw/`. `docs/evidence/marketing/manifest.json` records dimensions and encoded sizes. `docs/evidence/marketing/contact-sheet.png` is the review sheet. Existing filename aliases remain stable for README links. Astro generates smaller website derivatives and lazy-loads images below the hero.

The website v2 refresh regenerated the full matrix after main `6d26b91`. Course and document art now use soft color fields without stripe, contour, or glyph overlays. All 132 views were visually reviewed across the six packs and both schemes. Review sheets and validation results are in `docs/evidence/website-v2/final/`. The English, Traditional Chinese, and Japanese READMEs share the refreshed filename aliases above.
