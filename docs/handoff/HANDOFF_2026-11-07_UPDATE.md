# Handoff update (2026-11-07)

Follows `HANDOFF_2026-11-06.md`. Branch: `feat/ui-overhaul-onboarding-courses-settings`.

## Done since the last handoff
- **Settings review fixes.** AI disclosures (`novice:privacy`, `step_access`, `step_key`) show once, before the key fields. Tab orientation follows the rendered layout and ArrowLeft/ArrowRight work at 200 percent text. Scrollbar thumb contrast is 4.54:1 light and 4.40:1 dark. Provider dividers are back. `capture-settings.mjs` asserts dimensions, contrast, disclosures, keyboard behavior and zero renderer errors.
- **Courses.** List and Cards view switch, stored in `localStorage['vstudy.courses.view']`, default List, hidden below 560px (the list layout shows then). The first-run hint is a one-line strip. Cards wrap their meta and counts, so nothing overflows at 200 percent text.
- **Scripts.** `welcome-details`, `analytics-ui`, `ai-cli-layout`, `theme-transitions`, `themes` and `novice-ai-setup` run again. `storage.mjs` needed no change.
- The full desktop suite passes (1,693 tests). `grants.test.ts` did not fail in two separate full runs, so the pre-push hook works without `--no-verify`.

## Still open
- Custom themes cannot be deleted from the UI.
- Owner decisions: analytics wording, new schools by name in analytics, school logos.
- Native speaker review of the zh-Hant and ja strings, including `moodle:view_label`, `view_list`, `view_cards`.
- Not verified: real trackpad swipes, Windows touchpads, mouse buttons, live sign-in at new schools, VoiceOver.
- The cause of the earlier `grants.test.ts` failure is unconfirmed. It may be intermittent.
