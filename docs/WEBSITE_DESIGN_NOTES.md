# Website design notes

VStudy Pro needs to explain a student workspace before asking a visitor to download it. The home page pairs the app's real interface with short explanations. The docs explain the current implementation and its limits.

## Reference inspection

Inspected [T3 Code](https://t3.codes/), [assistant-ui](https://www.assistant-ui.com/), its [docs](https://www.assistant-ui.com/docs), and its [installation page](https://www.assistant-ui.com/docs/installation) in the T3 browser before implementation. Captured 390px and 1440px layouts with light and dark media preferences. T3 stays dark under both preferences and offers no scheme control. assistant-ui responds to the preference and offers a theme button.

Raw DOM and computed-style measurements are in [references/measurements.json](evidence/website/references/measurements.json). Reference PNGs are in the same directory. These are inspection evidence, never shipped website assets. Measured values describe the captured site state, not a promise about future versions.

| Role | T3 Code, 1440px | assistant-ui, 1440px | VStudy decision |
| --- | --- | --- | --- |
| Build evidence | Astro attributes and fingerprinted /_astro assets | Next.js /_next/static chunks | Astro static output, no React runtime |
| Font | -apple-system, system-ui, Inter Variable, Segoe UI | Public Sans, with JetBrains Mono for technical labels | Native system stack, self-contained and close to the app |
| Hero h1 | 76px, 600, 79.8px line, -2.28px tracking | 72px, 500, 74.88px line, -1.08px tracking | 72px, 600, 76.32px line, -2.52px tracking |
| Hero h1 at 390px | 35.88px, 37.674px line | 44px, 45.76px line | 44px, 46.64px line |
| Section h2 | 48px, 600, 50.4px line, -1.44px tracking | 28px, 550, 38.5px line, -0.28px tracking | 40px, 600, 44.8px line |
| Body and subline | 16/24px body, 19/29.45px subline | 15/24.375px subline | 16/26.4px body, 20/32px subline |
| Small text | 13/19.5px nav, 13.5/18.9px cards | 14/20px nav, 14/23.8px docs | 14px navigation, 12px metadata |
| Container | 1240px including 32px side padding | 1248px content, x=96 | 1200px content, x=120 |
| Mobile gutter | 20px | 16px | 20px |
| Hero spacing | 72px section top, plus 48px heading margin | h1 y=160 below a 48px header | 96px top below a 72px header |
| Section rhythm | 80px vertical padding | Content-led spacing, 12px demo gap | 96–112px sections, 80–96px feature separation |
| Primary button | 15px/600, 14px 22px padding, 50.5px height | Compact 14px control | 14px/600, 12px 24px padding, 48px height |
| Radius | 8px controls, 10px large buttons and cards | 8px controls, 12px search dialog | 8px controls, 12px actions, 16px panels, 24px hero frame |
| Card padding | 14px 16px endorsement card | 6px 12px nav control, content cards vary | 24px panel padding, flat tonal separation |
| Borders | 1px white at 8% on dark cards | 1px neutral rules in docs | App convention, tonal panels; rules only for header, FAQ, and separators |
| Shadows | Primary action and endorsement cards have none | Most panels flat; search has a subtle 1px ring | Cards flat; app-window presentation and floating dialog use one soft shadow |
| UI motion | 180ms ease; nav border 300ms | 150ms cubic-bezier(.4,0,.2,1); sidebar 200ms | 120ms fast, 180ms UI, 320ms entrance |
| Reveals | 700ms entrance, staggered delays; long looping marquee | No active reveal animation in sampled hero | One already-visible hero entrance, no scroll reveal or marquee |
| Sticky header | Sticky, 61px, black at 75%; no computed backdrop filter | Sticky, 48px; no computed backdrop filter | Sticky, 72px desktop, 64px mobile; 96% opaque canvas |

T3 has a centered promise followed by an unmistakable download action and a wide product screenshot. VStudy uses that hierarchy. assistant-ui keeps prose direct, controls compact, and docs navigation predictable. VStudy uses that restraint. Neither site's text, marks, or product imagery is reused.

## Color measurements

| Role | T3 Code | assistant-ui light | assistant-ui dark | VStudy light / dark |
| --- | --- | --- | --- | --- |
| Canvas | #000000 in both preferences | oklch(.992 .002 106) | oklch(.17 .003 106) | #f5f6fa / #171b28 |
| Main text | #f5f5f5 | oklch(.145 .006 106) | oklch(.985 .002 106) | #22293c / #eef1fa |
| Secondary text | #a3a3a3 | oklch(.556 .007 106) | oklch(.708 .004 106) | #505b73 / #b7c1d6 |
| Panel | #0a0a0a | Tonal near-white | Tonal warm charcoal | #ffffff / #202637 |
| Primary action | oklch(.571 .21 264) | Near-black | Near-white | #435caa / #a7baff |
| Rule | white at 8% on sampled cards | oklch(.922 .005 106) | Defined in raw token capture | #c4ccdf / #455572 |

VStudy's real palettes come from apps/desktop/src/shared/themes/palettes.json. The website imports this data without modifying it. Paired orbs preview both variants. A selected pack changes the page's full set of basic roles. Theme changes are an explicit preview; only the scheme override persists. System preference initializes before paint and continues to update until the visitor chooses a manual scheme.

## Docs inspection and adaptation

| Role | assistant-ui measured or observed | VStudy |
| --- | --- | --- |
| Sidebar | Fixed, 260px; 16px 12px navigation padding | Sticky 240px; mobile native disclosure |
| Content | 848px article at 1440px; 14/23.8px prose | At most 720px, 72ch; 16/26.4px prose |
| h1 | 24/32px, weight 500, -0.6px | 40/46px, weight 600 |
| h2 | 20/28px, weight 500, -0.4px | 24/32.4px, weight 600 |
| TOC | Right rail with heading anchors | 184px right rail above 1200px |
| Code | 12.5px monospace, 14px horizontal inset | 14/25.2px system monospace, 20px inset |
| Search | 553.6px modal, 12px radius, labelled combobox, tabs | At most 640px native modal, 16px radius, labelled search field and link results |
| Previous/next | End-of-article links | Tonal previous/next panels from the content registry |
| Mobile | Sidebar becomes controlled navigation | Native disclosure leaves the article visible initially |

The website's index searches titles, descriptions, headings, paragraphs, and steps. Every result links to the matching section. It has a no-results state and a retryable load-error state. Queries never leave the browser. Search is loaded only on demand.

## Structure and content

Compared a React single-page app and Astro static routes. Chose Astro because docs and marketing copy need no application runtime. The shared data shapes are Language, Guide, and Section. Guide owns its slug, group, source pointer, description, and sections. This single registry generates routes, navigation, TOC, section-level search entries, and previous/next links. No markdown renderer or hosted search service is needed.

Content was checked against README.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/moodle-design.md, docs/STORAGE.md, docs/DESIGN_DIRECTION.md, apps/desktop/FOUNDATION.md, theme palettes, and renderer shortcut handlers. FOUNDATION.md records historical stubs; the current architecture and source determine shipped functionality. Provider billing, no OCR, backup credential exclusions, unavailable mobile services, and unsigned-build limitations stay explicit.

The brief supplies the audience, product truth, languages, references, and download destination. As the implementation sub-agent, I used those settled choices for the design direction and performed the architecture and visual passes in-thread. Independent parent review remains separate from these implementation checks.

## Assets and budget

Only real app evidence is shipped as product imagery. It uses deterministic sample data or test providers. The hero caption says so. Images have intrinsic dimensions and WebP compression at quality 82. System fonts require no downloads. The page has no third-party runtime requests, analytics, video, or animation library.

| Asset | Original evidence |
| --- | --- |
| reader.webp | onboarding/en-sample-chat-answer.png |
| courses.webp | ux/after-courses-en-1200-100.png |
| planner.webp | ux/after-planner-en-1200-100.png |
| history.webp | chat-history/history-search.png |
| themes.webp | themes/iris-light-settings.png |
| school.webp | onboarding/en-school-school-picker.png |
| onboarding.webp | onboarding/en-sample-start.png |
| moodle.webp | ux/after-moodle-01-authenticated-pane.png |

favicon.svg and the 1200×630 OG PNG use original geometric book branding and website text. No generated illustration is used.

## Design QA

The implemented hero deliberately sits between the references' density. At 1440px its 72px title matches assistant-ui's size, its 96px top space sits between T3's 72px section padding and assistant-ui's 112px gap, and its 48px action approximates T3's 50.5px target. The 1200px screenshot width is slightly narrower than either reference's container.

| Token | Reference target | Implemented CSS |
| --- | --- | --- |
| Display size | 72–76px | 72px desktop, 44px mobile |
| Display tracking | -1.08px to -2.28px | -2.52px desktop, -1.54px mobile |
| Hero gutter | 16–32px | 32px desktop minimum, 20px mobile |
| Hero top spacing | 72–112px desktop | 96px desktop, 64px mobile |
| Body-to-action gap | T3 36px | 32px |
| Button radius | 8–10px | 12px to follow the app's radius scale |
| Hero outer/inner radius | Restrained rounded app frame | 24px outer, 16px image after 8px inset |
| Nested feature frame | App panel principle | 16px frame, 8px image after 8px inset |
| UI transition | 150–180ms | 180ms |
| Easing | cubic-bezier(.4,0,.2,1) | Same for colors; cubic-bezier(.16,1,.3,1) for transforms |
| Focus | Visible keyboard target | 3px palette focus, 4px offset |

Computed values, accessibility results, screenshots, and responsive checks are recorded in docs/evidence/website. No claimed Lighthouse result should be inferred from build success.

The side-by-side hero comparison is saved as evidence/website/hero-comparison.png, in T3, assistant-ui, VStudy order. The comparison confirmed the title scale, action spacing, and frame proportions. Feature-frame nesting was adjusted to 24px, 16px, and 8px with 8px insets.

The final interaction-style capture records T3's primary hover background as oklch(.62 .2 264), a 1px upward hover, a zero-offset active transform, and a 2px focus outline with 2px offset. Its scrolled nav gains a subtle bottom rule. assistant-ui's docs TOC rail measures 224px. Its main-content focus outline is 2px with an inward 2px offset, prose links fade to .8 on hover, and small icon translations use half a spacing unit. Raw rules are in evidence/website/references/interaction-styles.json. VStudy adapts these to tonal hover, 2px action lift, 3px focus with 4px offset, and no layout animation.

Final local Lighthouse 13.6.0 mobile runs score 100 in performance, accessibility, best practices, and SEO on Home and Getting started. These are individual local runs, not a production-hosting benchmark. Both report zero cumulative layout shift. All 196 page captures pass axe after finite entrance animations settle. All nine packs also pass in both schemes. The additional 294 responsive checks complete five widths and two schemes across all 49 pages with no horizontal scroll.

The desktop sidebar disclosure and keyboard access to horizontally scrollable code were corrected from real browser findings. Search was checked with a query, no results, a failed index load, a successful retry, keyboard activation, Escape, and restored trigger focus. Clipboard copy announced success. A language change preserved the docs slug and marked an English fallback article correctly. The skip link focuses main. Manual color preference survives navigation.

The complete home asset budget is 146,583 bytes at the largest locale, including uncompressed HTML, linked CSS and JS, and all home images even when lazy. It excludes OG metadata imagery because browsers do not fetch that as page content. No font downloads occur. The static audit checks 1,947 internal links and fragments.

Screenshots are viewport captures at 390×1000 and 1440×1000, with additional scrolled captures for the agent, privacy, themes, FAQ, and final action. PNG evidence follows the repository's existing ignore rule and remains local. JSON results, manifests, source assets, and verification notes are committed. Reduced-motion behavior is implemented and CSS-audited; the T3 browser API does not expose reduced-motion emulation. Independent parent review and hosted Pages verification remain outside this implementation pass.

## Website v2, owner feedback

The owner rejected the tinted canvas, quiet presentation, hard theme cuts, and header rule. This revision replaces the alternating feature rows with a mixed bento grid and keeps the existing static routes, guide registry, product truth, and three languages.

### Prototype decision

Compared three static HTML prototypes outside the repository at `/tmp/vstudy-website-v2-prototypes/`. Captured them with the T3 browser. The source sketches use the current real course screenshot and the same copy so composition is the variable. The comparison is in [website-v2/prototypes/comparison.png](evidence/website-v2/prototypes/comparison.png).

| Prototype | Observation | Decision |
| --- | --- | --- |
| Centered aurora | Large two-line type and a wide product window preserve the app's legibility. A low-opacity glow adds depth without coloring the whole canvas. | Selected. |
| Split studio | Product and headline compete horizontally. The app becomes too small to read at the same viewport. | Rejected. |
| Paper | Clean white space and a shallow perspective feel calm, but the composition is close to the rejected page. | Rejected. |

Exhaust the Design Space changed the hero decision from an untested restyle to three rendered alternatives. Model the Domain kept new copy in a typed locale record and theme updates in one shared function. Prove It Works changed the acceptance check from build success to real browser actions, rendered captures, axe, and local Lighthouse.

### Implemented direction

The canvas is #fafafa in light and #0b0b0d in dark. Panels use neutral white and charcoal. Palette orbs change the accent and matching real app preview, while the canvas stays neutral. The hero reaches 92px and uses localized line breaks. A slowly drifting aurora sits behind the product window. A requestAnimationFrame scroll handler applies at most 20px of translation and 1.8% of scale. No animation library is loaded.

The bento cards combine courses and reading captures with a ticking example deadline, a searchable conversation example, an approval/reset example, working palette orbs, a Moodle capture, and an MCP tile. Demo data is labeled. The school monograms are directory examples, not endorsements or guarantees. The adjacent text keeps Moodle mobile-service compatibility explicit. Setup has numbered steps connected by simple lines. The FAQ keeps the real distribution, privacy, offline, and provider limitations.

Headers have no bottom border on home or docs. Their background, blur, and faint shadow appear through a pseudo-element's opacity after scrolling. The docs keep their existing route, navigation, callout, search, anchored heading, and copy-code structures. Neutral surfaces, calmer sidebar typography, and inset code blocks refine the reading experience.

Both theme controls use a shared 280ms View Transitions crossfade. If unavailable, registered color properties interpolate for 280ms ease-out. The inline scheme initializer still runs before paint. Transition CSS activates after initialization. Reduced motion skips the API and all motion. The page also has an explicit motion pause control.

### Visual review

The first pass found mobile overflow caused by the drifting glow. The glow's own bounds now stay inside the viewport. No global overflow hiding was added. The second pass found the reading-format note overlapping its screenshot. Clipping now belongs to the screenshot container and the note has its own space. Captures from both passes and the corrected result are under [website-v2](evidence/website-v2/).

The v2 HTML sketches stay outside the repository. PNG evidence follows the existing local-evidence ignore rule. JSON audits, screenshot manifests, design decisions, and verification instructions are committed. T3 captures can rasterize at a different size than their CSS viewport. The manifest records the CSS width used for each capture.

### Integration gate

At this pass, main is `ec24a40` and has neither the U4 clean-art merge nor `docs/MCP.md`. The MCP tile and FAQ therefore say coming soon in all three languages. The final step must merge main after U4 lands, update MCP copy if its documentation has arrived, run `pnpm build && node apps/desktop/scripts/marketing-shots.mjs`, inspect the generated contact sheet, rebuild the site and README derivatives, and rerun checks. Current screenshots still use the pre-U4 art.
