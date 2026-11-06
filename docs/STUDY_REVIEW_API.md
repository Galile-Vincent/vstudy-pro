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
//   risk:number; negative:number; positive:number; episodeCount:number}
// NEGATIVE_HALF_LIFE_DAYS=21, POSITIVE_HALF_LIFE_DAYS=30,
// SELF_REPORT_WEIGHT=.1, UNDERSTOOD_HIDE_DAYS=14

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
