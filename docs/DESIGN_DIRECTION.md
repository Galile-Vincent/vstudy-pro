# Design direction (v3)

References: t3.codes, pingdotgg/t3code, assistant-ui.com. Calm, dense, typographic, tonal.

## Rules
1. No decorative borders on cards, panels, list rows, inputs or buttons. Separate surfaces by tone (`color-mix(in oklab, var(--ink) 4-6%, var(--surface))`), spacing, and type weight. A 1px card ring is allowed. Hairlines are allowed only for table rules, a sticky header over scrolling content, and focus rings.
2. Radius scale only: `--r-xs 6`, `--r-sm 8` (controls, rows), `--r-md 12` (cards, popovers), `--r-lg 16` (large panels, composer), `--r-xl 24` (hero), `--r-pill`. Nested radius = outer radius minus inset (concentric). No raw px radii.
3. Spacing from `--space-*` on a 4px grid. Group with whitespace before adding a container. Page gutters >= `--space-8` on desktop.
4. Use two shadow tiers. Resting surfaces use a 1px ring plus a centered 2px edge. Floating layers (popover, dialog, composer) use a ring plus a centered 12px blur. Shadows never have an offset.
5. Motion: `--motion-*` and `--ease-*` tokens, 120-320ms, opacity/transform only, respect reduced motion. Hover = tone shift, not outline.
6. Use assistant-ui components (`components/assistant-ui/elements/*`, `@assistant-ui/react` primitives) wherever a chat, thread list, suggestion, attachment, reasoning, sources, tool, or citation surface exists.
7. Keep every existing a11y attribute, i18n key (en, zh-Hant, ja), data-testid, and focus ring. Focus indicator stays visible.
8. Dark mode and `prefers-contrast: more` must still work (contrast mode may restore borders).

## Themes

Appearance separates a color scheme from a theme pack. System follows the operating system. Light and Dark override it. Every pack has both variants. VStudy, Ocean, Grove, Ember, Iris, Rose, Slate, Paper, and High contrast ship with the app. The scheme cards preview the selected pack. Each theme card previews its light and dark palettes with two orbs.

`apps/desktop/src/shared/themes/index.ts` owns the version 1 `ThemePack` schema, built-in registry, contrast calculations, and import validation. A pack contains `id`, `name`, `light`, `dark`, and `orbs`. Each variant requires all 31 tokens below. Every color is an opaque six-digit hex value. Imported JSON cannot contain CSS expressions, URLs, scripts, unknown fields, or built-in IDs. Imports have a 32 KB limit. Settings allow up to 30 custom packs with unique IDs. Export assigns a custom ID so a built-in pack can be shared and imported without replacing the original.

`themeId`, `colorScheme`, `contrast`, `glassOpacity`, and `customThemes` persist in the existing SQLite settings record. Zod supplies defaults for old records. Unknown or removed theme IDs resolve to VStudy. The legacy `accent` field remains readable for old settings and callers. Theme packs now own the accent color.

The renderer validates its local appearance cache synchronously, then loads authoritative settings before mounting React. It hides content until initialization finishes. The native window uses the same saved background before it opens. `apply-appearance.ts` sets CSS properties, the resolved `data-scheme`, and the Tailwind `dark` class on `documentElement`. System changes reapply the selected variant. Main updates `nativeTheme.themeSource`, the window background, and vibrancy. Solid material and reduced-transparency preferences override glass.

Contrast ranges from 100% to 150%. The baseline meets WCAG AA. Increasing contrast strengthens text, boundaries, and focus indicators without changing surface hues. Glass opacity ranges from 50% to 100%. The editor previews both variants across the app and reports AA warnings. The editor controls retain a validated built-in palette so poor draft colors cannot hide the controls or warnings. Cancel restores the saved appearance. Custom colors can fail AA, so warnings remain visible while authoring.

### Token reference

Theme keys map to CSS properties of the same name. `sidebar` maps to `--sidebar-surface` because `--sidebar` is the existing component alias. Components derive hover, pressed, translucent, and disabled treatments from these tokens. Add color roles here instead of adding fixed CSS colors.

| Theme token | Use |
| --- | --- |
| `background` | App canvas and native window background |
| `surface` | Cards, controls, and popovers |
| `sidebar` | Sidebar background |
| `subtle` | Secondary panels and tonal groups |
| `active` | Active rows and selected controls |
| `ink`, `muted` | Primary and secondary text |
| `line` | Control boundaries |
| `accent-color`, `accent-foreground` | Primary action and text on that action |
| `selection-color` | Text selection background |
| `focus` | Keyboard focus indicator |
| `danger`, `success`, `warning`, `info` | Semantic status colors |
| `chart-1` through `chart-5` | Chart series and legends |
| `glass-tint` | Translucent layer color |
| `shadow-color` | Source color for elevation and overlays |
| `reader-background`, `reader-ink` | Reading canvas and document text |
| `code-background` | Code block background |
| `syntax-keyword`, `syntax-string`, `syntax-number` | Code syntax colors |
| `course-start`, `course-end` | Generated course cover gradient |

`--material-card` and `--material-sheet` derive from `glass-tint` and `--glass-opacity`. `--elevation-raised`, `--elevation-floating`, and the shadow aliases derive from `shadow-color`. Folder colors derive from status tokens. Component aliases such as `--primary`, `--foreground`, and `--sidebar` resolve to the same semantic colors. Branding in provider SVG logos and document images retains its source colors.

`pnpm --filter @vstudy/desktop contrast:check` checks every pack and scheme at every contrast step. It checks text at 4.5:1 and control boundaries, focus indicators, and chart colors at 3:1. It also audits every renderer CSS file for fixed colors, old numbered palette tokens, and direct OS color-scheme overrides. `pnpm test` runs this check before Vitest, so CI test runs fail on regressions.

`node e2e/themes.mjs` from `apps/desktop` runs one production Electron instance and closes it afterward. It captures four packs in both schemes across Library, Courses, Reader and Chat, and Appearance. It checks the editor, JSON validation, keyboard interaction, persistence, native scheme, and Appearance accessibility. Courses use deterministic Moodle fixtures. Evidence is in `docs/evidence/themes/`.

## Component library

A routed page renders exactly one main, except Library where the shell provides it.

An `interactive` Card is one whole-card action. Its content must be text only: no headings, nested buttons, or links.

Shared components live in `apps/desktop/src/renderer/components/ui` and export from its index. Pages compose Card, PageHeader, Section, Toolbar, ListRow, EmptyState, Stat, FormField and segmented tabs. PageContainer owns desktop gutters and the content measure. Pages do not restyle cards or create feature card, panel or tile classes. Row actions stay outside the row button. FormField supplies control attributes through its child function. Spread those attributes onto the labeled control.

Add a component when multiple pages repeat the same structure. Keep its API small. Use theme, spacing, radius and type tokens. Supply visible copy from the caller. Add behavior tests and a gallery example. Update the reviewed vendor manifest for library changes. Existing pages migrate in separate changes.

Run `pnpm dev` and open `#/design` in development. The gallery controls scheme, theme pack, material and contrast without saving settings. Production excludes this route and its code.

Run `pnpm --filter @vstudy/desktop ui:check` or desktop lint. The ratchet scans CSS and TSX outside the shared libraries and tokens. It rejects increases in fixed shadows, pixel radii, hex or RGB colors, untokenized backdrop filters and feature surface classes. Token shadows, none and simple focus rings are allowed. Run `pnpm --filter @vstudy/desktop ui:check --update-baseline` after removing violations. Updates refuse increases. Run `pnpm --filter @vstudy/desktop ui:test` for the fixture tests.
