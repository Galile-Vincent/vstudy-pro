# Branding implementation evidence

The goal is to carry the owner's butterfly into the app and website, keep every header borderless while scrolling, and give the website a brief, restrained arrival.

## Decisions and data

- `assets/brand/originals/` matches the supplied pack byte for byte. All nine SVGs reject scripts, external references, raster images, and unsafe XML before SVGO 4.1.0 optimization. Render comparisons have mean channel error below .011 on a 0 to 255 scale. See `assets/brand/generated/validation.json`.
- macOS has an 824px icon body centered on a transparent 1024px canvas. The supplied rounded corners scale to about 182px. A diffuse 12px shadow sits below the body. A comparison against Apple Notes exposed a hard contact edge, which was removed. `icons/macos-comparison.png` shows the final geometry. `icons/finder-icon.png` uses NSWorkspace's actual Finder icon service on the packaged app.
- Windows ICO contains 16, 24, 32, 48, 64, 128, and 256px PNG entries. Linux has 16 to 1024px PNGs. ICO entry dimensions and PNG payloads agree. The DMG has its own background and volume icon.
- `Flight` contains four cubic control points, size, opacity, delay, and a settlement flag. `Point` and `Rect` hold viewport geometry. `butterfly-model.ts` owns this data. The four desktop butterflies become three on small or lower-power devices.
- Three direction studies each have twelve frames in both schemes. The wide arc gives the copy the most space. The ribbon clusters toward the center. The orbit sweeps too steeply. `motion/compare.html` switches between the studies. `website/live-flight/` contains separate live browser frames.
- The onboarding lockup is static and sits in the fixed top row. A second visual pass moved it out of the scrollable body. The Welcome lockup has its own row. A prior shortcut opacity reduction failed axe in light mode, so it was removed.

Build the Lever produced `scripts/make-brand.mjs` and the rerunnable checks. Model the Domain shaped the typed flight model. Prove It Works required real app captures, production browser checks, and package extraction.

## Commands and results

| Command | Result |
| --- | --- |
| `pnpm brand` | Pass. Nine validated and render-compared SVGs, platform icons, favicon, manifest icons, OG image, and DMG background. |
| `node scripts/check-brand.mjs` | Pass. Icon body, transparent margin, shadow alpha, ICO dimensions, cubic endpoints, protected text, finite lifecycle, five widths, three directions. |
| `node scripts/brand-motion-study.mjs` | Pass. 72 deterministic prototype frames and six contact sheets. |
| `pnpm typecheck` | Pass. Desktop TypeScript and 31 Astro files. |
| `pnpm lint` | Pass. Desktop ESLint and Astro check. |
| `pnpm knip` | Pass. One existing CSS configuration hint. |
| `pnpm vendor:check` | Pass. 55 vendor sources and one application file match reviewed hashes. |
| `pnpm security:static` | Pass against the repository's reviewed dependency baseline. Three existing security-lint warnings, zero errors. |
| `pnpm --filter @vstudy/desktop contrast:check` | Pass. Nine theme packs, both schemes, every contrast setting. |
| `pnpm test --pool=forks --maxWorkers=2` | Pass. 134 files and 1,026 tests. Five files and 14 tests skipped. |
| `pnpm build` | Pass. Production Electron output. |
| `pnpm --filter @vstudy/website build` | Pass. 49 pages. |
| `pnpm --filter @vstudy/website verify:static` | Pass. 2,418 links. Home images total 156,188 bytes. Largest home payload 248,777 bytes. |
| `node scripts/check-readme-links.mjs` | Pass. 134 local Markdown links. |
| `pnpm --filter @vstudy/desktop exec node e2e/brand.mjs` | Pass. 82 app screenshots. Three packs, both schemes, three languages. Minimum, default, and wide windows. Minimum width uses 125 percent scale. Headers have no border, shadow, or after pseudo-element before and after scroll. Nine recorded axe audits have zero violations. |
| `BRAND_EXTRA_ONLY=1 pnpm --filter @vstudy/desktop exec node e2e/brand.mjs` | Pass. Final onboarding placement and settings header. Zero onboarding axe violations. |
| `pnpm --filter @vstudy/desktop exec node e2e/website-brand.mjs` | Pass. Session, replay, replay after scroll, reduced motion, hidden-tab pause, arrival after opening a background tab, desktop and mobile counts, and docs exclusion. Twelve WCAG audits have zero violations. Uses installed Chrome; no new browser download. |
| T3 preview checks | Pass. All three languages at 390, 768, 1024, 1440, and 1920px in both schemes. No horizontal overflow or missing brand images. Live frames show the final fade to a hidden layer. |
| Lighthouse 13.6.0, production preview | Mobile and desktop summaries are in `lighthouse-summary.json`. Full audit JSON is retained. These are acceptance samples, not a measured regression comparison. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @vstudy/desktop exec electron-builder --mac dmg dir --publish never -c.mac.notarize=false -c.mac.identity=null` | Pass. Unsigned distribution build with an ad-hoc local signature. |
| `codesign --verify --deep --strict 'apps/desktop/release/mac-arm64/VStudy Pro.app'` | Pass. |
| Info.plist and mounted DMG inspection | Pass. CFBundleIconFile is icon.icns. Generated, packaged, DMG-app, and DMG-volume ICNS files match. The generated DMG background is present. |

`app/verification.txt`, `app/results.json`, `website/behavior-results.json`, `responsive.json`, and the command transcripts preserve the results. Screenshots use curated local samples and no live school or AI account.

## Before and after

- `before/chrome-vstudy-light-home-1440.png` and `app/vstudy-light-en-home.png` show the app brand change.
- `before/website-light.png` and `website/en-light-390-verified.png` show the website mark.
- `app/vstudy-dark-en-welcome.png` and `app/onboarding.png` show the transparent dark lockup and final welcome placement.
- `app/vstudy-light-en-home-scrolled.png`, `app/settings.png`, and `website/header-scrolled-light.png` show the borderless bars.
- `icons/macos-comparison.png` compares the packaged ICNS with Apple Notes at the same scale.
- `motion/*-sequence.png` records the prototype comparison. `website/live-flight/` has twelve actual browser captures per scheme.

Representative images are committed despite the repository's screenshot ignore rule. Full local matrices and live frame captures remain under this directory and can be regenerated with the commands above.

## Limits and integration

Windows and Linux icons are generated and structurally checked, but their native packages and taskbar appearance cannot be tested on this macOS host. The macOS artifact is not Developer ID signed or notarized. Its security fuses intentionally disable debugger attachment. A Playwright attempt against that hardened binary could not attach; the production-output app matrix uses the normal Electron test executable. No fuse or sandbox setting was relaxed. The package's icons, signature, Finder rendering, and DMG contents were checked directly.

No PR was opened or merged. Independent review remains with the coordinating agent. Download components and shared IPC, locales, and theme tokens were not changed. Integration touches root `package.json`, `pnpm-lock.yaml`, `knip.json`, desktop `package.json`, main window icon configuration, the affected renderer views and chrome CSS, website Base, Logo, Home, hero styles, and the three README headers.
