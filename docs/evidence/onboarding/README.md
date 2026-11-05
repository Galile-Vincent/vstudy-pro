# Onboarding evidence

The screenshots come from fresh Electron profiles. School and AI replies use test fixtures. The captions and films contain no real credentials. Machine-driven timings are not human usability results.

Start with these captures:

- [Original provider screen](before-2.png).
- [Merged theme picker](en-sample-appearance.png).
- [Goal choice](en-sample-goal.png).
- [Optional AI explanation](en-sample-ai.png).
- [Merged school picker](en-school-school-picker.png).
- [Home checklist](after-home.png).
- [Selection walkthrough](en-sample-walkthrough-selection.png).
- [Real clip playback](en-sample-recorded-video.png).

`baseline.json` records the pre-change first run. `after.json` records the current sequence. `first-time-user.json` contains the nine-case matrix, screenshot names, timings, and axe results. `case-en-sample.json` adds the last playback and subtitle verification after recording regeneration.

`merged-tests.txt` is the final 62-test focused run with two workers and Node web storage disabled. `unit-tests.txt` is the one allowed full-suite attempt before the merge. Its host DOM-storage failures and subsequent checks are explained in `../../FIRST_RUN_AUDIT.md`. Typecheck, lint, contrast, and security outputs are separate text files. The dependency audit has an unreviewed minimatch advisory.

The clips live in `apps/desktop/resources/onboarding/`. Regeneration instructions are in that directory and the renderer onboarding README. The bundled videos are deterministic, captioned screen steps, not continuous mouse recordings.
