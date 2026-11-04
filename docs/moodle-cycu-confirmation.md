# Confirm CYCU course contents

1. Start the updated app from the repository root with shape diagnostics enabled.

   ```sh
   MOODLE_DEBUG_SHAPES=1 NODE_OPTIONS=--no-experimental-webstorage pnpm dev
   ```

2. Sign in to the CYCU account if its session has expired.
3. Run Sync once and wait for completion.
4. Open one previously failing course and its Content tab. Use Try again once if a panel reports an error.
5. Check that weekly sections appear. Record any partial-content notice or specific panel error.
6. Send back the terminal's JSON lines whose `phase` is `moodle-call` or `moodle-sync`, including diagnostic lines without timing fields. Include the lines for `core_course_get_contents`, `mod_assign_get_submission_status`, `mod_quiz_get_user_attempts`, and `tool_mobile_get_config`.
7. Stop the app. Omit `MOODLE_DEBUG_SHAPES` from subsequent launches.

The diagnostic contains exception identifiers or up to ten validation paths and codes. The optional shape contains keys, array lengths, and types, capped at 4 KB. It excludes response string values. No response bodies, credentials, or tokens are needed for confirmation.

The fixture `apps/desktop/src/main/moodle/fixtures/contents-4x.json` is synthetic. It reproduces nullable Moodle metadata and exercises numeric strings, labels, unknown module types, and delegated hidden sections. Four nullable-field table cases failed against the original parser. Existing permissive object schemas already accepted extra fields and unknown module names. The original numeric coercion also accepted null instance IDs as zero.

The supplied timing log proves that all 23 contents calls, 22 assignment-status calls, 26 quiz-attempt calls, and two mobile-config calls failed after receiving bytes. It contains no response bodies or exception identifiers. The fixture failures prove a parser defect but do not identify CYCU's exact failing fields. The short assignment and quiz responses may be server exceptions. Their real error codes require the confirmation run.

Assignment status now sends `assignid`, `userid`, and `groupid=0`. Quiz attempts now send `quizid`, `userid`, `status=all`, and `includepreviews=0`. The local Swift client supplies assignment `userid`; the local Moodle app supplies quiz `userid` and `includepreviews`. Missing parameters are a verified difference, not a proven explanation for CYCU's failures.

Permanent optional-call exceptions are cached in memory per account and function, with their error code retained. The cache survives sync clients and resets on sign-in, disconnect, or app restart. Concurrent calls already in flight can still fail once. Transient activity errors and expired tokens remain retryable. Failed status lookups produce unknown submission state.
