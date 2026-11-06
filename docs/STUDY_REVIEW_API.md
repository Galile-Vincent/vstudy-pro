# W1 study review foundation API

All persistence is local. Opening a store performs migrations only; it never starts workers. No renderer, preload event or locale changes are part of W1.

## Pure modules

Paths below are relative to `apps/desktop/src`. Interfaces are exported from their respective module; their exact field definitions are in source.

```ts
// main/review/concept-match.ts
normalizeText(value: string): string;
conceptKey(value: string): string;
matchConcept<T extends ConceptCandidate>(label: string, catalog: readonly T[]): T | undefined;
containsAlias(text: string, alias: string): boolean;
// ConceptCandidate = {key:string; label:string; aliases?:readonly string[]}

// main/review/classify.ts
classify(input: ClassificationInput): Classification;
// AUTO_FILE_CONFIDENCE = .8; TENTATIVE_CONFIDENCE = .5

// main/review/episodes.ts
localDay(at: string, timeZone: string): string;
buildEpisodes<T extends TimedEvidence>(observations: readonly T[], timeZone?: string): Episode<T>[];
// EPISODE_GAP_MS = 21600000

// main/review/mastery.ts
computeMastery(observations: readonly MasteryObservation[], options: MasteryOptions): MasteryResult;
// MasteryOptions = {now:number; timeZone?:string; userState?:'none'|'dismissed';
//   understoodAt?:string|null; attempts?:readonly MasteryAttempt[]}
// Result = {state:'candidate'|'watching'|'needs_review'|'dismissed';
//   risk:number; negative:number; positive:number; episodeCount:number; nextReviewAt:string|null}
// NEGATIVE_HALF_LIFE_DAYS=21, POSITIVE_HALF_LIFE_DAYS=30,
// SELF_REPORT_WEIGHT=.1, UNDERSTOOD_HIDE_DAYS=14, REVIEW_INTERVAL_DAYS=[1,3,7,14]

// main/review/eligibility.ts
isEligibleSource(source: EligibleSource): boolean;
eligibleSourceSql: string;
// SQL aliases required: j=job,c=conversation,d=optional document,
// u=user message,a=assistant message,l=chat link.
// Applies source provenance and assignment revision; tentative confidence gating
// is a separate aggregation rule in computeCourseMastery.
```

## Repository

`main/review/repository.ts` exports `ReviewRepository`. Every method is synchronous. Input IDs are UUID strings; times are ISO UTC strings. The injected clock returns Unix milliseconds.

Type aliases used below are documentation shorthand for `z.output<typeof study*Schema>` exported through `shared/review.ts`: Course, Unit, Concept, ChatLink, Observation, JobSummary, Prefs. `Page<T> = {items:T[];nextCursor:{at:string;id:string}|null}`; `PageInput = {limit?:number;cursor?:{at:string;id:string}}`. The limit defaults to 50 and is capped at 100.

```ts
new ReviewRepository(db: DatabaseSync, clock?: () => number);
getPrefs(): Prefs;
setPrefs(input: {memoryEnabled?:boolean|undefined; noticeAcknowledged?:boolean|undefined;
  timeZone?:string|undefined}): Prefs;
erase(): void;
createCourse(input: {title:string; aliases?:string[]}): Course;
getCourse(id:string): Course|null;
updateCourse(id:string, input:{title?:string|undefined;aliases?:string[]|undefined}): Course;
archiveCourse(id:string, archived:boolean): void;
linkMoodle(id:string, moodleCourseId:string|null): Course;
materializeMoodleCourse(moodleCourseId:string): Course;
listCourses(input:PageInput & {includeArchived?:boolean}): Page<Course>;
listUnits(input:PageInput & {courseId:string}): Page<Unit>;
seedMoodleUnits(courseId:string): void;
seedHeadings(courseId:string, unitId:string|null, headings:readonly string[]): void;
linkDocument(courseId:string, documentId:string, headings?:readonly string[]): void;
unlinkDocument(courseId:string, documentId:string): void;
assignChat(conversationId:string, courseId:string|null): ChatLink;
excludeChat(conversationId:string, excluded:boolean): ChatLink;
inbox(input:PageInput): Page<ChatLink>;
listConcepts(input:PageInput & {courseId:string}): Page<Concept>;
addConcept(input:{courseId:string;label:string;unitId?:string|null;note?:string|null}): Concept;
editConcept(id:string, changes:{label?:string|undefined;note?:string|null|undefined}): Concept;
dismissConcept(id:string): void;
restoreConcept(id:string): void;
understoodConcept(id:string): void;
observationsPage(input:PageInput & {courseId:string}): Page<Observation>;
editObservation(id:string, changes:{weaknessNote?:string|null|undefined;
  dismissed?:boolean|undefined;resolved?:boolean|undefined}): void;
deleteObservation(id:string): void;
jobsPage(input:PageInput & {courseId:string}): Page<JobSummary>;
editJob(id:string, changes:{questionSummary:string}): void;
masteryPage(input:PageInput & {courseId:string}, now:number): Page<Concept & {mastery:MasteryResult}>;
computeCourseMastery(courseId:string, now:number): (Concept & {mastery:MasteryResult})[];
```

Course assignment retains evidence, detaches old units and converts unknown destination concepts into proposals. Exclude/undo updates revisions; stale pending/running work is cancelled. Jobs pages include successful exchanges that yielded no concept observations.

Worker extraction commits must supply `study_jobs.assignmentRevision` and `study_observations.wrongAttempt` for qualifying gave-up evidence. W2 owns proposal promotion, job enqueue/claim/commit/retry and recovery. No provider calls occur in the repository.

Shared contract exports from `shared/review.ts`: `studyIdSchema`, `studyPrefsSchema`,
`studyCourseSchema`, `studyUnitSchema`, `studyConceptSchema`, `studyObservationSchema`,
`studyJobSummarySchema`, `studyJobEditSchema`, `studyChatLinkSchema`, `studyCursorSchema`,
`studyPageInputSchema`, `studyCourseInputSchema`, `studyConceptInputSchema`, `reviewIpc`,
and types `StudyPrefs`, `StudyPageInput`.

## IPC

`shared/review.ts` exports `reviewIpc`, spread into `ipcContract`. Generic validated invoke works for every channel below. Request/response schemas in `reviewIpc` are authoritative. Mutations returning no domain object return `{ok:true}`.

| Channel | Request | Response |
|---|---|---|
| review:courses:create | {title, aliases?} | Course |
| review:courses:update | {courseId, changes:{title?,aliases?}} | Course |
| review:courses:list | PageInput + {includeArchived?} | Page&lt;Course&gt; |
| review:courses:get | {courseId} | Course or null |
| review:courses:archive | {courseId, archived} | ack |
| review:courses:link-moodle | {courseId, moodleCourseId:null or UUID} | Course |
| review:courses:materialize | {moodleCourseId} | Course |
| review:courses:units | PageInput + {courseId} | Page&lt;Unit&gt; |
| review:courses:mastery | PageInput + {courseId} | Page&lt;Concept with mastery&gt; |
| review:docs:link | {courseId, documentId} | ack |
| review:docs:unlink | {courseId, documentId} | ack |
| review:chat:assign | {conversationId, courseId:null or UUID} | ChatLink |
| review:chat:exclude | {conversationId, excluded} | ChatLink |
| review:chat:inbox | PageInput | Page&lt;ChatLink&gt; |
| review:concepts:list | PageInput + {courseId} | Page&lt;Concept&gt; |
| review:concepts:add | {courseId,label,unitId?,note?} | Concept |
| review:concepts:edit | {conceptId,changes:{label?,note?}} | Concept |
| review:concepts:dismiss | {conceptId} | ack |
| review:concepts:restore | {conceptId} | ack |
| review:concepts:understood | {conceptId} | ack |
| review:observations:page | PageInput + {courseId} | Page&lt;Observation&gt; |
| review:observations:edit | {observationId,changes:{weaknessNote?,dismissed?,resolved?}} | ack |
| review:observations:delete | {observationId} | ack |
| review:jobs:page | PageInput + {courseId} | Page&lt;JobSummary&gt; |
| review:jobs:edit | {jobId,changes:{questionSummary}} | ack |
| review:prefs:get | {} | Prefs |
| review:prefs:set | {memoryEnabled?,noticeAcknowledged?,timeZone?} | Prefs |
| review:prefs:erase | {} | ack |

Document linking reads at most 64 KiB of the active Markdown in main and seeds at most 80 headings. It never creates Moodle file rows. Observation pages contain quotes and source IDs; job pages contain question summaries and source IDs. Lists use keyset pagination. Memory defaults enabled; preferences have their own strict `studyPrefs` settings key.

`main/ipc/review.ts` exports:
```ts
registerReviewIpc(
  registrar: ReturnType<typeof createIpcRegistrar>, store: Store,
  implemented: Set<IpcChannel>
): ReviewRepository;
```

## Workers and restore

`main/review/workers.ts` exports:
```ts
interface ReviewWorker {
  suspend(): void; // synchronously reject, abort and fence work
  resume(): void;
  waitForIdle(): Promise<void>;
  dispose(): void | Promise<void>;
}
class ReviewWorkerRegistry {
  register(worker:ReviewWorker): () => void;
  suspend(reason?:string): void;
  resume(reason?:string): void;
  waitForIdle(): Promise<void>;
  dispose(): Promise<void>;
}
reviewWorkers: ReviewWorkerRegistry; // inert singleton, W2/W3 register services here
```

Suspension reasons are independent. Storage maintenance drains workers, then resumes except after staged restore. Erase keeps privacy suspension until explicit re-enable. Shutdown and delete-all dispose workers before store closure.

`main/db/study-migration.ts` exports `studyMigration:string` as migration 22. Migrations 1-21 are unchanged. `main/db/study-validation.ts` exports `validateStudyData(db:DatabaseSync):void`, a read-only validator invoked after staged restore migration.

`shared/review-artifacts.ts` exports strict bounded schemas `studyScopeSchema`, `studySourceSnapshotSchema`, `studyResolvedScopeSchema`, `studyTestItemSchema`, `studyTestSchema`, `studyAnswersSchema`, and types `StudyResolvedScope`, `StudyTest`. W3 must use these persisted payload contracts. Ready artifacts retain source snapshots after document unlink/deletion; retries and new generation must re-resolve live source ownership.

## W2 memory and admission

No schema migration is required. Normal `registerIpc` composition calls
`startMemory(store, providers)`; `openStore` and staged restore remain inert.
The registry suspends dequeue, aborts the active signal and waits for the producer
before storage maintenance or shutdown. Source changes also fence commits through
the job token, assignment revision and shared eligibility predicate.

Remote calls are at least once. An interrupted call may already have been billed.
Local observations and job success (including zero concepts) commit together.
Startup recovers running attempts up to three dispatches and scans at most 100
missing exchanges from the preceding seven days. Queue depth is 100, global FIFO,
with one extraction active. Overflow retains the answer and relies on recovery;
there is no unlimited historical backfill. Manual retries reset the attempt cap.
Budget-denied jobs remain pending with `errorCode:'budget'` until explicit retry.
Other extraction errors are failed and retryable. `review:jobs:page` includes
`errorCode`; `review:jobs:retry` accepts `{jobId}` and returns `{ok:true}` and uses
the existing expensive retry channel rate limit. Unassigned exchanges cannot
contribute mastery; a manual Unsorted assignment remains authoritative.

Exact W3 API (`main/review/admission.ts`):

```ts
type ReviewPurpose = 'extraction' | 'generation';
interface ReviewCall {
  purpose: ReviewPurpose;
  request: ProviderRequest;
  adapter: ProviderAdapter;
  outputTokens?: number;     // default 2048, maximum 32768
  maxOutputBytes?: number;   // default 64 KiB, maximum 256 KiB
}
class ReviewBudgetError extends Error { readonly errorCode = 'budget'; }
class ReviewAdmission {
  constructor(store: AdmissionStore);
  readonly inFlight: {calls:number;inputTokens:number;outputTokens:number;costUsd:number};
  execute(call: ReviewCall, signal: AbortSignal): Promise<string>;
}
getReviewAdmission(store: AdmissionStore): ReviewAdmission;
```

`AdmissionStore` structurally requires `settings.get()` with `priceOverrides`,
optional `monthlyBudgetUsd`/`monthlyTokenBudget`, and `usage.summary('month')` plus
`usage.record(UsageRecord)`. Pass the app's same `Store` to `getReviewAdmission`
for W3. Every generation/critic/retry dispatch must call `execute` anew.
Reservations are synchronous immediately before dispatch and settle once even
for tool output, invalid output, exceptions and aborts. Unknown prices fail closed.
The admission service gates review calls only; foreground chat and AI-parse have
separate gates. It cannot promise a global spending limit across those services.
API adapters receive an explicit output limit; CLI adapters enforce only a local
response byte bound, so remote billing cannot be strictly bounded for those
transports. Usage is recorded as `kind:'chat'`; the immutable ledger has no purpose
metadata column, so purpose remains main-local rather than being persisted.

Other exported W2 APIs:

```ts
// extract-schema.ts
extractionSchema; // strict bounded R-S 2.2 snake_case record
// Exported types: ExtractionResult, ExtractionMessage, ExtractionConcept,
// ExtractionContext, GuardedObservation, GuardedExtraction
guardExtraction(value: unknown, context: ExtractionContext): GuardedExtraction;
// extract-prompt.ts
buildExtractionPrompt(input: ExtractionPromptInput): string;
serializeUntrustedData(value: unknown, maxBytes?: number): string;
EXTRACTION_DATA_MAX_BYTES;   // 48 KiB escaped JSON
EXTRACTION_PROMPT_MAX_BYTES; // 56 KiB final prompt
// thread-snapshot.ts
buildThreadSnapshot(db: DatabaseSync, assistantId: string): {
  messages: ThreadMessage[]; bytes: number; queries: number;
}; // <=24 messages, <=32 KiB fetched JSON, <=49 queries
// memory.ts
startMemory(store: Store, providers: ProviderRegistry): MemoryWorker;
wakeMemory(store: Store): void;
retryMemoryJob(store: Store, id: string): void;
class MemoryWorker implements ReviewWorker {
  constructor(jobs: MemoryRepository,
    extract: (job: MemoryJob, signal: AbortSignal) => Promise<MemoryResult>);
  wake(): void; retry(id: string): void;
  suspend(): void; resume(): void;
  waitForIdle(): Promise<void>; dispose(): Promise<void>;
}
```

W5a uses the validated generic IPC channels above and W1 preferences; no preload,
renderer, or locale changes are included. Extraction sends only the bounded thread,
candidate course IDs/titles, catalog IDs/labels and unit labels to the conversation's
configured provider. It does not inject memory into tutor prompts. Prompts contain
fixed English or Traditional Chinese instructions outside a single escaped data
section; Japanese uses the English instructions with Japanese reply language.
Oversized serialized inputs fail closed rather than truncate a delimiter or quote.
Evidence validation proves provenance and membership, not pedagogical correctness.
A bare affirmation never demonstrates resolution. The R-S concept record accepts
an optional `wrong_attempt:boolean` to retain a wrong attempt alongside `gave_up`;
main requires substantive student quote evidence and never infers it from tutor text.

## Integrated startup and additional memory controls

Normal `registerIpc` startup installs `getReviewAdmission(store)` through
`installReviewAdmission`, registers that gate, starts the memory worker and
registers generation. Extraction and generation share in-flight token and dollar
reservations. Suspension rejects new reservations with `review.suspended`;
unknown or exhausted budgets still fail closed. Each provider path records its
usage once before releasing the reservation. Storage settle drains both worker
families, shutdown disposes them, and delete-all waits for disposal before closing
the store and removing files. Store opening and staged restore do not start or
recover workers. Interrupted extraction recovery runs in `startMemory`;
abandoned generation recovery runs in normal generation IPC registration.

Additional bounded, preload-validated channels:

- `review:jobs:delete({jobId}) -> {ok:true}` clears one exchange's question summary
  and all its observations atomically. Its chat, messages, assignment and other
  exchanges survive. The job remains as a skipped `summary_deleted` tombstone,
  invisible in jobs pages and ineligible for retry or startup re-enqueue. Clearing
  the attempt token fences an extraction already in flight. Mastery and source
  eligibility reflect removal immediately.
- `review:chat:link-get({conversationId}) -> ChatLink|null` reads an existing
  assignment and exclusion flag directly, including assigned chats without any
  summaries. Missing links and soft-deleted conversations return null. This read
  creates no assignment.

`review:courses:mastery` now returns `mastery.nextReviewAt: string|null` for each
concept. `computeMastery` computes this UTC timestamp without persistence using
`REVIEW_INTERVAL_DAYS = [1,3,7,14]` (R-N sections 2.6 and 3.10). Negative eligible
observations and confirmed incorrect attempts reset the interval to one day.
Confirmed correct attempts and demonstrated resolutions at least one day after
the previous anchor advance the interval, capped at fourteen days. Same-session,
unconfirmed, future and reported-bad results do not advance it. Dismissed concepts
and concepts without a negative anchor return null. Self-reported understanding
retains its visibility suppression but does not advance the spacing schedule.
Clients can select non-dismissed concepts whose non-null due timestamp is no later
than now for Review today; paging still applies. Deleting evidence or an artifact
recomputes the schedule immediately. These intervals are product parameters, not
claims about an optimal learning schedule.
