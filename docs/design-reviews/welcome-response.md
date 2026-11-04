# Response to the independent Welcome review

Implementation against `welcome-independent.md`, 2026-11-04. The independent review is retained in commit cdde186. This report distinguishes implemented changes from measured results; native-language approval and VoiceOver remain unverified.

| Item | Response and evidence |
|---|---|
| P0-1 | Implemented in all three welcome catalogs: category eyebrow names AI and Mac; the first paragraph says an AI model answers. No guaranteed citation claim. |
| P0-2 | Grid composition with fixed 12 px overlaps into 32 px reserved bottom padding; natural text heights, no clamps. Short localized excerpt and answer; Example belongs to the document card. Solid surfaces, no hero backdrop filters. Hero has no minimum height. |
| P0-3 | Toolbar uses flex, automatic height, opaque surface, relative stacking, and no shrinking. It can wrap naturally at narrow widths. Example moved to footer. Reader clip has top padding; citation target aligns to its top. |
| P0-4 | Explicit phrase boundaries (U+200B in catalog, split into nowrap reveal spans), strict CJK line breaking, auto-phrase fallback, balanced heading and 1.3 line height. Japanese wording no longer contains the split 確かに. |
| P1-1 | Starts-with label explicitly uses type-xs (12 px English, 13 px CJK); separate 13 px, weight-500 paragraph. Hero no longer has small chips. |
| P1-2 | Sparkline reveals with clip-path; no dashed resting stroke. Added localized example monthly tokens, estimated cost and budget labels. |
| P1-3 | Tab from focused h1 reaches Pause immediately; stable label and aria-pressed. Looping motion and demo pause through animation-play-state. Finite reading reveals finish once when paused (including on a paused reopen), so text cannot freeze invisible; resuming never removes/recreates CSS animations. Dots use roving tabindex and arrow navigation. Details e2e checks focus and that entrance animation clocks do not restart. |
| P1-4 | Welcome navigation bypasses View Transitions in both directions, retaining document morphs elsewhere. React non-urgent navigation and idle module/CSS preload move work outside the click. Bundled locale sample sources replace async demo IPC population, preventing a second Markdown mount and hero-title reflow. No hero backdrop blur; float capped at three cycles. Performance gate measures 12 entrances, Home-relative p95, dropped frames, >20 ms scroll/demo intervals, CLS, and idle animation/CPU. See welcome2-performance.json and measurement addendum. |
| P1-5 | Removed duplicate title from Welcome header; controls align right, using a 40 px height token. Shell title remains. |
| P1-6 | Conditional source/citation language; prompt instruction described as instruction. Hero includes outbound text/question qualification. Removed parser chips from hero. CLI cards precede API cards. Installed `claude auth --help` confirms login; `codex login --help` confirms login (no authentication performed). |
| P1-7 | Demo is now the second section, immediately after hero; navigation order follows it. |
| P2-1 | Shortened all persona jobs; English jobs are each at most 18 words. Kept situations and explicit first-use instructions: these carry different information and support actionable onboarding. |
| P2-2 | Fact descriptions are unit phrases; count appears once. Restored visible middle-dot separators between native language names. |
| P2-3 | ResizeObserver checks the first provider strip against its viewport; static centered row when it fits, animated only on overflow. Uses type-md and weight 500. |
| P2-4 | Added line-token border to command boxes. Decorative card hairlines intentionally stay subtle: these containers have no action or state and their boundary conveys no necessary information. The 3:1 requirement remains for actionable controls, focus and meaningful state. Updated design reference to record this exception. |
| P2-5 | Starts at enter. Leaving reduced motion resets the previously finished player. The chip quotes the actual selected sample paragraph, replacing the instruction label. Shortened the scripted answer and removed hidden hint/thinking rows from flow so the citation fits at 720 px. Reset fades both panes together and preserves reader position until invisible. An early selection hint fills the initially empty chat. Replay hidden under reduced motion. |
| P2-6 | Earlier body/CTA timings (240/320 ms). Removed competing route entrance. Typing, highlight, chip, float-start and answer-stagger values moved to tokens. Retained restrained layer stagger rather than adding another motion treatment. |
| P2-7 | Section spacing reduced from 96 to 64 px; hero stays 32 px. Removed content-visibility and guessed intrinsic heights, eliminating that source of scroll-height drift. |
| P2-8 | Roving dots implemented. Added an optional decorative mode to the production Markdown renderer: demo headings become styled divs, with section-action controls omitted. Normal reader semantics stay the default. A manual VoiceOver run is still required. |
| P2-9 | Revised Japanese heading and Library title; removed counter spaces for consistency. zh-Hant uses 請先了解 and 掌握用量. Native review is still required; this is no claim of native approval. |

## Design critique loop

First rebuilt captures retained in `/tmp/vstudy-welcome2/round-1/` (hero, demo, who, English 1200 light). Viewed all three. Contrast and hierarchy now clearly name the category, primary action and example. Alignment/proximity: toolbar is readable, but the citation jump retained a partial preceding line; revised its measured offset. Repetition/unity: kept actual reader, Home components and tokens. Balance/white space: natural-height cards expose every sentence; demo now follows hero, with much less empty space. Persona footers are legible and separated from the job inset.

Second iteration aligns the demo jump at the clipped viewport edge, adds an early chat hint, restores enter when leaving reduced motion, and replaces added timing/height literals with tokens. Final matrix and observations are indexed by `docs/evidence/welcome2-screenshots.json`. See the measurement addendum in `welcome.md` for verification outcomes and limitations.
