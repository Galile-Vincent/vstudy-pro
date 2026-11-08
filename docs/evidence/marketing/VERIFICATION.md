# Marketing refresh verification

Base: `6ee5617d`. No production desktop behavior was changed.

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed |
| `pnpm build` | Passed; existing bundle-size and static/dynamic import warnings |
| Complete marketing capture pipeline | Passed: 306 captures, 17 views, nine palettes, two modes, zero renderer errors |
| Filtered figures/original/usage reshoot | Passed: 54 replacements; explicit chat readiness, decoded images, no error alerts |
| Export audit | 646 WebP/AVIF files at 2880 × 1800; zero orphans; largest WebP 193,548 B, AVIF 120,579 B; total 62,552,224 B |
| Visual review | All 18 palette/scheme sheets opened; 54 final replacement views reviewed separately; representative originals inspected at larger size |
| `pnpm typecheck` | Passed for MCP, desktop, website, newsletter |
| Website `pnpm typecheck` | 48 files; zero errors, warnings, hints |
| Website `pnpm build` | 64 static pages |
| Website `node scripts/verify-static.mjs` | 64 pages, 3,664 links, zero failures; largest home images 208,148 B / 400,000 B budget; largest home assets 300,316 B / 1,500,000 B budget |
| Website `node scripts/verify-downloads.mjs` | 17 platform cases and three localized download routes passed |
| ESLint marketing scripts | Passed |
| `node scripts/check-readme-links.mjs` | 155 local links across four files passed |
| `git diff --check` | Passed |
| Built-site browser check | 18 routes: en/zh-Hant/ja home, reading, themes, usage, AI providers, school connection; HTTP 200, no broken images, no page errors, no horizontal overflow |

Browser evidence: `site/checks.json`; ignored screenshots in `site/`. Shared-preview DOM checks succeeded, but its screenshot tool timed out twice. Isolated local Playwright/Chrome supplied the visual checks. The first local attempt lacked Playwright's bundled browser; the available Chrome channel succeeded.

Earlier capture attempts exposed stale-date planner validation, obsolete selectors, an obscuring memory consent card, a graph-fixture drawing mistake, and transient chat loading. They were fixed and reshot. Seeding usage initially omitted required SQLite cache counters; explicit zeros fixed the fixture and the final reshoot passed. No failed capture was accepted.

No live school/provider integration or Office preview behavior was tested. All published images use synthetic fixture content in the real app. Connect AI deliberately shows its normal initial Install step. `public/og.png` is brand-only. Unrelated existing English-fallback reference guides were not fully translated; all newly documented features and customization text are provided in all three languages.
