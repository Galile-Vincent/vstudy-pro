# Marketing screenshots

These are captures of the real built Electron app with synthetic coursework, saved demo conversations, and synthetic subscription usage. They do not verify live schools, provider answers, or account quotas. No student records, credentials, or personal profiles are used.

Run from the repository root after installing dependencies:

```sh
pnpm build
node apps/desktop/scripts/marketing-shots.mjs
```

The pipeline opens a disposable Electron profile and sets HOME and XDG_CONFIG_HOME to that profile. CLI discovery and subscription read handlers return synthetic fixtures; no tool is installed or signed in. Analytics and study memory are disabled in the fixture. The profile is removed on exit.

`marketing-seed.mjs` reuses the eight-course art fixture, imports six Markdown readings into two folders and a generated PDF worksheet with selectable text and an embedded graph, links readings to course folders, and seeds tasks, an exam, approved study blocks, saved chats and usage. The PDF goes through the real converter; its first setup can take several minutes and downloads the app's pinned conversion packages. No school or paid AI service is contacted. `marketing-document.mjs` defines the synthetic worksheet. `marketing-webview.mjs` serves the fake teacher page over loopback inside the production isolated Moodle WebContentsView.

The renderer clock is fixed. By default the capture epoch is tomorrow at 02:00 UTC so the production planner's already-bound real clock accepts future study blocks. Set SHOT_DATE to an ISO timestamp within the next fourteen days to reproduce a capture date while it remains valid. Main's replacement clock advances elapsed time so security rate limiting can refill. Generated main-process UUIDs use a deterministic sequence.

The viewport is 1440 × 900 CSS pixels at 2×, excluding native window chrome. The pipeline saves 2880 × 1800 PNG originals under `docs/evidence/marketing/raw/`, WebP quality 82 and AVIF quality 50/effort 2 derivatives under `apps/website/src/assets/shots/`. Every derivative must remain below 220,000 bytes. AVIF is generated when Sharp supports it. Onboarding tips are dismissed except in the welcome view; scrollbars and carets are hidden. Product controls and content are not restyled. Visible images are decoded and error alerts rejected before capture.

The 17 views cover courses, course detail, planner, answered reader, history, course folders, home, appearance, Moodle, storage, welcome, converted figures, original page, page attachment, usage, Connect AI, and school discovery. Each is captured in all nine built-in palettes (VStudy, Ocean, Grove, Ember, Iris, Rose, Slate, Paper, High contrast), light and dark: 306 captures. The website's interactive switcher previews the first six packs. Appearance shows Card transparency and the default document opening method.

Native child Moodle pixels are composited at their actual bounds because the main renderer capture excludes native child views. Fixture-only loopback access does not enter production configuration.

VStudy light aliases supply README images and the default website shots. `reader.webp` shows a saved simulated answer. `original.webp`, `figures.webp`, `capture.webp`, `usage.webp`, and `connect-ai.webp` show the new workflows. `course.webp` and `webview.webp` remain distinct.

For filtered reshoots:

```sh
SHOT_THEMES=ocean SHOT_MODES=dark SHOT_ONLY=reader-chat-with-answer node apps/desktop/scripts/marketing-shots.mjs
```

Filters accept comma-separated values. SHOT_ONLY merges updated entries into the existing manifest. A complete unfiltered run resets the manifest and removes orphaned shot derivatives. `manifest.json` records dimensions, byte sizes and the actual epoch; `contact-sheet.png` is the full review sheet. Raw originals and per-palette review PNGs are ignored by Git. The existing tracked full contact sheet is regenerated. The website lets Astro generate smaller derivatives and lazy-loads images below the hero. `public/og.png` is brand-only and does not embed an app capture.
