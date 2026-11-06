# Study review evidence parameters

Weights, decay half-lives, session boundaries and visibility thresholds are design parameters, not research findings. Their exported definitions live in `mastery.ts` and `episodes.ts`. They need evaluation against confirmed quiz outcomes before tuning.

A study episode ends after a six-hour gap, regardless of midnight. Its study-day label uses a 04:00 boundary in the student's time zone. Slips and wrong attempts corrected within that episode contribute less negative weight than unresolved misconceptions. A first guess at the tutor's own prediction question is excluded when persisted probe metadata is available; repeated answers after help or explicit statements of belief can still contribute evidence. Older chats without move metadata rely on the extraction prompt's same rule.

Confirmed, unreported quiz answers contribute to review visibility. Failures on two study days can add a concept, and two correct answers after the latest negative evidence, separated by at least three days, can clear it. Decay removes old evidence from review visibility. A later failure overrides an earlier understanding click or resolved chat observation.

The active-negative threshold is 0.6 to preserve the existing visibility of a recent, explicit misconception (weight 0.8) or wrong attempt followed by giving up (0.7), while two recent confusion observations (0.4 each) may warrant review. Unconfirmed, reported-bad and future quiz evidence does not affect the result.

Recorded misconception distractors do not require Socratic help-level metadata: a quoted assertion labelled as a misconception and followed by a tutor correction can qualify in direct mode too. The extraction schema cannot reliably distinguish a misconception embedded in a plain question or asked/confused observation from ordinary uncertainty. Those observations remain excluded from misconception distractors until the schema supplies per-concept evidence of a corrected assertion. Do not invent such evidence from the student's question alone.

Extraction instructions require a character-for-character student quote and one observation for a wrong-then-fixed exchange, using the final correct restatement. The guard verifies provenance and chronology; it cannot independently verify mathematical or conceptual correctness.
