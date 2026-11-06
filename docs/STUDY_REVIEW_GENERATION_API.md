# W3 generation and attempts API

Paths are relative to `apps/desktop/src`. Shared schemas are authoritative. No renderer UI or locale changes accompany this work; only the progress subscription bridge and dev mock change.

## W2 integration

`main/review/admission-port.ts` exports:

```ts
interface ReviewEstimate {inputTokens:number; outputTokens:number; costUsd:number|undefined}
interface Admission {
  reserve(estimate:ReviewEstimate):string;
  settle(handle:string,actual:ReviewEstimate):void;
}
installReviewAdmission(admission:Admission):void;
reviewAdmission:Admission;
FakeAdmission; // tests only; constructor(), reserve(), settle(), pending, settled
```

Normal app startup installs W2's single shared admission instance before generation dispatch. Unknown prices fail closed. Until installed, generation persists `failed` with `review.admission_unavailable`; no unmetered fallback exists. W2 should reuse `serializeUntrusted(value,maxBytes=98304)` from `main/review/untrusted.ts`, or reconcile its serializer with this escaped, final-byte-bounded interface. Never install the test fake in production. The gate must settle once, including cancellation, and use conservative estimates when no usage is reported.

Production usage is recorded as kind `chat`. The existing usage row schema has no purpose metadata; W3 does not migrate it. Review reservations cover review calls only, not foreground chat or parse jobs. CLI transports lack an adapter output-token bound; they reserve a conservative 240000 output tokens and have a 240000-byte output gate. Supported API transports receive an 8192-token output bound. Quotes and excerpts still go to the selected provider.

## W5b IPC

Every request is a strict object. UUID means standard UUID string. Invoke through `window.desktop.invoke(channel, request)`; schemas validate in preload and main. Errors use `VSTUDY_STATUS` with stable `review.*` codes. Lists have a default 50, maximum 100, keyset cursor `{at,id}` and a 450000-byte page budget. Main caps serialized review responses at 512 KiB.

| Channel | Request | Response |
|---|---|---|
| `review:artifact:generate` | `{requestId,courseId,kind:'note'|'test',title,scope,idempotencyKey,providerId,modelId,locale?:'en'|'zh-Hant',retakeAttemptId?:UUID}` | Artifact immediately, background work continues |
| `review:artifact:retry` | `{artifactId,requestId,locale?:'en'|'zh-Hant'}` | Artifact; only failed/interrupted starts a new attempt |
| `review:artifact:cancel` | `{artifactId}` | `{ok:true}` |
| `review:artifact:list` | `{courseId,limit?,cursor?}` | `{items:ArtifactSummary[],nextCursor}` |
| `review:artifact:get` | `{artifactId}` | Artifact or null |
| `review:artifact:delete` | `{artifactId}` | `{ok:true}`; cascades attempts and mastery effects |
| `review:artifact:export` | `{artifactId}` | `{saved:boolean}`; main opens native Markdown save dialog |
| `review:attempt:start` | `{artifactId}` | Attempt |
| `review:attempt:answer` | `{attemptId,itemId,answer:string|number|boolean|null}` | Attempt; answering only |
| `review:attempt:commit` | `{attemptId}` | Graded Attempt; idempotent, locks answers |
| `review:attempt:confirm` | `{attemptId}` | Confirmed Attempt; idempotent |
| `review:attempt:report-bad` | `{attemptId,itemId}` | Attempt; also removes previously applied effect |

Artifact: `{id,courseId,kind,title,scope,resolvedScope,status,bodyMarkdown,test,providerId,modelId,errorCode,createdAt}`. Status is `generating|ready|failed|interrupted`. Summary omits `bodyMarkdown` and `test`. Ready note has bodyMarkdown; ready test has test. Nonready artifacts have neither. `scope` is W1's units/documents/concepts/dates/weak union. Dates are exclusive local date endpoints in an IANA zone, maximum 366 calendar days. Resolved scope includes source document/version/excerpt SHA-256 snapshots, UTC endpoints and assumptions. Undated fallback says “based on when you asked”. `review.needs_source_selection` means ask the student to select documents. Single-concept tests can be `review.infeasible_blueprint` because mandatory interleaving cannot be satisfied.

Test: `{version:1,items,warnings?,validationNotice?,excludedStemHashes?}`. Items use W1 MCQ (`options:string[],answer:number`), cloze (`answer:string,alternatives:string[]`), or true_false (`answer:boolean`). Each has `id,conceptKey,stem,explanation,source:{documentId,version,excerptHash,quote}`. Generated items additionally carry `unitId,bloom,difficulty,nextStep`, and MCQs carry `optionRationales` and optional `misconceptions:[{option,id,inferred}]`. Bloom is `remember_understand|apply|analyze_evaluate`. Do not show answers, source quotes, rationales or explanation until commit. Display exactly: **checked for structure and sources, not guaranteed correct**. These checks do not establish semantic truth or solve model math.

Attempt: `{id,artifactId,phase,answers,startedAt,committedAt,confirmedAt,results:[{itemId,conceptKey,correct:boolean|null,reportedBad:boolean}]}`. Answers are immutable after commit. Main computes correctness; IPC accepts no renderer correctness/score. Confirm applies eligible results atomically once per item. Only W1 `computeCourseMastery` computes mastery; no counters are written. Retake: generate a new test with the old confirmed `retakeAttemptId` and a new idempotency key; only missed, unreported concepts are used. Ancestor stem hashes prevent repeats. Retake identity survives retry in the resolved snapshot.

## Progress subscription

```ts
window.desktop.onReviewProgress(listener:(event:ReviewProgress)=>void):()=>void
// event channel: review:progress
interface ReviewProgress {
 requestId:string; // UUID supplied by caller
 artifactId:string; // UUID persisted by main
 stage:'queued'|'resolving'|'generating'|'validating'|'ready'|'failed'|'interrupted';
 completed:number; // integer 0..100
 total:number; // integer 0..100
 errorCode:string|null; // <=120 characters
}
```

Subscribe before invoking generate/retry, filter by requestId then artifactId, and call the returned unsubscribe on teardown. Main sends only to the originating trusted frame/window, coalesces intermediate progress to 100 ms, and flushes terminals immediately. Events are hints: always `get` after acknowledgment/reconnect, including completion before subscription. Dev mock subscription is an inert unsubscribe stub.

## Exported main APIs

- `scope.ts`: `ScopeInputs`, `dateRange(fromDate,toDate,timeZone) -> {from,to}`, `resolveScope(scope,inputs) -> {status:'resolved'|'needs_source_selection',snapshot}`.
- `blueprint.ts`: `BLUEPRINT_COUNTS`, `BlueprintSlot`, `buildBlueprint(conceptKeys,unitCount) -> {status:'ready'|'infeasible',reason,slots}`.
- `note-plan.ts`: `notePlan(unitCount,concepts:{key,mastery}[],weak=false)` returns word/character/prompt budgets, depth, omissions and review offsets.
- `test-validate.ts`: `Excerpt`, `REVIEW_VALIDATION_NOTICE`, `normalizeStem`, `stemHash`, `validateTest(raw,excerpts,excludedStems=[]) -> {version:1,items,warnings}`.
- `prompts/index.ts`: `PROMPT_VERSION`, `notePrompt(data,locale)`, `testPrompt(data,locale)`.
- `artifact-repository.ts`: `ArtifactRepository(db,clock=Date.now)`; `atomic`, `find`, `byKey`, `create`, `retry`, `snapshot`, `finish`, `fail`, `cancel`, `recover`, `delete`, `list`, `scopeInputs`.
- `generate.ts`: `GenerationDependencies`, `GenerationService(repo,deps)`; `generate(request,progress?)`, `retry(id,requestId,locale,progress?)`, `cancel(id)`, `suspend`, `resume`, `waitForIdle`, `dispose`. Registers with W1 `reviewWorkers`; recovery runs in normal IPC registration, outside the constructor.
- `attempts.ts`: `Attempts(repo)`; `get(id)`, `start(artifactId)`, `answer(id,itemId,answer)`, `commit(id)`, `confirm(id)`, `reportBad(id,itemId)`, `retake(id)`.
- `main/ipc/review-generate.ts`: `progressFor(event)`, `registerReviewGenerateIpc(registrar,store,implemented,providers,admission=reviewAdmission) -> GenerationService`.

Shared exports: `reviewProgressChannel`, `reviewProgressSchema`, `ReviewProgress`, `artifactSchema`, `generationRequestSchema`, `GenerationRequest`, `attemptSchema`, `reviewGenerateIpc`. Persisted test schemas remain in `shared/review-artifacts.ts` and are reused by restore validation.

## W2 admission and lifecycle integration

Normal IPC startup installs the real `getReviewAdmission(store)` service into
W3's `Admission` port before registering generation. Generation `reserve/settle`
and extraction `execute` share one in-flight budget. Unknown prices, exhausted
budgets and suspended services fail closed before provider dispatch. Provider
usage is recorded once by the corresponding call path; settling releases the
reservation even on invalid output, provider failure or cancellation.

Both memory and generation register with W1's real worker registry. Storage
maintenance suspends and drains them before snapshot/settle work; shutdown and
delete-all dispose and await them before closing the database or removing files.
Restore holds keep them suspended until restart. Constructing a generation
service or opening a store does not recover abandoned artifacts; normal generation
IPC startup performs recovery. Memory interrupted-job recovery is likewise limited
to normal `startMemory` startup.

The foundation API additionally exposes `review:jobs:delete({jobId})` for atomic
summary/evidence removal and `review:chat:link-get({conversationId})` for direct
assignment/exclusion lookup. Concept mastery responses include nullable UTC
`mastery.nextReviewAt`, computed with expanding 1/3/7/14-day intervals from eligible
negative evidence and confirmed results. See `STUDY_REVIEW_API.md` for the reset,
same-session and deletion rules. These fields use the shared IPC schemas and
require no separate preload allowlist or database migration.
