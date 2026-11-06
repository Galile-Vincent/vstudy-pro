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

The v2 HTML sketches stay outside the repository. The coordinator requested that remaining evidence be committed. This task therefore commits its PNG captures alongside JSON audits, screenshot manifests, design decisions, and verification instructions. T3 captures can rasterize at a different size than their CSS viewport. The manifest records the CSS width used for each capture.

### Initial integration gate

Before U4 merged, main was `ec24a40` and had neither the U4 clean-art merge nor `docs/MCP.md`. The MCP tile and FAQ therefore say coming soon in all three languages. The final step must merge main after U4 lands, update MCP copy if its documentation has arrived, run `pnpm build && node apps/desktop/scripts/marketing-shots.mjs`, inspect the generated contact sheet, rebuild the site and README derivatives, and rerun checks. Current screenshots still use the pre-U4 art.

### Completed U4 integration

Merged main `6d26b91` as `67755ea` and regenerated all 132 app captures. Every capture passed visual review across the twelve theme/scheme sheets. Course covers now show soft fields without stripe, contour, image, or glyph overlays. The website and shared images used by the three READMEs now use the regenerated files. All 264 encoded variants retain 2880×1800 dimensions, and all 22 alias/format combinations match their source captures by hash.

A real-wheel header regression covers home/docs, desktop/mobile, and light/dark. Every settled state shows backdrop opacity 1, 16px blur, an 85% neutral fill, and no bottom rule. Navigation stays legible over screenshots and prose. The earlier dark overlap was not reproduced after real scrolling and the fade settled, so no CSS change was needed.

The final run passes 490 responsive states and 232 axe page/palette states. Home and Getting started each score 100 in all four local mobile Lighthouse categories, with zero CLS. Home images total 144,274 bytes. Typecheck, lint, knip, and 1,026 tests pass; 14 existing tests remain skipped. The static audit checks 49 pages and 2,007 links/fragments; README links also pass. Full evidence and command outputs are in [the final report](evidence/website-v2/final/VERIFICATION.md). `docs/MCP.md` is absent from this merged main, so MCP remains accurately marked coming soon.


## Website trust sections, W3

The home school walkthrough now contains five fictional examples. Monograms use the site's own system type and neutral CSS gradients. They are original demo tiles, not university marks. The service-detection chip is explicitly inside a fictional demo. Connect only animates the button. It makes no request and opens no sign-in flow.

CYCU is described as an early test site with full course-content compatibility unconfirmed. Checked `docs/moodle-cycu-confirmation.md`, `docs/evidence/ux/after-connect-min.txt`, `docs/evidence/ux/after-moodle-01-authenticated-pane.png`, and the onboarding school captures. The pane capture shows a local 127.0.0.1 fixture, not live CYCU authentication. Directory discovery and fixture captures do not establish live sign-in or complete content, assignment, quiz, or grade support. The confirmation document records failed calls and an outstanding confirmation run. No UCL compatibility claim remains on Home. The school docs explain that the built-in directory is for discovery, not certification or endorsement.

### Data and ownership

`Schools.astro` owns the walkthrough and `Providers.astro` owns the provider grid. `data/trust.ts` contains fictional school records, the provider connection registry, and complete English, Traditional Chinese, and Japanese copy. The provider registry satisfies the desktop `ProviderConfig` ID union, so missing or invented providers fail type checking. Source grounding includes `main/providers/index.ts`, `api.ts`, `cli.ts`, `codex.ts`, `agy.ts`, `models.ts`, renderer `provider-metadata.ts`, and README's Providers and keys section. Models depend on account and endpoint discovery. The page promises no fixed model catalog. Codex retains the macOS and verified-version limitation.

Compared a shared Home script with separate component-owned behavior, and a single swapped card with pre-rendered stacked slides. Chose component ownership and stacked slides. The former avoids Download-stream overlap. The latter reserves layout space and supports a static list without JavaScript or with reduced motion. Only transform and opacity animate slide changes. Visibility gates focus and pointer interaction. Autoplay advances every 4.8 seconds, pauses on hover and focus, and stays paused after touch or manual navigation until Play. The page-wide motion control also pauses the carousel. Live announcements are off during autoplay and polite while paused.

The throughput checkpoint has four items. Blocking first steps were source and brand verification. Independent workstreams are the two components, implemented by this delegate without nested agents. Shared state is limited to the existing page motion preference and additive localized guide paragraphs. The smallest safe decomposition is one owner for this diff, followed by coordinator review. Download code and desktop implementation are untouched.

### Brand usage

Official pages fetched on 2026-11-06. These entries report the pages' wording and our implementation decision. They are not legal conclusions. No third-party logo asset, brand font, traced mark, imitation mark, or unofficial kit ships in this change. Neutral labels use the same system typography as every other card.

| Brand | Official source | What the guidelines say | What we used |
| --- | --- | --- | --- |
| Anthropic and Claude Code | [Anthropic Trademark Guidelines](https://www.anthropic.com/legal/trademark-guidelines) | Use requires specific permission and materials approved beforehand. Supplied marks cannot be altered. Spacing must preserve readability. Affiliation cannot be implied without authorization. | Plain names in neutral typographic chips. No approval or official supplied asset was verified, so no logos. |
| OpenAI and Codex | [OpenAI Design Guidelines](https://openai.com/brand/) | Logo use must relate directly to OpenAI services, follow its terms, preserve the supplied artwork, acknowledge ownership, and avoid implied endorsement. Co-branded partnership materials require approval. | Plain names in neutral typographic chips. No explicit third-party works-with badge permission for this presentation was verified. No logo or partnership lockup. |
| Google Antigravity | [Google guidance](https://about.google/brand-resource-center/guidance/) and [products and services](https://about.google/brand-resource-center/products-and-services/), [icon guidance](https://partnermarketinghub.withgoogle.com/brands/google/branding-guidelines/how-to-show-googles-brand/), and [product compatibility](https://partnermarketinghub.withgoogle.com/brands/google/use-cases/product-co-branding/) | Informational plain-text product references are described as allowed under the trademark rules. Compatibility guidance prefers accurate plain text and product icons only when necessary. The icon page directs users to request permission. Do not imitate visual identity or imply endorsement. Products without specific guidance refer to general icon and integration rules. | Plain Antigravity name in a neutral typographic chip. No specific Antigravity works-with logo authorization was verified. No Google or Antigravity icon. |
| OpenAI-compatible endpoints | Desktop `api.ts` and shared provider IDs, rather than a separate brand kit | A protocol connection category, not a separate endorsed vendor. Endpoint privacy depends on the configured service. | Plain descriptive chip. No model vendor logos or claims about every model. |

All three locales include the trademark and non-affiliation disclaimer. New sections add no images, fonts, libraries, or external requests. Verification results are recorded in `docs/evidence/website-trust/VERIFICATION.md`.


## Butterfly arrival, 2026-11-06

The owner's 2026-11-06 butterfly supplies the silhouette and blue-to-violet gradients. The arrival leaves the headline, description, and download controls clear, then returns to a still page.

### Direction study

`scripts/brand-motion-study.mjs` renders twelve frames across 7.6 seconds for each of three cubic paths in light and dark. The six contact sheets and 72 frames are in `docs/evidence/brand/motion/`. These are deterministic layout studies. Live browser screenshots verify the implemented home page separately.

- **Arc, selected.** Wide early separation leaves open space over the headline. The butterflies descend along opposite product-window edges. One returns toward the nav logo and rests for 1.1 seconds before fading.
- **Ribbon.** Control-point spread is 55 percent of the arc. The butterflies cluster near the center, and keep-out clipping makes their passage less continuous.
- **Orbit.** Spread is 125 percent of the arc, and the lower control points reach 115 percent of the viewport flight depth. The steeper sweep draws attention away from the product.

The second visual pass corrected two issues. Text keep-out rectangles now use text ranges and individual CTA links, rather than full-width block boxes. The macOS icon comparison exposed a hard contact shadow; the generator now uses only the diffuse shadow.

### Motion parameters

`butterfly-model.ts` owns `Point`, `Rect`, and `Flight`. A flight has four cubic control points, a size, opacity, delay, and a settlement flag. There are four butterflies on desktop, or three below 768px, with Save Data, at most four reported CPU cores, or at most 4GB reported device memory. The browser does not expose a portable low-power-mode signal.

Sizes are 18 to 27px. Peak opacities are .42 to .64. Start times differ by 290ms. Wings fold independently around the center, with a 1.04-second sine cycle, .40 to .96 horizontal scale, and a slight opposing skew. The outer symbol moves only with transform and opacity. A radius of .8 times the butterfly size expands each protected text rectangle, including the rotated wing corners.

The origin is the hero logo. The lower flight depth stops 40px above the viewport edge or at the product-window bottom. One endpoint sits beside the nav mark. All butterflies disappear by 7.6 seconds. No animation frame is scheduled after completion.

The script runs only on home pages. It starts after load and idle, stores `vstudy-butterflies-v1` in session storage, and replays from the hero or nav logo. Storage denial does not prevent the page from working. Reduced motion displays no flight. The page's existing pause control and hidden tabs pause the loop. Resize or scroll ends a running arrival so stale geometry cannot cross the copy. CSS containment, fixed positioning, decorative semantics, and pointer-events none prevent layout changes or input interception.

The onboarding uses a static lockup. Another idle animation competes with its existing preview and adds little value.

### Header and brand treatment

Both app and website headers remain borderless at rest and on scroll. The website retains a translucent blur without elevation. Desktop symbols retain brand colors across packs; outlined lockup lettering switches with the resolved scheme, through the existing whole-page theme transition. README picture sources follow GitHub's color scheme.

`pnpm brand` validates the originals, optimizes SVG geometry conservatively, compares rasterized results, and generates icons and metadata. macOS uses an 824px rounded body at 100px from each edge of a 1024px transparent canvas, with a 12px diffuse shadow at 22 percent opacity and a 12px vertical offset. The supplied 226px corner radius becomes about 182px at that size, close to the stock macOS body. Windows and Linux use the supplied full-canvas artwork. `scripts/check-brand.mjs` checks body size, transparency, shadow alpha, cubic endpoints, lifecycle, and protected text.
