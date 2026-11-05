# First-run audit

A new student must reach one useful task without knowing Moodle, AI providers, or the app's navigation.

## Baseline

Captured the unmodified app with `pnpm build` and `node e2e/first-run-audit.mjs` from `apps/desktop`. The script creates a temporary user-data directory, enables no provider, captures each screen, and closes Electron. The profile is deleted afterward. Screenshots are in `docs/evidence/onboarding/before-*.png`. `baseline.json` contains the visible copy and automated elapsed time. That time is machine-driven navigation, not a human usability measurement.

## Confusion found

| Point | What a stranger encounters | Required change |
| --- | --- | --- |
| Welcome | A reading-only description does not explain school coursework or deadlines. | Describe both school work and document reading in one screen. |
| Language | Language is below the illustration and shares space with an optional name field. | Give language its own early step; remove the name request. |
| Appearance | No first-run appearance choice. | Reuse current Settings appearance controls. |
| Goal | No school connection entry point or clear choice of what to do first. | Offer school, own documents, and sample paths. |
| AI | The second screen starts with three unfamiliar product names and CLI terminology. | Explain optional AI in plain words before offering setup. |
| AI layout | The provider screen scrolls far beyond the initial window; its navigation is below provider paths and key fields. | Move detailed account setup to existing Settings after a short disclosure. |
| Cost | Free local reading and potentially paid AI are mixed into long paragraphs. | Give each a separate, short explanation. |
| Privacy | Important disclosures exist, but are buried in the longest step. | Show them before explicit school, model, or import actions. |
| Skip | Skip advances only one step. Escape silently completes onboarding. | Offer an explicit exit that saves progress and a visible resume action. |
| Resume | Step and goal are lost when the app closes. | Persist the named step and goal within this app profile. |
| First task | Finishing with no document leads to an upload screen without a goal or checklist. | Offer a task-specific next action and a Home checklist. |
| Media | A static preview and a separate reading demo do not teach school connection, due work, deadline questions, or finding old chats. | Add five offline, captioned walkthroughs with controls and static fallback. |
| Help | Reopening onboarding requires finding Settings. | Add a persistent Help menu with setup, walkthroughs, and shortcuts. |
| Context | Selection and conversation controls assume the user knows what they do. | Add dismissible, saved hints near those workflows. |
| Import claims | The upload copy mentions EPUB and text recognition, while supported formats do not include EPUB and the app has no OCR. | Correct instructions before asking for a file. |

## Design decision

Use a six-step named sequence and one saved goal. Keep existing Settings and Courses responsible for account setup. Offline walkthroughs are illustrative UI diagrams, visibly labelled examples. They never pretend to be a live AI answer. A separate Help library keeps the initial sequence short. Local reading and sample import need no provider key.

The saved state contains only version, step, goal, status, checklist completions, and dismissed hints. It contains no school credentials, document text, or API keys. Settings remains authoritative for language, appearance, and whether first run opens automatically.

## Throughput checkpoint

- Blocking first steps were dependency installation, baseline build, and fresh-profile capture.
- One implementation delegate owns the coherent onboarding flow. No nested agents or extra servers run.
- School and theme streams retain their own implementations. This stream uses existing navigation and `AppearanceSection`.
- Verify the saved flow first, then the media and contextual guidance, then all three goal paths in one sequential Electron script.

## Verification results

The results below describe the merged implementation and current evidence.

### Shipped changes

The flow now saves its named step, selected goal, and imported document ID. Save and leave keeps a visible Resume setup action on Home. The app also restores the same imported sample after an actual restart. A completed guide can be reopened from Help or Settings.

After merging main, the appearance step reuses the full theme picker, including System, Light, Dark, and the built-in theme packs. The school goal uses a transient route flag to open the existing Connect dialog. The flag is not persisted, so reloading Courses does not reopen login.

The five interactive walkthroughs teach school connection, finding due work, asking the course assistant, asking about a selection, and finding document chat history. They have captions, pause, replay, manual advance, and reduced-motion transcripts. Two additional clips use real app screenshots with English UI and subtitles in all three languages. They are recorded steps rather than continuous mouse recordings. The media generator uses browser canvas capture and MediaRecorder after native Playwright/FFmpeg capture could not start on this host.

Home shows four learning tasks with progress. Help exposes setup, walkthroughs, and shortcuts. Courses and the reader show an accessible first-time hint that remains dismissed after restarting. The old repeating reader hint was removed. Import instructions now list supported formats and explicitly say that scanned PDFs are not supported.

### Check results

- The fresh-profile matrix completes all three goals in all three languages. It selects Ocean through the merged theme picker, tests explicit dark appearance at 720 px, and checks Help and persistent hint dismissal. `first-time-user.json` contains screenshots, automated timings, and accessibility results.
- The English sample case pauses and restarts twice, including after sample import. It selects text through the keyboard, sends a question to the local fake provider, finds the saved chat through conversation search, and plays a bundled clip with subtitle tracks.
- School connection, due work, and opening the course assistant use deterministic main-process replies. School selection and sign-in use the actual merged dialog. No real school credentials, external AI call, converter installation, or Keychain permission is required.
- Typecheck and lint pass after the merge. The focused merged run passes 62 tests across 10 files. It includes onboarding state and playback, locale contracts, Home, school connection and search, appearance application, themes, and CSP restrictions. `NODE_OPTIONS=--no-experimental-webstorage` avoids the host Node localStorage collision in DOM tests.
- The full suite was run once before the merge as requested. It reported 718 passed, 14 skipped, and 15 failures caused by the host localStorage collision. Eleven failures were in unchanged school tests, and four were in the new progress tests. The new progress tests now explicitly use DOM storage. All affected tests pass in the final focused run. The full suite was not repeated under the RAM rule.
- The theme contrast and semantic CSS check passes. The Electron runs report no serious or critical axe violations in checked onboarding and Help states. The Impeccable detector returned no findings before the merge; subsequent visual fixes were checked in the real app.
- Security lint passes with the repository's two already-allowed dynamic external-link warnings. The dependency audit remains blocked by unreviewed advisory `1244623`, GHSA-g3hv-75wg-m249, in minimatch through build tooling. This stream changes no dependencies or lockfile entries. The affected resolved versions reported by the audit are 9.0.9 and 10.2.6.

### Security and integration boundaries

The app protocol adds only bundled WebM and WebVTT content types. CSP permits media from self only. Caption assets are emitted as files rather than data URLs. External connections remain denied in the renderer. No new IPC or credential handling is added.

Shared integration edits are limited to the app mount, shell Help entry and transient route field, the reader Help entry, the Courses initial-dialog flag, and the static media protocol/CSP support. Onboarding strings remain in the existing onboarding namespace. Schools, themes, their locale namespaces, and Settings are preserved from main.

### Limits

Automated timings measure scripted navigation, not a student's reading or comprehension time. Live school authentication, paid providers, native Keychain prompts, VoiceOver, and a study with first-time students remain unverified. Traditional Chinese and Japanese copy and subtitles still need native-speaker review. Conversation search instructions match the current document-scoped search; they do not claim global chat search. Independent code and design review belongs to the coordinator before shipping.

### Automated task timings

These are scripted times in milliseconds, including automated UI checks before the first task. They are not predictions of human completion time.

| Language | Goal | First task, ms | Whole script, ms | Evidence |
| --- | --- | ---: | ---: | --- |
| en | school | 1588 | 3355 | [First task](evidence/onboarding/en-school-first-task.png) |
| en | documents | 1065 | 2899 | [First task](evidence/onboarding/en-documents-first-task.png) |
| en | sample | 3227 | 5726 | [First task](evidence/onboarding/en-sample-first-task.png) |
| zh-Hant | school | 1436 | 3155 | [First task](evidence/onboarding/zh-Hant-school-first-task.png) |
| zh-Hant | documents | 1149 | 2904 | [First task](evidence/onboarding/zh-Hant-documents-first-task.png) |
| zh-Hant | sample | 1768 | 3638 | [First task](evidence/onboarding/zh-Hant-sample-first-task.png) |
| ja | school | 1447 | 3208 | [First task](evidence/onboarding/ja-school-first-task.png) |
| ja | documents | 1156 | 3004 | [First task](evidence/onboarding/ja-documents-first-task.png) |
| ja | sample | 1692 | 3685 | [First task](evidence/onboarding/ja-sample-first-task.png) |

Model the Domain shaped the saved step, goal, status, document ID, checklist, and dismissal record. Experience First put a useful task ahead of optional AI setup. Prove It Works required fresh Electron profiles, actual restarts, visible controls, and decoder/subtitle checks.
