# Courses art direction

Students need to recognize a course and find their next deadline without reading a wall of equally weighted metadata. The existing screen repeated large, nearly empty covers in both Due soon and the course grid. Those blocks pushed the course titles below the initial viewport.

## Three prototypes

The static source is `/tmp/vstudy-courses-prototypes.html`. The comparison is saved in `docs/evidence/art/courses/before/prototypes.png`.

| Direction | Strength | Cost |
| --- | --- | --- |
| A. Gallery | Large artwork and a clear title beneath it. | Repeated tall blocks consume the page. |
| B. Immersive | Strong atmosphere and a unified art header. | Metadata depends on a scrim and is harder to scan across cards. |
| C. Light atlas | Inset artwork, clear title, slim progress, and a quiet action row. | Requires a separate, wider hero treatment inside the course. |

Choose C for the grid and borrow B's continuous artwork for the course hero. Due soon uses compact text cards, so the artwork has one main home on each screen. The title stays below the artwork on course cards. The hero title sits inside the guaranteed dark portion of the scrim.

## Data and ownership

`courseArt(id, term)` returns a pattern and CSS custom properties. A stable hash selects one of four patterns and a semantic chart color, plus gradient geometry. Theme changes recolor the same composition. No artwork state is stored in SQLite. Remote covers share the generated fallback, grain, and scrim. A failed image exposes the fallback.

`CourseProgress` renders only known server completion. Existing course display helpers own bilingual titles, teachers, term filtering, and class labels. Existing Moodle actions own refresh, reminders, calendar export, native webviews, and file opening.

The alternative was to add generated raster covers to each course. That would add image loading, storage, and invalidation work without improving the deterministic CSS compositions. The selected module accepts existing course snapshots and needs no IPC or database migration.

The course assistant keeps the existing `Chat` runtime. That component renders assistant-ui `Thread` and `Composer`. Its quick actions use assistant-ui suggestion components. Additional study tools collapse behind a disclosure so the composer stays visible. The renderer's document context sentence is hidden only within the course composer because the panel already identifies the course.

U1 edits only Courses, a new `courses-art` locale namespace, contrast verification, and fixture/evidence files. Reader, chat, Home, global theme palettes, and IPC contracts remain owned by other streams.

## Verification checkpoints

Blocking work was the dependency installation, a built Electron artifact, and before captures. One implementation owner handled the coupled Courses styles and actions. U2 files did not receive edits. The shared locale registry discovers the additive namespace automatically. Theme roles live in a new CSS file imported once by Courses.

`Model the Domain` led to one deterministic artwork model instead of separate card and hero hashes. `Exhaust the Design Space` led to the three rendered prototypes. `Prove It Works` led to a reusable Electron harness with screenshots, axe checks, keyboard navigation, and a composer geometry assertion.

Before captures cover 1200×768 and 1440×900, VStudy and Ocean, light and dark. They include the first-use coach. Later captures use a completed fixture profile with that coach dismissed. This difference is intentional and recorded here. The coach belongs to onboarding, outside this stream.

## Critique rounds

Round 1 exposed repeated account information above the course hero and poor use of the first viewport. The correction removed the course subtitle and normal connected-account bar from the detail page. Expired and unsaved credential notices remain. Disconnect moved to the detail header after an existing test caught that missing action.

Round 2 exposed two defects. Long translated titles could reach the weak end of the scrim. The hero text now fits entirely inside the section with at least 90% opacity. A new alpha-composite contrast check evaluates a white source image behind that scrim for every shipped theme and contrast setting. The assistant fixture did not have a real course conversation. The reusable seed now persists its public accounts and courses so the real conversation runtime can start.

Round 3 exposed the assistant composer below the panel's lower edge. Three primary prompts remain visible, while extra prompts and material selection collapse under More study tools. The Thread owns the remaining height. The Electron harness asserts that the input fits within the panel and that Escape restores focus to the launcher.

## Reproduce

From `apps/desktop`, run `pnpm build`, then `ART_PHASE=final node e2e/art-courses.mjs`. Run `ART_PHASE=pseudo node e2e/art-courses.mjs` separately for the development-only en-XA locale. Each run closes its Electron instance and uses an isolated profile. The fixture module can also seed later marketing capture scripts.

Evidence is under `docs/evidence/art/courses/`. The final directory contains all nine packs in both schemes, course tabs, sheets, assistant, planner, connect, native-pane toolbar, and loading, empty, and offline states. The pseudo directory contains verified expanded en-XA captures at 720×768 and 125% scale. An additional critique records the narrow header and account layout fixes. The saved JSON logs describe each capture's scope.

The fixture proves presentation and local interaction. It does not prove live school authentication, native Moodle content loading, VoiceOver comprehension, or external provider responses. No independent reviewer ran inside this implementation sub-agent. The parent review remains required before release.
