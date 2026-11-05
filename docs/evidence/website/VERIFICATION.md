# Website verification

The goal is a clear marketing and documentation website for VStudy Pro, with measured design decisions, an accessible download path, and accurate app guides.

## Artifact

The static Astro package is apps/website, named @vstudy/website. It builds 49 HTML pages and three search indexes. The root and /en/ are English home pages. Traditional Chinese and Japanese have complete home, Getting started, and Connect your school translations. The other 13 guides per translated locale retain English article language and a visible fallback notice.

All 15 English guides are present. They cover installation, schools, coursework, planning, reading, providers, themes, history, Moodle content views, storage, privacy, keyboard shortcuts, troubleshooting, architecture, and development.

Language, Guide, and Section records own routes, navigation, TOC entries, section-level search, and previous/next links. config.ts owns the GitHub repository and latest-release URL and imports desktop version 0.1.0. There is no invented DMG URL.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Static build | 49 pages | build.txt |
| Home Lighthouse | 100 performance, 100 accessibility, 100 best practices, 100 SEO | lighthouse-home.json |
| Getting started Lighthouse | 100 performance, 100 accessibility, 100 best practices, 100 SEO | lighthouse-docs.json |
| Layout shift | 0 on both Lighthouse pages | Same reports |
| axe | Zero violations in 196 page/theme/width cases | browser-audit.json |
| Theme packs | Zero violations in 18 pack/scheme cases | theme-audit.json |
| Responsive layout | No horizontal scroll in 490 total cases over 390, 768, 1024, 1440, and 1920px | browser-audit.json and responsive.json |
| Internal links and anchors | 1,947 checked, zero failures | static-audit.txt |
| Home bytes | 146,583 maximum, below 1,500,000 budget | static-audit.txt |
| External browser requests | None in audited pages | browser-audit.json |
| Root typecheck | Pass, website has zero diagnostics | typecheck.txt |
| Root lint | Pass | lint.txt |
| Knip | Pass, one existing desktop CSS hint | knip.txt |
| Security static check | Pass, no unreviewed advisories; three existing Electron lint warnings | security.txt |
| Desktop tests | 989 pass, 14 skip, 130 passing files | desktop-tests.txt |
| Frozen install | Pass | install.txt |
| Alternate base | Root-path build and generated links pass | root-base-build.txt |
| Impeccable detector | Empty findings array | design-detector.json |
| Desktop preservation | No changed desktop files or importer; all baseline package and snapshot entries preserved | lock-preservation.json |

Lighthouse 13.6.0 ran against the production static preview in fresh headless Chrome sessions with the default mobile simulated throttling. The reports are one final run per page. They establish a local acceptance result, not hosted latency or a speed comparison. The preview browser was closed before Lighthouse. The machine reported 12 cores and approximately 1.6 load before measurement. Reports contain no runtime error.

The browser matrix used the T3 preview tools and axe-core from the repository's installed @axe-core/playwright package. The audit waited for finite entrance animation completion before checking contrast. Initial code-block keyboard failures and their correction are retained in fixed-accessibility-findings.json. The final matrix contains no unresolved axe finding.

## Interaction checks

- Command+K opens docs search and focuses the input.
- A backup query finds nine section links.
- Tab reaches a result with a visible 3px focus ring.
- Escape closes search and restores focus to its trigger.
- A failed index request shows recovery guidance. Closing and reopening retries successfully.
- A missing query shows the no-results message.
- Copying a command announces Copied.
- Switching to Japanese preserves the development slug, sets html lang to ja, keeps the untranslated article lang as en, and shows the Japanese notice.
- The skip link focuses main.
- A manual scheme choice survives navigation.
- Theme choices update full palette roles and retain their pressed state.
- The current Astro 7 preview command serves the final build with correct base links.

## Commands

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm --filter @vstudy/website build
pnpm --filter @vstudy/website verify:static
pnpm --filter @vstudy/website preview --host 127.0.0.1 --port 4321
pnpm typecheck
pnpm lint
pnpm knip
pnpm security:static
pnpm test --pool=forks --maxWorkers=2
BASE_PATH=/ pnpm --filter @vstudy/website exec astro build --outDir /tmp/vstudy-website-root-build
```

Lighthouse was installed in /tmp/vstudy-website-qa, outside the repository. The command used its local binary.

```sh
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  /tmp/vstudy-website-qa/node_modules/.bin/lighthouse \
  http://127.0.0.1:4321/vstudy-pro/en/ \
  --chrome-flags='--headless --disable-gpu --no-sandbox' \
  --only-categories=performance,accessibility,best-practices,seo \
  --output=json --output-path=docs/evidence/website/lighthouse-home.json --quiet
```

The docs run substitutes /en/docs/getting-started/ and lighthouse-docs.json.

## Evidence and limits

screenshot-manifest.json names all 196 page captures. screenshots/ has those PNGs and 20 scrolled home captures. references/ contains both sites at 390px and 1440px in both preferences, plus docs captures and measured DOM/CSS. hero-comparison.png places the three heroes side by side. PNGs stay local under the repository's pre-existing evidence ignore rule. The manifest and JSON checks are committed.

The Pages workflow is prepared but has not run on GitHub. No code was pushed and no repository setting changed. The owner must enable Pages through GitHub Actions before deployment. The repository remains private, so release access requires GitHub authorization.

Reduced-motion CSS is present and audited. Runtime reduced-motion emulation and a manual screen-reader pass were not available through the T3 browser API. A parent review is still appropriate before publication. All browser tabs and the preview server were closed.

Shared files touched are package.json, pnpm-lock.yaml, pnpm-workspace.yaml, knip.json, .gitignore, and .github/workflows/pages.yml. apps/desktop is unchanged.
