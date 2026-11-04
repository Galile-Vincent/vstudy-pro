# Moodle performance investigation

The claim under test is that removing the home detail fan-out and historical-course eager work reduces cold-start calls and wall time at 120 ms per request. The local TLS transport is injected through the existing Fetch parameter. Only that test transport accepts the generated certificate and loopback address. Production network guards are unchanged. This benchmark measures orchestration, not production DNS, TLS setup, Electron rendering, or actual CYCU latency.

The fixture has 47 courses, six current courses, 16 sections and 128 modules per course, eight assignments per current course, and a teaching participant. Responses include realistic HTML descriptions. A 5 ms processing delay is added to the configurable RTT. Error counts and returned sections are asserted. Every run starts with a fresh in-memory database and service. The test transport reuses TLS connections on both sides to isolate call scheduling. Run-to-run measurements are sequential, not alternated. No real-account speedup is claimed.

The machine has 12 cores. Initial load averages were 2.40, 2.65, 2.82. Throughput checkpoint is five baseline runs, inspect call counts and critical-path waits, then one independently checked change per commit. The implementation stays in this worktree. As an implementation sub-agent, all exploration and implementation run in-thread.

Code ownership is already suitable. MoodleClient maps remote payloads, MoodleService owns freshness and concurrency, MoodleRepository persists snapshots in savepoints, typed IPC validates boundaries, and Courses owns rendering. Two candidate designs are a queue around whole course refreshes or a queue around individual remote calls. The latter allows visible contents to pass background panel requests and bounds network pressure across both sync and detail without holding a permit while awaiting child requests.

Reference evidence is in CYCUMoodleCourseCatalogProvider.swift, which limits optional instructor enrichment, and iLearningCourseDetailViewModel.swift, which applies cached data with a five-minute TTL and fetches this-week providers with async let. Repository apply and saveDetail already use savepoints. No per-row-commit fix is justified.

## Results and limits

The final median sync is 1078.27 ms versus 15209.98 ms. Request count across sync, one selected course, and the old home fan-out falls from 349 to 31. All five runs return 47 courses and 16 sections for the selected course. The selected course is a historical course because repository order sorts hashed IDs. Its assignment and grade data now load on demand. The server receives and counts every request inside the timed run. Final sync itself makes 18 requests. Detail enrichment finishes before the total call count is recorded.

The measured limiter is network waiting. During baseline, the Node worker used about 8% CPU. Ninety-four serialized grade and contents requests alone impose about 11.75 seconds at the configured 125 ms response delay. The final sync has six bootstrap calls on its critical path and two waves of six background requests, about one second of imposed waiting. JSON parsing, HTML sanitization and SQLite work account for the remainder. This is a scheduling experiment. The transport configuration is identical across the benchmark sides. A separate real TLS socket test verifies connection reuse and rejection of a private DNS answer on a replacement connection. It does not measure production handshake savings.

`listMs` measures the first nonempty repository snapshot, sampled every 5 ms. It does not measure pixels on screen. `contentMs` measures opening the selected course after sync and returning its sections. `homeMs` measures only the old renderer's awaited per-course fan-out. After removing that behavior, it records the absence of that work, not a claim of a 0.01 ms React render. Cached overview has a separate service test under 100 ms. The benchmark does not reproduce overlap between renderer polling, global sync, and detail fetches. The full real Electron path still needs a real-account session.

Five runs per stage were collected sequentially. They were not interleaved across revisions. The large scheduling difference exceeds the observed ranges, but this is not a controlled real-CYCU network comparison. The fixture returns a short enrolled-user page and no announcement forums. It does not measure deep participant or discussion pagination, notification histories, course-image transfers, production DNS, or safeStorage overhead. Those suspects are not proven causes by these numbers. Image TTL behavior and origin guards have separate tests. Existing image caching and transactional writes already avoid two proposed problems.

Site info is fetched once per sync and capabilities are reused by detail fetches. Images already have a five-minute cache. This patch does not add site-info/public-config TTL caching or a long-lived decrypted-token cache. Their benefit was not established by this benchmark. Three timeline classification requests remain when advertised by a real site to preserve authoritative lifecycle semantics. Background current-course assignment metadata is still fetched per course. The queue bounds the resulting network concurrency to six.

Detail sections return before completion, assignments, quizzes, teachers, announcements and grades finish. Those enrichment groups run in parallel. The detail response exposes aggregate loading and error state. Slow tabs show skeletons; errors allow an explicit retry within the automatic retry guard. Independent per-panel state is emitted for contents, completion, teachers, assignments, quizzes, announcements and grades. Initial enrollment persistence still updates syncedAt through repository.apply before background work completes; progress events, rather than syncedAt, describe active work. There is no global lock shared by accounts.

## Reproduce the benchmark

From the repository root, run `NODE_OPTIONS=--no-experimental-webstorage MOODLE_PERF_OUTPUT="$PWD/docs/test-results/moodle-perf/new-run.txt" pnpm --filter @vstudy/desktop exec vitest run src/main/moodle/perf.test.ts`.

Set `MOODLE_PERF_RTT` to change the 120 ms default. Set `MOODLE_PERF_HOME_FANOUT=1` only when measuring the former renderer behavior. Each invocation appends five raw JSON records. Use a new output file for a new revision.

## Capture a real session

1. From the repository root, run `NODE_OPTIONS=--no-experimental-webstorage pnpm dev 2>&1 | tee /tmp/vstudy-moodle-session.log`.
2. Open Courses with the existing connected account. Wait for sync to finish. Open a current course, then a past course. Press Refresh once if testing a failed load.
3. Run `rg '"phase":"moodle-(call|sync)"' /tmp/vstudy-moodle-session.log > /tmp/vstudy-moodle-timings.jsonl`.
4. Send the contents of `/tmp/vstudy-moodle-timings.jsonl` and state which interaction felt slow.

`moodle-call` records the function, execution ms, response bytes, queueMs, reused, ok and requests. Execution time excludes the scheduler wait. A language fallback can fold two wire requests into one timing record; requests records that count. reused is null for injected transports that do not supply socket metadata. The logger includes no host, token, arguments, course title, response body or exception message. `moodle-sync` records wall ms, wire-call totals, response bytes and the five slowest call records. It covers global sync, while selected-course calls appear as their own moodle-call records.

## Verification

The targeted Moodle, course-renderer and IPC suite passed. The full security check includes lint, the security audit, security lint and the complete Vitest suite. Final typecheck, lint, security:check and build passed. The full suite has 637 passing tests and 14 skipped tests. No live authenticated CYCU session or visual Electron verification was available in this implementation run. No PR was opened, so independent pre-PR review is left to the parent.

Explain the Number kept orchestration results separate from production TLS claims. Model the Domain led to a queue shared by sync and selected-course calls. Sequence Work into Verifiable Units led to the benchmark, home-summary and scheduler commits. All work ran in-thread because this is the implementation sub-agent.
