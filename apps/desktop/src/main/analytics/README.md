# Optional installation analytics

Analytics defaults off. Studying works without it. The renderer UI for disclosure,
consent, onboarding, and deletion is a separate task. This module owns the validated
IPC contract that UI will use through the existing `window.desktop.invoke` preload
bridge. No renderer network permission is needed.

## Privacy boundary

One main-process gateway sends plain fetch batches to PostHog. There is no analytics
SDK, autocapture, session replay, AI observability, or automatic exception upload.
Every event uses an allowlisted Zod schema. Unknown events are dropped. Unknown
properties are stripped. Persisted queue envelopes are validated again before sending. Labels have length and character limits and reject URL,
path, email, IP address, credential-prefix, and long token shapes. Invalid known
properties drop the event. IDs are random UUIDs, never fingerprints.

Collected data includes installation/session/event/request UUIDs, event timestamps,
app version, OS family and major/minor version, architecture, app language, memory
and CPU core-count buckets, display size/scale buckets, Electron/Chrome major
versions, acquisition enum, verified school, feature/source categories, question
character count, reported AI counters, latency, and coarse failure categories.
Device properties accompany app_opened. A local hash prevents repeated unchanged
person-property updates. School matching uses exact bundled registry site URLs,
after Moodle verifies its authenticated site-info URL. Display names never identify
schools. Unknown sites remain unknown. Only the changed profile is queued.

Never collected: names, Moodle/student IDs, email addresses, prompts, answers,
reasoning text, document contents/titles/paths, search terms, credentials, hostnames,
usernames, MAC addresses, serial numbers, exact display resolutions, installed apps,
keystrokes, coordinates, raw error messages, or stack traces. Every event sends
`$geoip_disable: true`. No IP-derived property is sent by the app. PostHog necessarily
receives a transport IP; the app does not claim that pseudonymous data is anonymous.

## Persistence, consent, and delivery

Migration 22 creates analytics_state, analytics_queue, and analytics_seen in the
existing private SQLite store. The installation UUID v4 is generated once and
survives restarts. Each process launch has a new session UUID persisted locally and
embedded in queued events. Consent changes start a fresh session. A stopped or
crashed process cannot guarantee a final session event. Unsent queued summaries
survive restarts without changing IDs; an interrupted partial window is not recovered.

Disabled consent sends nothing and queues nothing. Opt-out immediately aborts the
in-flight fetch and clears the queue. An already transmitted request cannot be
recalled. Re-enabling starts fresh, without replaying withheld activity or requests.
A provider request spanning a consent change does not emit a terminal event later.
Newsletter consent is independent.

The durable queue holds at most 500 events of at most 8 KiB each. Each fetch holds
at most 50 events in memory. A bounded 2,000-ID local ledger suppresses duplicate
producer IDs, including after acknowledgements. PostHog receives the same `uuid`
and `event_id` on retries. The ledger is bounded rather than an indefinite dedupe
history. Queue pressure drops the oldest events. No dropped events are reconstructed.

Flush ticks every 15 seconds, with exponential retry delays from 5 seconds to
5 minutes. Requests time out after 10 seconds and reject redirects. Normal quit
makes one best-effort batch flush with a 2.5-second deadline. Capture failures and
SQLite errors never escape the gateway into studying code.

Activity samples every 5 seconds. `IDLE_THRESHOLD_SECONDS` is 300 seconds.
`SUMMARY_INTERVAL_MS` is 90 seconds. Summaries contain separate foreground-active,
foreground-idle, and background milliseconds. Consent transitions reset all counters.
These are estimates, not exact study-time measurements.

`config.ts` contains the sole default host and public project token. Override with
`VSTUDY_POSTHOG_KEY` and `VSTUDY_POSTHOG_HOST` (HTTPS origin only).
Development and tests are inert unless `VSTUDY_ANALYTICS_ENABLE=1`.
User consent is still required with this override. Node fetch runs in main and is
outside Chromium's renderer CSP and default-session webRequest policy. Both keep
renderer networking blocked. Each attempted batch records `analytics_capture` and
the destination origin in the existing Privacy network-activity inventory.

## Implemented events and ownership

Main owns these events exclusively. Renderer attempts to send them are dropped.

- Lifecycle: app_first_opened, app_opened, app_close_requested,
  app_session_started, app_session_ended, app_focused, app_unfocused, app_minimized,
  app_activity_summary, app_updated.
- AI: ai_request_started, ai_request_completed, ai_request_failed,
  ai_request_cancelled. The adapter wrapper covers API, CLI, and document parsing
  calls through the provider registry. Each adapter invocation gets a random
  request UUID. Provider snapshots are captured before local cost/token estimates.
  Missing counters are null, including when legacy local usage fields contain zero.
  A reported zero remains zero. Total tokens are derived only from two known counts.
  Selected model IDs are used unless the provider supplies actual model usage.
  Failures use a coarse provider_error category. No error bodies are classified.
- Questions: question_asked, question_regenerated, conversation_started,
  conversation_continued, conversation_cleared. Categories come from existing
  selection, course summary/quiz, and scope signals. Subjects remain unknown.
- Moodle: moodle_connection_started, moodle_connection_succeeded,
  moodle_connection_failed, moodle_disconnected. School profiles follow the active overview or latest successful connection.
  Disconnect retains the last school; connected clears when no connections remain.
- Reliability: app_error on uncaught exception monitoring, app_crashed on renderer
  loss, app_performance_sample after the first main window loads.
- Onboarding completion is owned by analytics:completeOnboarding.
- Profile updates use $identify with $set with only the device/acquisition/school allowlist.

Renderer-origin events available to the later UI task are onboarding_started,
onboarding_skipped, settings_opened, screen_viewed, theme_changed, language_changed.
No UI calls are added here. The enum values are in schema.ts.

Deferred events include document reading/annotation/export, study/quiz interaction,
notes, generic feature adoption, response ratings, provider/settings selections,
update failures, and document failure instrumentation. These require their feature
owners and UI/source signals; this core task adds no renderer feature hooks.
Flashcard and explicit question-sharing events are also deferred; no corresponding
complete feature was established in this build. There are no subscription events.

## IPC for the later UI

All channels use the existing trusted-sender registrar and preload validation.
Types are inferred from shared/analytics.ts through IpcRequest/IpcResponse.

| Channel | Request | Response |
| --- | --- | --- |
| analytics:getState | `{}` | `{enabled, onboarding_completed, onboarding, installation_id_present, acquisition_source, deletion_pending}` |
| analytics:setConsent | `{enabled: boolean}` | Same state |
| analytics:completeOnboarding | `{acquisition_source, email_provided: boolean, updates_opted_in: boolean, duration_ms: integer}` | Same state |
| analytics:track | `{event: string, properties: object, event_id?: UUID}` | `{ok: true}`; invalid/disallowed events are silently dropped |
| analytics:requestDeletion | `{}` | `{pending: true, installation_id: UUID, method: 'contact', contact_url, instructions}` |

Acquisition values are friend_classmate, instagram, threads, x, youtube, github,
search_engine, teacher_school, other, prefer_not_to_say. Duration is 0–86,400,000 ms.
Onboarding accepts no email field. Optional AppIpcOptions.newsletterConsent is a
separate callback receiving only the two consent booleans. The newsletter task must
own address validation, explicit opt-in, receipts, secure backend delivery, and
unsubscribe. A newsletter failure does not fail onboarding.

Deletion records a local pending flag, turns analytics off, and clears unsent data.
It does not claim cloud deletion is complete. The public capture token cannot
query/delete people. No private credential ships in Electron. The UI should show a
copyable ID and private publisher contact flow using the returned instructions.
The repository URL is a publisher discovery fallback, not a public-ID submission
form. A project owner must supply a dedicated private support address or deletion
backend before the deletion UI ships. The operator must delete both person and
events. Resetting the local ID alone never deletes cloud history.

[PostHog API authentication](https://posthog.com/docs/api) documents public capture
versus authenticated deletion. [Persons](https://posthog.com/docs/data/persons)
documents deletion of person data and associated events.

## Operational decisions still required

The project owner must set cloud retention and restrict analytics access to approved
product/reliability maintainers. Suggested policy is 90 days of raw events and no
small-school cohort exports below 10 installations. This is a proposed policy, not
an applied PostHog configuration. Newsletter storage/access/retention needs separate
approval. The renderer task must disclose pseudonymous tracking and leave analytics
and newsletter consent unchecked initially.

Tests cover PII-shaped properties, consent, no withheld-event replay, opt-out abort,
durable retry/deduplication/bounds, school changes, device buckets, token provenance,
and stream ownership. live.test.ts is skipped unless both VSTUDY_ANALYTICS_LIVE=1
and VSTUDY_ANALYTICS_ENABLE=1 are set. It sends exactly one synthetic app_opened with
fabricated device buckets and writes node_modules/.cache/analytics/live-payload.json in the worktree.
Never enable it for routine CI.
