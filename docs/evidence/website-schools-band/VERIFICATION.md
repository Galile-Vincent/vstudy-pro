# W4 schools band

Replace the fictional school search with a horizontal explanation of Moodle school connections. Students now see the mobile-service requirement, three connection steps, and two useful links. The home page outside the school section, including Download and Providers, is unchanged.

Implementation branch is `t3/website-schools-band`, based on `f5dacd1c`. The coordinator owns independent review and integration. This implementation delegate started no nested agents and opened no PR.

## Design and data

One full-width neutral card uses the existing 24px panel radius, spacing, system typography, and semantic color tokens. The left column holds the eyebrow, headline, and requirement. The right column holds an ordered flow with original 24px line icons. The connector is horizontal at 1024px and wider. Below 1024px it is vertical. At mobile width the introduction and flow form one column. Links have persistent underlines, visible focus rings, and 44px minimum height. The lookup link opens a new tab with `noopener noreferrer`, an arrow, and a localized screen-reader notice.

`TrustCopy.schoolSteps` is a three-string tuple in English, Traditional Chinese, and Japanese. The other school fields hold the headline, requirement, lookup label, guide label, availability note, and new-tab announcement. The provider registry and provider copy in the same file are unchanged. `Section.links` is a small optional label/URL list used by the availability guide. Its renderer adds no behavior to other pages.

The old fictional school records, search markup, playback controls, timers, state module, copy keys, styles, playback tests, and obsolete school evidence were deleted. Historical provider evidence stays in `website-trust`.

The first-view IntersectionObserver marks the band once and disconnects. Steps fade with a 320ms entrance and 120ms stagger. The connector draws through transform with a 180ms delay. No layout property animates. The page pause control disables the animations. Reduced motion disables them through the existing global media rule and the local no-preference gate. With JavaScript unavailable, all three steps and both links are already in the HTML.

## Official lookup and product truth

The official [Moodle registered-sites page](https://stats.moodle.org/sites/) loaded successfully in T3 preview on 2026-11-06. The rendered title was `Registered sites | stats.moodle.org`. It groups public registered sites by country and states that private registrations are omitted. I chose it because the owner wants visitors to look up schools. App administrator documentation answers setup questions but does not provide this school list.

A listing does not prove that a school enables mobile services or permits VStudy Pro. A missing listing does not prove that a school lacks Moodle. All three availability guides now explain these limits, HTTPS and version requirements, and the distinction between discovery and verified compatibility.

The note says that availability depends on school settings and that the app was first tested with CYCU in Taiwan. `docs/moodle-cycu-confirmation.md` still records failed contents, assignment, quiz, and mobile-config calls and an outstanding confirmation run. The guide explicitly preserves that uncertainty. No other real university names or logos were added.

## Visual decisions and iterations

Three rendered treatment comparisons are in `prototypes/`. Their standalone HTML sketches are outside the repository at `/tmp/vstudy-schools-band-prototypes/`.

| Treatment | Observation | Decision |
| --- | --- | --- |
| Neutral connected flow | One calm card, uninterrupted connector, enough space for translated text. | Selected. |
| Vertical divider | Adds a second boundary and narrows the flow without clarifying a step. | Rejected. |
| Framed steps | Three nested cards make the section denser and remove the continuous connector. | Rejected. |

`before/` contains 1200×768 and 1440×900 CSS viewport captures in light and dark. `round-1/` records the first implementation. The critique found desktop link text too small and a custom headline size. Round 2 raised links to the existing 14px size and used the shared 48px title token. `round-2/` then exposed a tablet title that dominated the vertical flow. The final revision uses the site's 32px title size at tablet width.

I inspected the final light and dark contact sheets across all three languages. Heading wraps, body width, icon alignment, connector joins, underlined links, note placement, panel radius, and spacing against the hero and next section are consistent. The mobile note wraps naturally instead of shrinking text to force a line. Screenshots can rasterize at a different size from their CSS viewport in T3 preview.

- Before desktop is `before/en-1440-light.png` and `before/en-1440-dark.png`.
- Final desktop is `final/en-1440-light.png` and `final/en-1440-dark.png`.
- Final mobile is `final/en-390-light.png` and `final/en-390-dark.png`.
- The same final paths exist for `zh-Hant` and `ja`.
- `light-contact-sheet.png` and `dark-contact-sheet.png` collect the twelve final screenshots.

## Verification

The production preview was `http://127.0.0.1:4338/vstudy-pro/`. Browser validation used T3 `preview_*` with one owned tab. That tab was closed before Lighthouse launched its single Chrome process. Lighthouse closed its process after completion.

| Check | Result and evidence |
| --- | --- |
| Home responsive matrix | 30 states pass. Three languages, widths 390/768/1024/1440/1920, light and dark. No horizontal overflow. `browser-audit.json`. |
| Home axe | Zero WCAG 2 A/AA and 2.1 AA violations after finite entrance animations settle in all 30 states. Axe 4.11.0 was injected only for QA. |
| All palette variants | 54 school-section axe audits pass. Nine real app accent packs, three languages, light and dark. Neutral text and surfaces are invariant across packs. |
| Availability guides | 12 states pass axe and overflow checks. Three languages, 390/1440, both schemes. Official lookup and CYCU limit present. |
| Links | Correct localized guide fragment. Real activation reached the Japanese availability section and its official lookup. External URL, rel, new-tab target, and localized announcement checked in all home states. |
| Focus and page pause | Focus ring measures 3px solid. Page pause leaves all three steps visible with zero active band animations. `motion-audit.json`. |
| First-view layout | Identical band bounds before/after entrance, no observed layout shifts. Animation keyframes contain only transform and opacity. |
| Reduced motion | CSS audited. The global reduce rule disables all animation/transition and the band only animates in no-preference. Native preference emulation is unavailable in T3 preview and was not claimed as a browser test. |
| No JavaScript | Static built-HTML audit confirms all three steps and both links, with no hidden baseline. Browser-level JavaScript disabling was not exposed by T3 preview. |
| Lighthouse | One local mobile run per language with Lighthouse 13.6.0. Performance, accessibility, best practices, and SEO all 100. CLS 0. No runtime errors. `lighthouse-summary.json`. |
| Home image budget | 156,188 bytes, under both the existing 400 KB audit limit and the requested 450 KB limit. |

Lighthouse used default mobile throttling against the static production preview. These are three local audit results, not a hosted-production benchmark or a speed comparison. The machine had 12 logical CPU cores and load averages of 2.45/2.68/3.09 before verification. No score came from a blank page or runtime failure. The JSON reports include the actual page screenshots and audit details.

The initial test invocation duplicated MCP's existing pool flags and failed before tests. It was corrected to the package's existing command. A palette audit also initially sampled before the last fade completed. The final audit waits beyond the complete 620ms sequence. A scheme audit initially changed the scheme without dispatching the app's scheme-change event. The final matrix dispatches that event so accent tokens agree with the scheme. These were harness corrections, not product changes.

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass. No lockfile or dependency changes. |
| `pnpm typecheck` | Pass across MCP, desktop, website. Astro has zero errors, warnings, or hints. |
| `pnpm lint` | Pass. |
| `pnpm knip` | Pass. Existing compiled-CSS configuration hint only. |
| `pnpm --filter @vstudy/website build` | Pass. 52 static pages. |
| `pnpm --filter @vstudy/website verify:static` | Pass. 2,661 internal links and fragments. Largest home payload 241,014 bytes. |
| `node scripts/check-readme-links.mjs` | Pass. 152 local links across four files. |
| `pnpm security:static` | Pass. Three existing dynamic-openExternal warnings, zero errors. |
| `pnpm --filter @vstudy/mcp test` | Pass. Existing command uses `--pool=forks --maxWorkers=2`. 130 tests pass, two skip. |
| `pnpm --filter @vstudy/desktop test --pool=forks --maxWorkers=2` | Pass. 1,396 tests pass, 14 skip. Includes contrast checks. Existing canvas warning in jsdom. |
| `node docs/evidence/website-schools-band/verify-static.mjs` | Pass. Localized static content, lookup semantics, removed controls, CSS motion fallbacks, screenshot count. |
| `node docs/evidence/website-schools-band/verify-lighthouse.mjs` | Pass. Three local mobile home runs at 100 in every category, CLS 0. |
| `node --check docs/evidence/website-trust/verify-browser.mjs` | Pass after school playback assertions were deleted. Retained provider harness was not rerun. |
| `node --check docs/evidence/website-trust/verify-controls.mjs` | Pass after school playback assertions were deleted. |
| `git diff --check` | Pass. |

QA-only Lighthouse dependencies live at `/tmp/vstudy-w4-qa`. `verify-lighthouse.mjs` accepts `QA_PACKAGE_DIR` and `WEBSITE_URL`. The browser matrix output and screenshot paths are in `browser-audit.json`. Native reduced-motion emulation, browser-level JavaScript disabling, hosted Pages, and independent review remain outside the browser checks performed here.

## Ownership and principles

The throughput checkpoint put official-source verification and baseline captures first. One delegate owned the school component and school-specific cleanup. Shared changes were serialized in the locale registry and guide renderer. The provider content and every Download file are untouched.

Model the Domain changed the school copy to a fixed three-step tuple. Subtract Before You Add removed the demo module rather than preserving a parallel implementation. Prove It Works required rendered checks and measured band bounds. Sequence Work into Verifiable Units separated the component, availability documentation, and verification evidence into commits. The deslop pass found no dependency additions, timer state, suppression comments, speculative abstraction, or unrelated home-page edits. Module headers follow the shared brief.

Dispatch ledger. Implementation and verification ran in-thread because this task is the implementation sub-agent. Independent review remains with the coordinator.
