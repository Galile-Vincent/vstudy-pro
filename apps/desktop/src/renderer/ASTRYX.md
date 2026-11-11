# Astryx in the renderer

The renderer uses Meta's Astryx design system (`@astryxdesign/core` and `@astryxdesign/theme-neutral`, both pinned to 0.7.11, with `@stylexjs/stylex` 0.19.1). Pages import Astryx components directly. The old shadcn primitives are gone.

## Styling stack

- **Prebuilt CSS only.** `style.css` imports `astryx.css`, `reset.css` and the neutral `theme.css` from `node_modules`. There is no StyleX compiler plugin and no runtime style generation, so the production CSP is unchanged.
- **Cascade layers.** `style.css` starts with `@layer reset, theme, base, astryx-base, astryx-theme, components, utilities;`. Astryx therefore beats Tailwind preflight and the app's base form rules, Tailwind utilities still apply, and unlayered app CSS beats all of it. Generic `button`, `input` and `select` rules in `style.css` exclude `[class*="astryx-"]`.
- **Theme adapter.** `astryx-theme.tsx` wraps the app in Astryx `Theme`. It watches the `dark` class on `<html>` for the mode and, after Astryx claims `data-theme` for the mode, restores the VStudy palette id there. Palette selectors (`html[data-theme=contrast]`) keep working. Provider and portal roots carry `data-astryx-theme="neutral"`.

## Tokens (`tokens.css`)

VStudy theme packs own the palette. `tokens.css` aliases Astryx color roles to them inside `[data-astryx-theme="neutral"]`, so all nine packs, custom packs and contrast adjustments reach Astryx.

| Astryx role | VStudy token |
|---|---|
| `--color-background-body/surface/card/popover` | `--background`, `--surface` |
| `--color-background-muted`, `--color-neutral`, `--color-skeleton` | `--subtle` |
| `--color-text-primary/secondary`, `--color-icon-*` | `--ink`, `--muted` |
| `--color-accent`, `--color-on-accent` | `--accent-color`, `--accent-foreground` |
| `--color-border` | `--line` |
| `--color-border-emphasized`, `--color-track` | `--line-strong` |
| `--color-overlay-hover/pressed` | 6% and 10% `--ink` mixed with transparent |

Rules that hold across the app:

- **Two border strengths.** `--line` is a quiet 10% ink mix for dividers, card edges and chrome. `--line-strong` is the pack's 3:1 boundary color (checked by `scripts/check-contrast.mjs`) and belongs on form controls, switch tracks, progress tracks and segmented controls. In high contrast, `--line` becomes `--line-strong`.
- **Flat in flow.** Resting containers have a surface tone, a 1px `--line` border and no shadow or blur. Only floating overlays (menus, popovers, dialogs, toasts) use Astryx `--shadow-med` and `--shadow-high`. Do not redefine `--shadow-low/med/high`.
- **Radius, spacing, easing.** Use the Astryx tokens directly: `--radius-inner`, `--radius-element`, `--radius-container`, `--radius-full`, `--ease-entrance`, `--ease-exit`, `--ease-move`, `--ease-standard`. App spacing is `--space-*` (Astryx spacing times `--density`), type is `--type-*`.
- **Translucent overlays.** Hover and pressed fills are translucent ink, so labels never disappear. Do not set `--color-overlay-hover` per page.
- **No literal colors in renderer CSS.** `check-contrast.mjs` and `ui:check` enforce this.

## Components

- Astryx components take required string labels, including icon-only buttons (`label`), and use `isDisabled`, `isSelected` and similar names. Add i18n keys instead of literal JSX strings.
- `components/select.tsx` adapts a `<Select><option/></Select>` children API onto Astryx `Selector`. Use it for simple pickers.
- `components/ui/` keeps only shared layout pieces: `PageContainer`, `PageHeader`, `Section`, `Toolbar`, `ListRow`, `EmptyState`, `Stat`, `FormField`, `SettingRow` and `SegmentedControl`. `EmptyState` follows the three-part contract: a short title, one hint sentence, and a verb-first next-step button that is not a retry on a non-error state.
- `components/panel.tsx` is the app's grouped section: an Astryx `Card` with a header row (heading, optional count `Badge`, actions on the right), a `Divider`, then rows on one inner edge. Rows inside a panel are separated by a straight `--line` border between siblings, never by a border on a rounded row. Pages group related content in panels with `--space-6` between them.
- Sidebar sections use `SideNavSection` and `SideNavItem`, so every group shares one heading style, 16px icons and 32px rows.

## Tests

`src/test/native-dialog.ts` is the only Vitest setup file. It polyfills `<dialog>`, the popover API, focus restoration and `ResizeObserver` for jsdom. Astryx owns Escape handling, so tests must not emulate it. Component tests that drive a picker with `fireEvent.change` mock the adapter with the native stand-in:

```ts
vi.mock('../components/select', () => import('../../test/native-select'));
```

## Verification

- `pnpm --filter @vstudy/desktop ui:check` ratchets shadows, radii, literal colors, backdrop filters and surface classes per file. Lower the baseline with `--update-baseline`, never raise it.
- `node apps/desktop/scripts/vendor-check.mjs` pins the vendored assistant-ui sources in `components/assistant-ui` and the shared UI files in `components/ui`. After editing one, re-pin it and regenerate its patch (see `docs/VENDOR_PATCHES.md`).
- `scripts/ui-shots.mjs` captures every view in light and dark and counts rendered elevation shadows, focus-ring shadows and backdrop filters (`scripts/shadow-metric.mjs`). It does not count Astryx's transparent `0px` shadow lists or hidden elements. Pass `UI_SHOTS_BASE=<earlier output>` to compare two runs, and re-run the earlier commit with the same script so both sides use one metric.
- The component gallery at `#/design` mounts in development builds, and in `electron-vite build --mode astryx-spike` for `e2e/astryx-spike.mjs`, which exercises each Astryx component under the app's tokens in all nine palettes. `e2e/astryx-integration.mjs` checks hover and pressed overlays in both schemes.
- The Astryx component reference is `pnpm --filter @vstudy/desktop exec npx @astryxdesign/cli component <Name>`.

## Still on Radix

The vendored assistant-ui elements still import `radix-ui` (Collapsible) and `class-variance-authority`. Replacing them means patching vendored files, so the dependencies stay until those elements move.
