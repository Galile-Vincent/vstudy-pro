# Reader art direction

The goal is a simple, modern workspace where the document has a clear reading surface and the assistant has a useful place beside it.

## Prototype decision

Three static HTML prototypes live outside the repository at `/tmp/art-reader-01.html`, `/tmp/art-reader-02.html`, and `/tmp/art-reader-03.html`. Their screenshots are under `docs/evidence/art/reader/prototype-*.png`.

1. Quiet folio gives the document a softly elevated page, a restrained accent rule, and a separate assistant column.
2. Chromatic studio places a large gradient artwork inside the reading page. Its art pushes actual reading too far down the window.
3. Editorial desk uses larger typography and a narrow assistant. Its long title consumes too much vertical space, while the narrow assistant wraps controls unnecessarily.

Choose Quiet folio. Keep the expressive artwork on Home and Library cards. Reading gets one quiet accent gesture and a comfortable measure. Theme tokens determine all production colors. The prototypes use fixed sketch colors only.

## Existing architecture and implementation shape

AppShell owns navigation and collapse state. Workspace owns the selected document, source, selection, conversation, provider selection, and responsive pane. Chat adapts persisted messages to assistant-ui's local runtime. The vendored Thread owns message, tool, citation, and composer primitives.

Keep these ownership boundaries. The data shape stays `Document + Conversation + Message[] + Selection | null`. A small welcome component takes a document title, selection state, and an optional suggestion action. Suggestion prompts interpolate the real document title. No second chat runtime or provider state machine is needed.

Two layout structures were considered. A sticky composer inside the scrolling thread can cover content when the setup notice grows. A fixed flex sibling below the scrolling viewport reserves real space for the composer. Choose the sibling layout. ThreadPrimitive.ViewportFooter remains the assistant-ui footer primitive.

The unavailable-provider state stays inline in the thread. A deliberate secondary action returns focus to the reader and switches the compact pane. Existing source, selection, provider, and conversation security contracts remain intact.

## Throughput checkpoint

Implement one shared stylesheet with `--art-reader-*` tokens, reusable CSS artwork, and one reusable welcome. Capture one Electron process sequentially for each theme and state. Use the same repeatable evidence script for before, critique rounds, and final acceptance. Courses files remain outside this change.

## Process ownership

This is the implementation sub-agent. Design exploration, implementation, and self-critique run in-thread. Independent review and any PR gate belong to the parent coordinator. No nested agents or PR are created here.

## Critique round 1

Evidence is under `docs/evidence/art/reader/round-1/`.

The separated page and quiet chrome improve hierarchy. The coach is a small toolbar entry instead of a banner. The no-AI card clears the composer, confirmed by geometry assertions in both schemes.

The Library artwork reached the card edge correctly, but metadata had no inset because the inherited document cell used `display: contents`. Give the grid cell a flex layout and padding. Selection needs an explicit active treatment over the new card surface. The composer needs a real document-context chip rather than an unstyled paragraph.

The empty-chat screenshot caught the loading transition. The Home screenshot also preceded the first read. Tighten the evidence wait to the actual assistant-ui composer and seed real reading activity before Home capture. Rename fixture documents through the library IPC so headers have useful titles. These are evidence corrections, not production loading delays.

## Critique round 2

Evidence is under `docs/evidence/art/reader/round-2/`.

The welcome, suggestions, and context chip now establish a useful assistant hierarchy. Home has real reading cards with artwork and distinct setup and import actions. The document title and toolbar remain aligned.

Library still has excessive empty space because its column count reads a stale initial viewport width. Observe the real results viewport, and retain the existing virtual row model with a 16px vertical gutter. Card selection keeps an explicit accent inset. Add a small progress track to the setup checklist so progress is readable at a glance.

The ordinary fake provider echoes the entire prompt as a code block, which makes conversation evidence unrepresentative. Use the existing enriched fixture response for subsequent screenshots. This exercises reasoning, a tool table, and a citation through the real provider adapter without modifying production provider code. The visible test question is labelled as fixture data.

## Final acceptance

The final review tightened sidebar folder spacing after adding the profile footer. At 125% scale the Reader collapses the sidebar and uses a compact welcome. The pseudo-locale captures wait for expanded text to render through the actual i18n instance.

The keyboard pass covers a 720px compact window. Returning from chat to reading now changes the pane before moving focus on the next animation frame. This keeps focus out of a hidden pane.

Final production evidence covers all nine themes and both schemes. Separate matrices cover the three supported languages, en-XA, scale, and window sizes. Details and exact commands are in [Reader verification](reader-verification.md).
