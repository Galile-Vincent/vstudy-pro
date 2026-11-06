# VStudy Pro website

Static Astro marketing and documentation site. No server runtime, analytics, external fonts, or hosted search.

Run from the repository root.

```sh
pnpm --filter @vstudy/website build
pnpm --filter @vstudy/website verify:static
pnpm --filter @vstudy/website preview
```

The default path is /vstudy-pro/. Set BASE_PATH=/ for root hosting. SITE_URL sets the canonical origin. GitHub Pages uses .github/workflows/pages.yml. Deployment needs the repository owner to enable Pages with GitHub Actions. No settings are changed by building.

src/config.ts owns repository and release URLs and reads the desktop version. src/data/docs.ts owns guide navigation and content. src/data/translations.ts supplies the two translated guides, and src/data/ui.ts owns home and interface copy. Untranslated articles show an explicit notice and mark the article language as English.

src/styles/tokens.css owns the design system. Radius nesting subtracts the inset from the outer radius. Imported app palettes provide the theme preview. The blocking head script applies the color scheme before paint. Reduced motion disables transitions, smooth scrolling, and the single hero entrance.

astro check supplies both lint diagnostics and type checking for .astro and TypeScript files. Scoped pnpm overrides pin its language server because the newer version fails to load its WASM dependency on this machine. Two checker-only overrides keep its YAML parser and Lodash dependencies patched. Root lint and typecheck include this package. Knip discovers Astro entries and explicitly includes the static audit script.

scripts/verify-static.mjs checks built internal links and fragments, media dimensions, language markers, one h1 per page, skip links, and the complete home asset budget. Browser evidence and design measurements live in ../../docs/evidence/website and ../../docs/WEBSITE_DESIGN_NOTES.md.

Marketing captures live in src/assets/shots. Run `pnpm build` and `node apps/desktop/scripts/marketing-shots.mjs` from the repository root to regenerate them. The pipeline reuses the desktop Courses fixture and a disposable profile. See ../../docs/assets/readme/README.md for filters and provenance. Astro produces smaller WebP derivatives, keeps explicit dimensions, and lazy-loads images below the hero. The static audit limits the home page to 400,000 image bytes. Theme buttons swap real light and dark captures.
