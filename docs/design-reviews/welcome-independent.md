# Welcome: independent design review

Reviewer: independent senior product/motion designer pass, 2026-11-04, against commit `84ef580`. Inspect-only: no source file was changed. Everything here comes from (a) the 1,118 retained screenshots/frames in `/tmp/vstudy-welcome/` and (b) my own runs against a fresh `pnpm build` of the app, driven with Playwright `_electron` on a temp `--user-data-dir` (en and ja, Apple silicon, macOS 27.0.1, 60 Hz display, 1200×800 default window). My probe scripts live outside the repo (scratchpad); numbers below are copied from their output.

Limits, stated up front: I am not a native zh-Hant or ja reviewer; CJK remarks are flagged by confidence. Native `BrowserWindow.hide()/minimize()` still does not flip `document.hidden` under Playwright (I reproduced the builder's observation), so hidden-window behavior is **unverified** by me too. I did not run VoiceOver. I did not edit code to prove fixes, except for throwaway CSS injected at runtime to isolate causes (noted where used).

## Verdict

The page is structurally sound and honest in tone, and the engineering around it (reveal-once, pause, off-screen idle, reduced motion/transparency) holds up when I test it. It is **not yet a confident first impression.** Three things a new user meets in the first 10 seconds are wrong: the hero never says what kind of product this is, the hero illustration truncates its own text, and the demo's reader header collides with the text it scrolls. Fix those before anything else. The p95 "failure" is mostly a mis-specified gate; the real performance defect is a one-frame hitch from the View Transition (section "Performance").

## Punch list

### P0

**P0-1. The first screen never says what VStudy Pro *is* (no "AI", no "assistant", no "chat").**
Evidence: `en-1200-light-hero.png`; `grep -ci 'AI\b|assistant|chatbot' locales/en/welcome.json` returns 0. The word "model" first appears at section 5.
Principle: PRODUCT_DESIGN_V2 §10 *Contrast* (one clear job per view) and the spec's own 30-second test ("what the app is for"). The h1 ("Understand what you read, one passage at a time.") is a benefit line with no category noun; the body says it "answers questions", but a reader cannot tell whether a person, a search index or an AI does. Reference sites (t3.codes, antigravity.google) name the category in the first line.
My 30-second timing (reading aloud at ~240 wpm): eyebrow + h1 3 s, body (40 words) 10 s, seven headings (≈35 words) 8 s, total about 21 s. So the page passes the *time* test and fails the *comprehension* test. Headings alone tell a coherent story, but "Select, ask, follow the citation" (§3) and "Read, ask, and check the source" (§2) are near-duplicates back to back.
Fix (copy, all three locales, native review needed for CJK):
- Eyebrow (en): `An AI reading companion for your Mac` (replace "For people who read to understand"; the audience is already §4's job). zh-Hant `Mac 上的 AI 閱讀夥伴`; ja `Mac で使う、AI 読書パートナー` (draft, not native-checked).
- Hero body, first clause: `Open a PDF, slide deck, spreadsheet or Word file, select a passage, and ask an AI model about it. Every answer points back to the source text.` Keep the privacy clause (see P1-7).
- Rename the §3 heading to something that is not §2 again: `See it in 10 seconds`.
Acceptance: a reader who sees only the first screen can finish "VStudy Pro is a Mac app that lets me ___ with ___" correctly.

**P0-2. The hero illustration overlaps and truncates its own content; the lower half of the hero is dead.**
Confirmed. Evidence: `en-1200-light-hero.png`, `en-1200-dark-hero.png`, `en-900-dark-hero.png`, `ja-1200-light-hero.png`, `zh-Hant-1200-light-hero.png`, frames `en-1200-light-hero-frame-06..11.png`.
What I see: the middle card's highlighted text ends in a clipped line (`…For example, instead o`) because the front card sits on top of it; the back card's chip row (`PDF → Markdown · pdf_md`) is half hidden behind the middle card; the front card's text ends in ellipses (`Answer it from memory…`). In ja/zh the middle card cuts off mid-sentence (`…例えば「間隔を空け`, `與其背下「間隔練習」…`) and the CJK copy is cut at a different place, so the visual says nothing readable. The "Example" badge floats alone at the far right, unattached to a card.
Cause (`welcome.css`): `.hero-stack` is `aspect-ratio:5/4; max-width:420px` (336 px tall), and the three cards are pinned at `top:0`, `top:26%` and `bottom:0` with natural heights, so overlap is whatever falls out. Overlap area is not reserved; a 3-line `-webkit-line-clamp` hides the remainder.
Principle: *Balance* and *White space*; also the spec's own rule that decoration must still communicate (`hero_visual_alt` promises "a highlighted passage … and an answer with a citation chip").
Fix: stop using absolute `top/bottom` percentages for text-bearing cards. Use a grid stack whose overlap is only the cards' padding, so no text line is ever covered:
- `.hero-stack { display:grid; gap:0; aspect-ratio:auto; max-width:440px; }`
- cards `width:82%`; back `justify-self:start`, middle `justify-self:center; margin-top:calc(-1 * var(--space-4))` (16 px overlap = padding only), front `justify-self:end; margin-top:calc(-1 * var(--space-4))`; `z-index` 0/1/2.
- No line clamp on the middle card: let it show the whole selected sentence (two lines at 13/22 px). Shorten the sentence instead of clamping.
- Drop the back card's chip row or move it into the title line (`Small questions, deeper reading` + one chip `.md`, `--type-xs`); `pdf_md` is internal jargon and means nothing to a new user (see P1-6).
- Move the "Example" badge inside the stack's first card header, aligned with the title baseline.
Result: about 20% shorter stack, nothing clipped in en/zh-Hant/ja.
Dead space: eyebrow top is 95 px below the sticky header (`y=191` in `en-1200-light-hero.png`), CTAs end at `y≈490`, the next h2 starts at `y≈712`: **~210 px of nothing under the CTAs** versus 95 px above. Cause: `.w-hero{min-height:440px; align-items:center}` plus section padding 96 px on the next section. Fix: `.w-hero{min-height:0; padding-block:var(--space-8) var(--space-6)}` and `#welcome-values{padding-top:calc(var(--space-8)*1.5)}` (48 px). Target: "Read, ask" heading and the tops of the value cards visible at 800 px window height, so scroll is invited by content rather than by a gap.

**P0-3. Demo reader header collides with scrolled text.**
Confirmed. Evidence: `en-1200-light-demo.png` (the border line strikes through `Markdown · markitdown` and a clipped line `you remember.` pokes out above the rule), `zh-Hant-900-dark-demo.png` (same, plus the "範例" badge crowds `sample.md`), frames `en-1200-light-demo-frame-09..11.png`.
Cause (`welcome.css`): `.w-demo-reader .pane-toolbar{display:grid;gap:var(--space-1);padding:var(--space-3)}` makes a two-line header inside the app's `.pane-toolbar`, whose fixed 28 px height cannot hold it, so the toolbar's bottom border crosses the second line, and the scrolling `.demo-reader-content` shows through underneath.
Principle: *Alignment* and *Unity* (the real reader never does this).
Fix: `.w-demo-reader .pane-toolbar{display:flex; align-items:center; justify-content:space-between; height:auto; min-height:var(--topbar-height); padding-inline:var(--space-3); background:var(--surface); position:relative; z-index:1; flex-shrink:0}` with filename left and `Markdown · markitdown` right on a single line (`--type-xs`, `--muted`). Put the "Example" badge on the stage's outer top-right corner (`top:calc(-1 * var(--space-5))`) or in the footer row beside Replay, not over the pane. Add `padding-top:var(--space-1)` to `.w-reader-clip` so scrolled text never touches the rule.

**P0-4. Japanese and Chinese hero headings break mid-word; the heading looks airy and unbalanced.**
Evidence: `ja-1200-light-hero.png` (`一節ずつ、確か` / `に理解する。`), `zh-Hant-1200-light-hero.png` (`一段一段，讀懂` / `你手上的資料。`). The ja break splits the adverb 確かに. Heading line-height is 48/40 px = 1.2, which at CJK glyph density reads loose.
Cause: SplitReveal groups are `inline-block` units and the container has no CJK line-break policy; `text-wrap:balance` does not know to keep the adverb whole.
Fix: `.welcome h1:lang(ja), .welcome h1:lang(zh-Hant){ line-break:strict; word-break:auto-phrase; text-wrap:balance; line-height:1.3 }`. `word-break:auto-phrase` is supported in the Chromium that ships with Electron 40. Also make SplitReveal join the groups with `white-space:nowrap` per Intl.Segmenter *phrase* when `lang` is ja (Segmenter words already give 確か|に; merge a trailing particle/okurigana into its predecessor before grouping).

### P1

**P1-1. Persona "Starts with" lines are 10.4 px, below the type scale, and worse in CJK.**
Confirmed by measurement: `.w-personas small` computes to **10.4px** in en and also in ja (the CJK bump of `--type-sm` to 13 px does not reach `<small>` because the UA default is 0.8em of 13 px). Type scale floor is 11 (§5; `tokens.css` `--type-xs:12px`). It is also where the actionable "first feature" lives (`p*_first`). Evidence: `en-1200-light-who.png`, `ja-1200-dark-who.png` (the caption is visibly the smallest text on the page). Contrast is fine (6.6:1 light, 7.0:1 dark), so this is size only.
Fix: replace `<small>` with `<p class="w-first">`: label `--type-xs` (12; 13 in CJK via the existing override), weight 600, `--muted`, own line; body `--type-base` (13), `--ink`, weight 500 (matches spec §5.4 "weight 500"). Stack label above text rather than inline, so the line reads "Starts with" then a normal paragraph. Same fix for `.hero-stack small` (10.4 px chips, `en-1200-light-hero.png`).

**P1-2. Sparkline in the data section renders broken (dashed, with a gap).**
Evidence: `en-1200-light-data.png`; my probe on the built app: the polyline has `pathLength=1`, `vector-effect:non-scaling-stroke`, computed `stroke-dasharray:1px`. With `non-scaling-stroke` the dash is measured in screen pixels, so `pathLength` is ignored: the line is permanently drawn as a 1 px dash / 1 px gap pattern (and the "draw" animation `dashoffset 1→0` cannot work). Spec §5.6 asked for the draw effect; this ships a defect.
Fix: drop `vector-effect` for this instance (the SVG is a fixed 100×30 box) or animate with a `clip-path: inset(0 100% 0 0) → inset(0)` reveal at `--motion-story`/`--ease-in-out-soft`; leave `stroke-dasharray:none` at rest.
Also: the example frame shows a number-less sparkline and an unlabelled bar (`en-1200-light-data.png`). Without "Tokens this month 1.2 M · ≈ $3.40 est." and "Budget 42 %" they do not illustrate "Keep track". Use the real Home card contents with fixture numbers, not bare drawings. This also fixes imbalance: the right column currently has less information weight than the three lists beside it.

**P1-3. Pause control is far from where focus starts; "Play" restarts the hero entrance.**
Measured. Opening Welcome focuses the h1 (good). Forward Tab: Bring a document → See how it works → Replay → Copy ×3 → Set up a model → closing CTAs → Go to Home → **Skip to content → 8 sidebar stops → Pause animations is tab stop #21, Close #22**, then 7 section dots (#23-29). Backwards, Pause is 9 Shift+Tab stops (7 dots + Close + Pause). WCAG 2.2.2 is technically satisfied (reachable) but not usefully.
Also: after Pause then Play, my runtime check showed `w-word-in`, `w-in`, `w-card-in` running again: the CSS rule `.welcome[data-motion=paused] .w-word … {animation:none!important}` is removed on Play, so the whole hero entrance **replays** (text disappears and re-reveals). The `aria-pressed` attribute is also set while the label text flips between "Pause animations" and "Play animations", which announces as a double state.
Fix: (a) section dots become one tab stop with roving tabindex (arrow keys move) → saves 6 stops; (b) put Pause/Close first in tab order by moving initial focus handling to the header's sibling (keep h1 focus, but render the header controls after the h1 in DOM and position them sticky with CSS, so Tab from the h1 reaches Pause in 1-2 stops); (c) pause with `animation-play-state:paused` only, never `animation:none`; (d) fixed label "Pause animations" with `aria-pressed` toggling, or no `aria-pressed` and a swapped label, not both.

**P1-4. Performance gate: the p95 metric is not a Welcome metric; the real defect is a View Transition hitch.**
Measurements (rAF intervals, same probe as `e2e/welcome-performance.mjs`, plus my variants):

| Condition | p50 | p95 | frames > 20 ms |
|---|---:|---:|---:|
| Home idle, nothing animating (4 s) | 16.7 | 17.9 | 0 |
| Hero idle with float + 3 backdrop layers (5 s) | 16.7 | 18.1 | 0 |
| Hero idle, backdrop removed / float removed | 16.7 | 17.9-18.1 | 0 |
| Full-page scroll, rAF-paced, 119 frames | 16.7 | 18.3 | 0 |
| Full-page scroll with header blur, card blur and shadows all off | 16.7 | 18.3 | 0 |
| Demo, 3 loops, 45 s (2,699 frames) | 16.7 | 18.1 | **0** (max 18.8) |

The median is exactly one vsync (16.7 ms). A p95 of 17.9-18.3 shows up with **nothing running at all** (Home idle). The distribution is vsync-delivery jitter, so "p95 ≤ 16.7 ms" cannot be met by any content on this host and says nothing about Welcome. The builder suspected this; I confirm it and add the cause. Replace the gate with: **zero frames > 25 ms** during hero, scroll and one demo loop, and `p95 ≤ Home-idle p95 + 1 ms`, both measured in the same run. Under that gate the scroll and the demo pass.
The real defect: entering Welcome produces **one dropped frame (31-35 ms)** in ~85% of runs (21 of 24 with VT on). It disappears under reduced motion (0/8) and when `document.startViewTransition` is removed (0/8), even with every Welcome entrance animation still running. Throwaway CSS experiments that did **not** remove it (7-8 of 8 runs each): header `backdrop-filter:none`, hero-card `backdrop-filter:none`, `content-visibility:visible`, removing the sidebar/topbar `view-transition-name`s, shortening the root fades. So the cost is the transition's snapshot/`flushSync` mount, not blur, not `will-change`, not the chunk (warm chunk still hit it).
Fixes, cheapest first: (1) do **not** wrap route changes into Welcome in `startViewTransition`; the hero has its own ~1.1 s choreography and the VT cross-fade stacks a second entrance on top (see `en-1200-light-transition-frame-02..04.png`: ghost of Home under the rising headline). Keep VT for the document-card → reader morph where it earns its cost. (2) If VT is kept for Welcome, call `apply` through `React.startTransition` instead of `flushSync` and give `::view-transition-old(root)` `animation:none` so only the new layer animates (I did not verify this variant; treat as a hypothesis).
Idle GPU (Electron `getAppMetrics`): hero with float + 3 blurred layers **GPU 1.3 %** versus 0.1 % with no animation, 0.4 % with blur removed. Tiny, but it is a continuous cost for the longest-lived view state. Fix: remove `backdrop-filter` from the three hero cards (they sit on a flat page, so nothing visibly changes; spec §3 itself says blur over a flat background "shows nothing") and cap the float at 3 cycles (18 s), mirroring the demo's 3-loop policy. Keep the header's blur; it measured no effect on scroll frames.
Everything else checked out: off-screen, Welcome has **0 running animations** and renderer/GPU CPU is 0.1-0.2 % over 10 s; the demo paused (`data-playing=false`) off-screen; the Pause toggle leaves only the two scroll-linked animations (`w-hairline`, `w-progress`), which are not time-driven.

**P1-5. Doubled chrome: the page title appears twice before the h1.**
Evidence: every full-viewport screenshot. The shell top bar says "What is VStudy Pro?" and the sticky Welcome header repeats it in bold directly below, then the h1 starts 95 px lower. That is 96 px of chrome and a title echoed twice on the one screen that has to be calm.
Fix: make `.w-header` controls-only (no `<strong>` title; right-aligned Pause and Close), height 40 px, hairline as now; the shell top bar remains the title. Gains ~12 px and removes the repetition; the topbar `view-transition-name` is unaffected.

**P1-6. Copy honesty and jargon.**
Claims I verified against the code: 8 file types, 6 provider kinds, 3 languages (`facts.test.ts`), no telemetry (grep), CJK substring search (trigram plus LIKE fallback in `search.ts`), prompt sends selection text, CLIs get no tools, scripted demo labelled as scripted. Things to change:
- `value_3_title` "Every answer shows its source" is absolute. The citation catalog constrains *what can be cited*, not *that a citation appears*. Say "Answers point back to the source" and in the body "when the model cites a section, click it and the reader jumps there." (zh-Hant/ja to match.)
- `value_2_body` "it says so when the document doesn't support an answer": the prompt (`prompt/index.ts:59`) only *instructs* the model to say so. Prefer "the model is told to say so when the document doesn't support an answer."
- Hero body "Your documents stay on your Mac." is true but unqualified; the qualification ("only the relevant text and your question go to the provider you chose") is 5 sections later. Add one clause in the hero: "Your files stay on your Mac; only the text you ask about goes to the model you choose." This is the single sentence a privacy-minded reader will look for.
- `hero_parser` "pdf_md" / `PDF → Markdown` chip: internal names with no meaning to a new reader. Say "Readable text" or drop.
- Provider commands: `claude auth login` and `codex login` are not confirmed by the README (it only documents `agy`); the spec's own Open question 2 says to verify against the installed CLI versions. Not verified by me either.
- Order: the body says "use a subscription you already have through its command-line tool" first, but the grid leads with the three API-key cards. Put the three CLI cards first (`en-1200-light-models.png`).

**P1-7. Hero/demo relationship is inverted compared with the references.**
t3.codes and antigravity.google show the product *as the hero visual*. Here the hero visual is a fragmentary three-card collage (P0-2), and the actual product mock (the demo, the best asset on the page) is ~1,200 px below the fold. Either scale the demo's stage into the hero's right column (single pane, 4:3: reader excerpt with the highlight + one chat bubble + chip; same components) or move `#demo` to be the second section. What is missing relative to the reference structure: a product mock above the fold, any real-product proof (screenshot of the actual app is deliberately avoided by the spec, so make the mock convincing instead), and a provider strip that reads as proof rather than navigation (see P2-3). What matches: one-line hero, two CTAs, audience cards, closing CTA.

### P2

**P2-1. Persona cards are text-heavy.** Each card carries role, situation, job and first-use: ~55 words, ~220 words across four cards (`en-1200-light-who.png`). Hold the situation (what they have), merge job and first-use into one line, and keep the quiet inset for the job only. Cut `p*_job` to ≤ 18 words.

**P2-2. Facts row repeats itself.** `8` over `8 file types`, `6` over `6 ways…`, `3` over `3 interface languages` (`en-1200-dark-values.png`); the number is printed twice. Render the dt as the number only and the dd as the unit phrase without the number (`file types`, `ways to connect a model`, `interface languages`), or drop the big numeral. Native names under "3" lost their separators (`English 繁體中文 日本語`); restore ` · `.

**P2-3. Provider marquee animates a row that already fits.** At 1200 the six names fit in one line (`en-1200-light-models.png`), so the 32 px/s scroll is motion with no job. Render a static centered row when the track width ≤ container width; use the marquee only when it overflows. If you keep it static, make it the "provider strip" the reference sites have: 44 px row, 15 px/500 weight, `--ink` at 70 % rather than `--muted`, so it reads as a statement.

**P2-4. Card edges and code-block fill fail the spec's own 3:1 rule.** Measured: `.w-glass` border vs page is 1.21:1 (light) and 1.39:1 (dark); `.w-command` fill vs card is 1.12:1 / 1.07:1, so in dark the command box is nearly invisible. Spec §7 requires ≥ 3:1 for "card edges" and chips. Text contrast is fine everywhere I measured (≥ 6.5:1, including the centered spotlight on glass; the 5 % tint does not threaten text). Fix: `.w-command{ border:1px solid var(--line) }` (the same token the composer uses), keep the card hairline decorative and note the exception in the spec; do not raise hairlines globally.

**P2-5. Demo details.**
(a) On first entry the stage shows its final frame (`data-index=10`) for ~315 ms before restarting at step 0 (timeline probe: `[0,"10"],[315,"1"]`): a visible flash. Render step 0 as the first state and set the final frame only when stopped or under reduced motion.
(b) The composer chip reads `Select a passage` (it reuses the step caption). The real chip shows the quoted selection; show `A useful habit is to explain one idea…` in a truncated chip (`--type-xs`, `--r-xs`).
(c) Reset is a hard cut, not the spec's 320 ms fade: frame 11 (`en-1200-light-demo-frame-11.png`) has the chat cleared while the reader is still scrolled to "Try it". Fade the whole stage content out together (`--motion-slow`/`--ease-exit`), reset scroll while invisible.
(d) The left chat pane is empty for ~3 s at the start of each loop (frames 01-02); it feels like dead time. Pre-seed one earlier assistant message ("Ask me about any highlighted passage") or shorten steps 0-1 (reader fade 320 ms + select sweep 600 ms, currently 1.1 s before the next beat).
(e) Loop period measured 10.9 s; stop after three loops at 33.1 s on `highlight` works exactly as specified; Replay under reduced motion is visible although the spec says hidden.

**P2-6. Motion timing and choreography (judgment from frames).**
`en-1200-light-hero-frame-00..11.png` (33-1499 ms) and `en-1200-light-transition-frame-00..11.png` (51-597 ms): the entrance is calm and premium in character: slow `ease-out-soft`, small distances (`.2em`, 16 px, scale .98), no bounce, one 4 px float. Timing issues:
- The primary CTA is the **last** thing to appear: at 597 ms after clicking the entry link, no CTAs are visible (`transition-frame-11`). Move the CTA row delay from 560 ms to 320 ms (`w-in` 200 ms), body to 240 ms.
- The headline words stagger at 40 ms (~320 ms across 8 groups), which reads as one soft wipe, not word-by-word. That is fine; do not slow it.
- The three hero cards enter at 160/240/320 ms for 800 ms each: the 80 ms stagger is too small to read as layers building. Either 160 ms staggers with `--motion-hero` capped at 600 ms (finish ≤ 1000 ms), or animate one group.
- With the VT cross-fade active, the new page fades in while its h1 is also rising, so two entrances overlap (`transition-frame-02`, `03`). One motion should win (see P1-4).
- Hover (`en-1200-light-hover-frame-05/11.png`): spotlight and lit edge are subtle and well behaved; lift of 2 px plus 1.01 scale is within the spec. Keep.
- Magic numbers worth tokenizing: `1200ms` typing, `1600ms` citation highlight, `900ms` chip delay, `1120ms` float start, `45ms` answer-word stagger.

**P2-7. Spacing rhythm.** Every section uses `padding-block:96px` (192 px between content blocks) and the page is ~5,150 px tall at 1200 (about 6 screens) for a "30-second" story. Make it responsive: `padding-block:clamp(var(--space-8), 8cqb, calc(var(--space-8) * 2))` (32-64 px) so the page lands near 4 screens and the dots/steps stay related. `content-visibility:auto` with `contain-intrinsic-size:auto 640px` makes the scroll height drift: **5,293 px before first scroll-through, 5,134 px after** (−159 px), so the scrollbar thumb resizes mid-scroll and dot-jumps land slightly differently the first time. Use measured intrinsic heights per section (`contain-intrinsic-size:auto 760px` for hero/data, `auto 560px` for values/who) or drop `content-visibility` since the page is a single document of seven sections.

**P2-8. Section dots / a11y small items.**
Dots are a good idea at L and focus moves to the heading on click (verified; smooth jump settles in ~760 ms for the 4-section distance, fine). The demo's inert stage contains real Markdown headings (`h1 Small questions…`, `h2 Try it`, `h2 一點中文`): invisible to assistive tech (`aria-hidden`+`inert`), but a naive heading-outline tool will see 2 `h1`s and `h2`s named "Try itUse this section". Render the demo's Markdown headings as `div role="presentation"` or strip heading semantics inside `.demo-stage`. Heading order in the exposed tree is clean (h1, h2 per section, h3 per card).

**P2-9. zh-Hant / ja copy (I am not a native reviewer; confidence in brackets).**
- ja `hero_title` 「一節ずつ、確かに理解する。」: 「一節」 is bookish (verse/clause), 「確かに理解する」 reads stiff. Suggest 「一節ずつ、きちんと理解する。」 or 「読んだところから、ひとつずつ理解する。」 [medium].
- ja `data_title` 「ライブラリは、あなたの Mac の中に」: 「あなたの」 is a translation-ese possessive; UI copy usually drops it: 「ライブラリは Mac の中に」 or 「ライブラリは、お使いの Mac の中に」 [medium-high].
- ja numerals with counter spaces (「4 人」「3 つ」「1 ページ」): native UI copy normally has no space there. Check against the app's own ja strings and the i18n glossary; if the rest of the app has none, remove for consistency [medium].
- zh-Hant `good_to_know_label` 「小提醒」 undersells the paragraph (no OCR, no sync, 50 MB cap, needs internet once); 「使用限制」 or 「請先了解」 [medium-high]. ja `補足` is fine.
- zh-Hant `data_track_title` 「掌握進度」 ("keep track of progress") for token/cost/budget; 「掌握用量」 [medium].
- zh-Hant hero is the strongest line; ja demo and persona copy reads natural overall.
- CJK headings at 40/48 px: see P0-4. `最初に使う機能` (ja) is natural but at 10.4 px (P1-1).

## What works

- The three-line value story (Read, ask, check) and the persona idea (concrete situation → job → first step) are the right content; the headings alone read as a coherent narrative.
- Reduced motion: **0 running animations** with `prefers-reduced-motion`; the demo renders its final composed state and the page is complete. Reduced transparency: **0 elements with a computed `backdrop-filter`** under the media query. No horizontal overflow at 720×480 (min window), 720×800, 900×700.
- Off-screen idle: 0 running Welcome animations, `data-playing=false`, 0.1-0.2 % CPU (Tab and GPU) over 10 s.
- The demo is the strongest piece: 3-loop stop is exact (stops at 33 s on `highlight`), zero frames > 20 ms across 2,699 frames, the scripted label is honest, and it uses the real renderer and chip styles.
- Motion character is restrained and consistent with the app: soft ease-out, small distances, no spring, no continuous loop except the 4 px float. Spotlight/lit-edge hover is tasteful and coalesced.
- Token discipline is mostly good: radii use `--r-md/--r-lg/--r-inner` correctly (stage 20 with 6 inset → 14 inner), elevations from tokens, no stray colors. Text contrast measured 6.6-14.6:1 in both themes.
- Heading order and landmarks are clean; focus lands on the h1 on open; decorative stage is `inert`; no persona card adds a tab stop.
- Cost: the lazy Welcome chunk is small (12.9 KB gzipped per `docs/evidence/welcome-bundle.json`).

## Evidence index

Stills: `en-1200-light-hero.png`, `en-1200-dark-hero.png`, `en-900-dark-hero.png`, `ja-1200-light-hero.png`, `zh-Hant-1200-light-hero.png`, `en-1200-light-demo.png`, `zh-Hant-900-dark-demo.png`, `en-1200-light-who.png`, `ja-1200-dark-who.png`, `en-1200-dark-values.png`, `en-1200-light-models.png`, `en-1200-light-data.png`, `en-1200-light-full.png` (all under `/tmp/vstudy-welcome/`).
Frames read: `en-1200-light-hero-frame-00,02,04,06,08,11`, `en-1200-light-demo-frame-00..11`, `en-1200-light-transition-frame-00..11`, `en-1200-light-hover-frame-00,05,11`.
Live runs (scratchpad, not in repo): frame-time probes (home/hero/scroll/demo), isolation CSS toggles, 24+ navigation runs with and without VT, 45 s demo timeline, off-screen CPU, pause/play, reduced motion/transparency (CDP-emulated), Tab order, computed font sizes and contrast, 720×480/720×800/900×700 captures, scrollHeight drift, sparkline attribute probe.

## Suggested order of work

1. P0-1 copy (one afternoon with a native pass for CJK), P0-2 grid stack and hero spacing, P0-3 reader toolbar, P0-4 CJK line-breaking. These four change the first impression.
2. P1-1 type sizes, P1-2 sparkline, P1-3 Pause reachability and no-replay, P1-5 single title bar.
3. P1-4: change the gate, drop VT for Welcome entry, drop hero blur, cap the float.
4. P1-6/7 and P2 as polish; re-run the screenshot matrix and attach a native zh-Hant and ja review before release.
