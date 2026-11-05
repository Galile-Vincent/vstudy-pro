# Onboarding and learning guidance

A new student chooses a language, appearance, and first task before connecting AI. Setup can be paused, resumed from Home, and reopened from Help or Settings.

`onboarding.tsx` owns the six named steps. It reuses `AppearanceSection`, including the merged theme packs and scheme picker. The school action navigates to Courses with the transient `connectSchool` route flag. Courses owns and opens its existing `ConnectDialog`. The flag is excluded from persisted routes so restarting the app does not reopen sign-in.

`progress.ts` validates the profile-local `vstudy-onboarding-v1` record. Its fields are version, step, goal, status, optional document ID, checklist completions, and dismissed contextual hints. It stores no credentials or document text. A failed localStorage write reports failure before updating the React snapshot. Settings remains authoritative for language, appearance, and `onboardingCompleted`.

`help.tsx` provides Help, a Home checklist, and a dismissible hint for Courses and the reader. A hint stays dismissed across app restarts. The checklist observes document readiness and learning actions. It does not require AI or a school account.

`walkthrough.tsx` renders five offline examples. Each has three captioned states, pause, replay, manual advance, and a complete transcript. Reduced motion starts static with the transcript open. Examples use product tokens and never contact a school or provider. Illustrative content is labelled. Real-app clips supplement the examples.

All added product strings belong to the existing onboarding namespace in English, Traditional Chinese, and Japanese. The optional Welcome page retains its separate welcome namespace and longer reading introduction.

## Verify

Run from `apps/desktop`:

```sh
pnpm build
node e2e/first-time-user.mjs
node e2e/first-run-audit.mjs
node e2e/record-onboarding.mjs
NODE_OPTIONS=--no-experimental-webstorage pnpm exec vitest run src/renderer/onboarding src/renderer/home/home.test.tsx src/shared/i18n.test.ts --pool=forks --maxWorkers=2
```

The first-time-user script runs each language and goal sequentially in fresh profiles. It tests theme selection, pausing and restarting, preserving an imported sample, keyboard selection, Help, hint dismissal, and the walkthroughs. Its school service is a deterministic main-process fixture. The English sample sends a question to the local test provider and reopens the result through conversation search. Native file selection uses a Markdown fixture. None of these checks proves live school authentication, provider billing, VoiceOver usability, or human comprehension.

The first-run audit script captures the current flow and Home checklist without an AI provider. Its baseline mode is for the original renderer at commit `8e429e0477ccbd64245e661ff7d64734bb48d2bc`. Do not run baseline mode against the new sequence.

Screenshots, timings, and accessibility results are under `docs/evidence/onboarding/`. The media generator encodes recorded screen steps with browser MediaRecorder and does not need FFmpeg. One Electron instance runs at a time, and each script closes its instance and removes its temporary profile.

Bundled video requires `media-src self` and WebM/WebVTT response types in the existing app protocol. Caption imports use `?url&no-inline`, so data URLs and external origins remain unnecessary.
