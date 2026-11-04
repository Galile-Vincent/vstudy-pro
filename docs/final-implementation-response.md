# Final implementation response

Work continued on main after both audit workers. Historical reports remain unchanged; this document distinguishes implementation, measured evidence and acceptance gaps. Runtime evidence is retained under `/tmp/vstudy-final/` on this machine.

## 1. Security and privacy UI

Settings now has per-CLI opt-in toggles, file-only pre-consent detection, validated native executable selection, and main-owned changed-binary confirmation. Onboarding step two offers the same individual OFF-by-default choices and can be skipped. Native binary-change, external-link/mail and converter installation dialogs use all three locale catalogs.

Privacy lists the bounded session activity inventory (action, local time and destination), converter download disclosure, Retry, persistent Offline mode, configurable idle shutdown and typed deletion confirmation. No packet-level or complete third-party traffic visibility is claimed. Byte counts are currently unknown. A legacy deletion control was removed; deletion IPC also requires the confirmation token before the existing native confirmation.

Converter failures cross the renderer boundary as stable localized codes with Retry/Offline guidance. Raw worker stderr is never shown. Welcome copy now discloses conversation history, metadata, selected text, earlier context and the outline/opening excerpt path; saved versus session-only keys are distinguished. README and the Welcome contract document implementation limits.

New-screen matrix: Settings Providers, Privacy and onboarding step two × en/zh-Hant/ja × light/dark × 720/1200. Screenshots and full axe results are in `/tmp/vstudy-final/screens/`. Scrolled captures include deletion controls, Settings CLI paths/toggles and onboarding API/Skip actions. The activity fixture stubs native external opening; it does not open a real website.

## 2. Keychain

The synchronous safeStorage interface was replaced with Electron 42 asynchronous encryption/decryption. Construction, presence checks, provider availability and locked model discovery never access Keychain. Saving or explicitly unlocking a key starts access; each operation has a ten-second deadline. No late timed-out operation writes a saved key. UI exposes waiting, localized access failure, Retry and memory-only use. Saved keys require unlocking again after restart.

`secrets.test.ts` covers encrypted persistence, denied access, slow access and no calls during construction/presence checks. Provider tests assert zero decryption/fetches during locked discovery. These are mocked Keychain checks. Real signed/unsigned macOS Keychain prompt acceptance is not proven by them or by packaged mock-Keychain smoke.

## 3. Converter lifecycle

No Python converter is started on launch. First required-format conversion or explicit Privacy Retry initializes it. There is no idle prewarm. Both the manager and worker use the configured idle limit (default five minutes, range one–sixty).

`e2e/converter-lifecycle.mjs` verifies zero launch workers, a worker after real generated DOCX conversion, exit after a configured idle minute and successful restart. It reports cold first-import time and worker RSS to `/tmp/vstudy-final/converter-lifecycle.json`. This removes the audit's launch allocation; it does not reduce active-worker RSS.

The original audit's 128–140 MB launch RSS and original PERFORMANCE.md measurements are historical baselines. The generated DOCX probe is not CH2, and filesystem/cache/contention conditions differ. The retained eighteen-page CH2 fixture was recovered from the previous benchmark namespace. The current probe verifies all eighteen progress events, identical cold/warm Markdown, first-page paint before final completion, warm first page <1.5 s and warm total <4 s. It uses a prepared venv; genuine first-install download time is excluded.

## 4. Reader and performance

Removed the unused generative Markdown/map/Mermaid registry and remote favicon loader. Validated structured tables use the existing DataTable directly. Math plugins/KaTeX CSS load only for math-bearing content. The highlighter loads its core and explicitly named language grammars on demand, with no automatic all-language detection. Optional package dependencies and the JSX HTML-sink lint exemption were removed.

The optional table presentation chunk is about 20 kB. The initial application chunk fell from about 4.03 MB before the pipeline split to 2.89 MB. Chat is a separate 1.01 MB chunk and reader rendering about 122 kB; math about 519 kB and highlighting core about 97 kB load separately, with individual grammars on demand. The initial application chunk remains large. See production build logs for exact bytes.

The reader implements Arrow/Home/End movement and Shift extension through Chromium Selection.modify without editable content. `selection-chat.mjs` selects an arbitrary five-character passage with keyboard input, uses Cmd+Shift+K and verifies the selection reaches the composer, then retains the existing mouse-selection/chat/persistence assertions.

The main-thread CPU profile identified repeated full executable hashing during disabled CLI path discovery: about 1.89 seconds in hash updates across the ten-open loop, plus large buffer allocations. Discovery now reads only validated file metadata; full content hashing remains on explicit pin/actual use and streams in small chunks. Pin-change confirmation, writable-binary rejection and deleted-path behavior remain tested. The after-profile has zero disabled-discovery hash samples. A targeted ten-open run measured p50 15.4 ms/max 26.4 ms; full final-run figures are recorded below. Chat initialization is also deferred past metadata paint, and document navigation skips optional snapshots in both directions. Finite probes do not establish a hard worst-case latency guarantee. `library-perf.mjs` can capture the first open CPU profile with `VSTUDY_PERF_TRACE=1`; the profile is saved separately from ordinary timing samples. Instrumented and uninstrumented values must not be mixed. The original audit reported 1,564 ms cold content open in its 5,000-document corpus. The current 5,000-document benchmark reports a separate cold content metric, and a fresh-process 6,500-byte Markdown probe measured 74.4 ms. Different fixtures and Electron versions prevent a controlled speedup claim. `scripts/measure-reader.mjs` provides a defined fresh-process exploratory probe, not an equivalent audit replay.

Welcome fixes found during acceptance: shell navigation no longer steals heading focus; citation jumps use relative bounding rectangles rather than offsetTop from another coordinate system; rem tokens now resolve against the standard root font size while body text retains its token. Existing keyboard, alignment and type-size assertions remain.

## 5. E2E execution

`pnpm e2e` packages once and runs every e2e entry serially against the stable output, with process-group deadlines, individual logs and a pass/fail/skip table. Welcome performance uses the existing dropped-frame/CLS/long-frame gate; a single failed attempt is retained before one retry. Expensive full locale/screenshot matrices have longer explicit deadlines.

Model-switch tests use a deterministic additional fake model with effort/priority controls. Exact table cells replace whitespace-dependent innerText matching. PDF tests prepare the locked converter and native installation consent. Welcome tests open the collapsed navigation through the current UI. The old document morph assertion was obsolete after the previous worker deliberately removed snapshots from document navigation; it now asserts that no snapshot starts and the reader opens. No scripts were deleted.

Opt-in live Codex checks are reported as skipped when not configured, rather than counted as passing. Final acceptance explicitly enables the live check; it verifies a real reply, persisted reported usage and Stop. Clean full-run manifests, including failures, are retained under `/tmp/vstudy-final/`.

## 6. Security and packaging

`pnpm security:check` includes the reviewed-advisory gate, dangerous-API/Electron lint and normal tests. The gate allows documented reviewed advisories; passing it is not a claim of zero dependency advisories. Both final suite runs prepare an unsigned package. Package smoke verifies the ad-hoc signature/fuses and real import/conversion/fake-chat persistence with an isolated user-data directory and mock Keychain. Developer ID signing, notarization, stapling, Gatekeeper and real Keychain remain unverified.

## 7. Documentation

README covers features, installation/development/checks/package commands, provider consent and executable choices, Keychain/session keys, privacy/network limits, supported languages, local deletion, converter controls, macOS-only/unsigned builds and no OCR. The docs index lists every Markdown document and its purpose. Architecture and product-design references identify the current consent/security contract. Historical audit/design evidence remains dated provenance.

## Measured performance

| Probe | Before / historical reference | Current final probes |
| --- | --- | --- |
| Python at launch | Original audit: 128–140 MB; F1 had already removed eager startup before this pass | Zero converter workers / zero Python RSS at launch in both lifecycle runs |
| Cold generated DOCX import, prepared venv | Exploratory pre-discovery-fix sample: 8.73 s (contended, not a controlled baseline) | 4.84 s / 3.84 s; active-worker RSS 167.8 / 169.6 MiB; idle exit and restart pass |
| CH2 warm first page / completion | Historical same-file reference: 122 / 1,272 ms | 78.5 / 1,215 ms; both targets pass |
| CH2 cold worker, prepared venv | Not equivalent to the historical prewarmed app | First page 3,925.6 ms; completion 4,814 ms; startup cost is deferred to first conversion |
| Metadata paint, ten opens in 5k-doc DB | Audit max 98 ms; our pre-fix traces reproduced 98–132 ms native main tasks | Run 1 p50/max 15.6/30 ms; run 2 16.6/31.9 ms; zero timeouts |
| First document content, 5k-doc DB | Historical audit: 1,564 ms | Run 1 46.6 ms; run 2 44.8 ms |
| Fresh-process small Markdown probe | No equivalent captured baseline | 74.4 ms for 6,500 source bytes, warm filesystem cache |
| Grid frames / mounted cards | Prior worker p95 18.3 ms / 27 cards | Final runs p95 18.2/18.2 ms, max 20.3/19.8 ms, 27 cards |

CH2 emits all eighteen page progress events, paints before final completion and has the same Markdown SHA-256 as both retained prior benchmark files (`e6c2e251437506db73561546957a5659aff495e9c64fe5f7e5569af3e74efcfe`). The cold/warm fixture difference is only a trailing PDF comment to avoid deduplication. The venv is already installed. Python/package download time is not measured here. Historical Electron versions, filesystem cache and machine load differ, so the tables do not establish causal speedup ratios or hard worst-case guarantees. One exploratory grid probe recorded an 83.8 ms maximum frame; both final serial probes above were below 21 ms. Earlier overlapping own sweeps were stopped and excluded from final acceptance.

Artifacts: `/tmp/vstudy-final/ch2-performance.json`, `converter-lifecycle.json`, `reader-performance.json`, per-run `library-perf.mjs.log` and `converter-lifecycle.mjs.log`, `metadata-main-profile-summary.json` (before hash fix), latest `metadata-main.cpuprofile`, and the `metadata-*-timeline.json` traces. The original before CPU profile was overwritten by a rerun; its inspected stack summary is retained.

## Acceptance result

Both final serial runs completed **27/27 PASS**, including live Codex and packaged smoke, with zero skips. Run 1 used a supplied locked venv; run 2 created its own locked environment automatically with uv/CPython 3.12.14. Each Welcome performance first attempt failed its dropped-frame/long-frame gate; each passed the single allowed retry. The original failures and retry metrics remain retained. This is host-sensitive timing, not a claim of consistently clean first-attempt performance.

| Verification | Final result | Local evidence |
| --- | --- | --- |
| Typecheck | PASS | [typecheck log](/tmp/vstudy-final/checks/typecheck.log) |
| Lint, Electron rules, reviewed-advisory gate, normal tests | PASS; 287 passed / 8 opt-in skipped; zero ordinary lint violations | [security gate log](/tmp/vstudy-final/checks/security-check.log) |
| Build and development smoke | PASS; visible sandboxed window, no renderer Node, typed bridge and settings persistence | [build/smoke log](/tmp/vstudy-final/checks/smoke.log) |
| Package and packaged smoke | PASS in both full runs; mock Keychain | [first smoke](/tmp/vstudy-final/final-1/packaged-smoke.mjs.log), [second smoke](/tmp/vstudy-final/final-2/packaged-smoke.mjs.log) |
| Complete E2E run 1 | 27 PASS / 0 FAIL / 0 SKIP | [manifest](/tmp/vstudy-final/final-1/results.json) |
| Complete E2E run 2 | 27 PASS / 0 FAIL / 0 SKIP | [manifest](/tmp/vstudy-final/final-2/results.json) |
| Accessibility | 144-state regression matrix and 36 new-screen audits per run; denied-Keychain audit; zero violations | [matrix](/tmp/vstudy-final/final-2/a11y-matrix.json), [new screens](/tmp/vstudy-final/final-2/privacy-axe.json), [Keychain](/tmp/vstudy-final/final-2/keychain-axe.json) |
| Screenshots | 74 PNG captures saved and inspected, plus four contact sheets | [contact sheet](/tmp/vstudy-final/screens/contact.png) |
| Frame gate retry disclosure | First-attempt failures retained in both runs; one successful retry each | [retry summary](/tmp/vstudy-final/welcome-retries.json) |

Unverified: real macOS Keychain authorization/encryption in an unsigned package; Developer ID signing, notarization, stapling and Gatekeeper acceptance; manual VoiceOver/physical native drag/OS-preference acceptance; a controlled replay of the original cold-reader corpus and cold filesystem cache. The initial app bundle and active Python worker remain substantial. The session activity inventory does not expose opaque third-party packets or byte counts, and passing the reviewed-advisory gate does not mean zero advisories.
