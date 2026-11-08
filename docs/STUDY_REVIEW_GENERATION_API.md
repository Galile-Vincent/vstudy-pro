# W3 generation and attempts API

Paths are relative to `apps/desktop/src`. Shared schemas are authoritative. The renderer uses prompt-only artifacts and per-item feedback. The dev mock provides empty artifact lists and explicit provider/attempt-unavailable errors; it does not simulate grading.

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
| `review:artifact:generate` | `{requestId,courseId,kind:'note'|'test',title,scope,idempotencyKey,providerId,modelId,locale?:'en'|'zh-Hant'|'ja',size?:'short'|'standard'|'long',retakeAttemptId?:UUID}` | Artifact immediately, background work continues |
| `review:artifact:retry` | `{artifactId,requestId,locale?:'en'|'zh-Hant'|'ja'}` | Artifact; only failed/interrupted starts a new attempt |
| `review:artifact:cancel` | `{artifactId}` | `{ok:true}` |
| `review:artifact:list` | `{courseId,limit?,cursor?}` | `{items:ArtifactSummary[],nextCursor}` |
| `review:artifact:get` | `{artifactId}` | Artifact or null |
| `review:artifact:delete` | `{artifactId}` | `{ok:true}`; cascades attempts and mastery effects |
| `review:artifact:export` | `{artifactId}` | `{saved:boolean}`; main opens native Markdown save dialog |
| `review:attempt:start` | `{artifactId}` | Attempt; returns the latest existing attempt on this artifact, including graded/confirmed, or creates one |
| `review:attempt:get` | `{attemptId}` | Attempt with saved answers and committed-item feedback, for reload/resume |
| `review:attempt:answer` | `{attemptId,itemId,answer:string|number|boolean|null}` | Attempt; answering only |
| `review:attempt:commit` | `{attemptId,itemId?}` | Attempt; commits one item and returns its feedback immediately. Omit itemId to finish all remaining items through the same grading path. Idempotent |
| `review:attempt:confirm` | `{attemptId}` | Confirmed Attempt; idempotent |
| `review:attempt:report-bad` | `{attemptId,itemId}` | Attempt; also removes previously applied effect |

Artifact: `{id,courseId,kind,title,scope,resolvedScope,status,bodyMarkdown,test,providerId,modelId,errorCode,createdAt}`. Status is `generating|ready|failed|interrupted`. Summary omits `bodyMarkdown` and `test`. Ready note has bodyMarkdown; ready test has test. Nonready artifacts have neither. `scope` is W1's units/documents/concepts/dates/weak union. Dates are exclusive local date endpoints in an IANA zone, maximum 366 calendar days. Resolved scope includes source document/version/excerpt SHA-256 snapshots, UTC endpoints and assumptions. Undated fallback says “based on when you asked”. `review.needs_source_selection` means ask the student to select documents. Single-concept tests can be `review.infeasible_blueprint` because mandatory interleaving cannot be satisfied.

Stored test: `{version:1,items,warnings?,validationNotice?,excludedStemHashes?}`. Items use W1 MCQ (`options:string[],answer:number`), cloze (`answer:string,alternatives:string[]`), or true_false (`answer:boolean`). Each has `id,conceptKey,stem,explanation,source:{documentId,version,excerptHash,quote}`. Generated items additionally carry `unitId,bloom,difficulty,nextStep`, and MCQs carry `optionRationales` and optional `misconceptions:[{option,id,inferred}]`. Bloom is `remember_understand|apply|analyze_evaluate`. All artifact responses (get, generate, retry, including idempotent ready responses) strip answer, alternatives, explanation, source, nextStep, optionRationales, misconceptions and excludedStemHashes. Renderer items contain only id, conceptKey, stem, type, options (MCQ), unitId, bloom and difficulty. Answer keys, rationales and citations are delivered only as a full item in a committed result's feedback; never for an unanswered item. Display exactly: **checked for structure and sources, not guaranteed correct**. These checks do not establish semantic truth or solve model math.

Attempt: `{id,artifactId,phase,answers,startedAt,committedAt,confirmedAt,results:[{itemId,conceptKey,correct:boolean|null,reportedBad:boolean,feedback?:StoredTestItem}]}`. Each result has correct:null and no feedback until that item is committed. Its answer then becomes immutable while other answers remain editable. Phase stays answering until all items are graded; committedAt is the whole-attempt finish time. Phase then becomes graded, and confirmed only after explicit confirmation. start resumes the latest attempt; get refreshes it by ID, so a reload needs no renderer-local attempt ID. Repeated start also recovers a lost start response. Main computes correctness; IPC accepts no renderer correctness/score. Confirm applies eligible results atomically once per item. Only W1 `computeCourseMastery` computes mastery; no counters are written. Retake: generate a new test with the old confirmed `retakeAttemptId` and a new idempotency key; only missed, unreported concepts are used. Ancestor stem hashes prevent repeats. Retake identity survives retry in the resolved snapshot.

Size uses W3's fixed blueprint counts: short = 8 (small), standard = 12 (medium), long = 20 (large), regardless of unit count. The UI defaults to standard. For older callers omitting size, scope-based sizing stays compatible: <=1 unit = 8, 2-4 units = 12, >=5 units = 20. The selected size is persisted in resolvedScope.size and retained on retry. Counts are requested slots; unsupported items may still be dropped with coverage warnings. At least two concepts and no more concepts than slots remain required; infeasible scopes report review.infeasible_blueprint.

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
- `blueprint.ts`: `BLUEPRINT_COUNTS`, `BlueprintSlot`, `buildBlueprint(conceptKeys,unitCount,size?) -> {status:'ready'|'infeasible',reason,slots}`.
- `note-plan.ts`: `notePlan(unitCount,concepts:{key,mastery}[],weak=false)` returns word/character/prompt budgets, depth, omissions and review offsets.
- `test-validate.ts`: `Excerpt`, `REVIEW_VALIDATION_NOTICE`, `normalizeStem`, `stemHash`, `validateTest(raw,excerpts,excludedStems=[]) -> {version:1,items,warnings}`.
- `prompts/index.ts`: `PROMPT_VERSION`, `notePrompt(data,locale)`, `testPrompt(data,locale)`. `ja` keeps the English instruction text and adds one explicit instruction to write natural Japanese in the です・ます style; `zh-Hant` swaps in Traditional Chinese style rules.
- `artifact-repository.ts`: `ArtifactRepository(db,clock=Date.now)`; `atomic`, `find`, `byKey`, `create`, `retry`, `snapshot`, `finish`, `fail`, `cancel`, `recover`, `delete`, `list`, `scopeInputs`.
- `generate.ts`: `GenerationDependencies`, `GenerationService(repo,deps)`; `generate(request,progress?)`, `retry(id,requestId,locale,progress?)`, `cancel(id)`, `suspend`, `resume`, `waitForIdle`, `dispose`. Registers with W1 `reviewWorkers`; recovery runs in normal IPC registration, outside the constructor.
- `attempts.ts`: `Attempts(repo)`; `get(id)`, `start(artifactId)`, `answer(id,itemId,answer)`, `commit(id,itemId?)`, `confirm(id)`, `reportBad(id,itemId)`, `retake(id)`.
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

## Pedagogy audit integration limits

`validateTest` accepts an optional fourth `TestBalanceContext` argument:
`{acceptedItems, plannedMcqCount, plannedTrueFalseCount}`. With at least four planned
items of a type, it drops only new MCQs exceeding `floor(plannedMcqCount * 0.4)`
answers at one index, or new true/false items exceeding `ceil(plannedTrueFalseCount / 2)`
answers of one truth value. It reports the item ID and reason in `warnings`; accepted
items stay intact so the existing three-round slot retry can regenerate the rejected
slots. Shorter tests cannot enforce those proportions meaningfully. Unique longest
MCQ keys, option counts other than four and all/none shortcuts are always rejected.

Production generation passes complete blueprint counts and all previously accepted
items across batches and retries to the test-only validator call, includes remaining
answer-position/truth-value capacity in each prompt, and collects gate warnings. Leave context absent for
note citation validation, whose synthetic true/false rows are not quiz items.

`Excerpt.kind` may carry the source kind. Known `assignment` and `exam` kinds are
refused by the validator; the prompt additionally forbids deriving answer keys from
assignment/exam problem excerpts. The production excerpt reader derives known assignment/exam kinds from linked
Moodle module metadata (including assign/quiz module names). Locally imported
documents have no kind metadata. Text alone cannot reliably distinguish an assignment from a worked example.

Recorded quoted misconceptions can be used without a positive `help_level_used`.
The extraction schema lacks a per-concept explicit corrected-assertion flag, so an
ordinary asked/confused question cannot safely be treated as a recorded misconception.
Such distractors still use source-stated confusions or explicitly inferred examples,
not invented student history. This requires a schema change to broaden safely.

## Exams

Exams reuse `test` artifacts and attempts, with the optional `exam` configuration
on generation requests and resolved snapshots: `{prompt, counts, difficulty}`.
`counts` contains `mcq`, `multi_select`, `calculation`, `cloze`, `true_false`
(nonnegative integers, total 1–40). Difficulty is easy/medium/hard; `locale`
selects English, Traditional Chinese, or Japanese. Exams use the archived internal
course `00000000-0000-4000-8000-000000000026`, created lazily, and a documents
scope of up to eight ready library documents, independent of course links. Source
titles survive deletion in the resolved snapshot. Migration 26 adds a history
lookup index only. Existing review generation and mastery behavior are preserved;
exam confirmation cannot apply results to mastery.

Multi-select answers are exact unordered sets of zero-based option indices.
Calculation keys have a finite numeric `answer`, nonnegative absolute `tolerance`,
and `unit`; student answers are numeric strings with an optional exact unit suffix.
No expression evaluation or unit conversion occurs. Cloze keeps its existing
normalized exact match against the key and accepted alternatives. Every exam
question requires a substantive generated explanation. Generation retries invalid
slots twice, then fails an incomplete exam rather than reducing requested counts.
Source excerpts retain the existing first-6,000-byte/document and 48-KiB limits.

`review:exam:history({limit?:1..20,cursor?})` returns a keyset page of artifact
summaries and latest attempt summaries (phase, timestamps, correctness, item type).
It never returns answer keys, explanations, or student answer payloads. Reopening
uses `review:artifact:get` and `review:attempt:start/get`; prompts stay public and
feedback appears only for committed answers. Answers are committed individually,
locked, and reviewed immediately. Duration is wall time from attempt start to last
commit, including pauses; there is one resumable attempt per artifact.

`review:attempt:explain({attemptId,itemId,locale}) -> {text}` requires a committed
item. It requests a fresh explanation from the artifact's provider/model with
question, committed answer and key serialized as untrusted data. It shares the
review admission gate, usage accounting, concurrency cap and shutdown fencing.
It never grades or changes persisted correctness. Follow-up text is displayed on
request and is not persisted. The normal dev mock supports empty exam history and
explicit provider/attempt-unavailable errors rather than fabricated exam results.
