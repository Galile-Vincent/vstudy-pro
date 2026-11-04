# Design direction (v3)

References: t3.codes, pingdotgg/t3code, assistant-ui.com. Calm, dense, typographic, tonal.

## Rules
1. No decorative borders on cards, panels, list rows, inputs or buttons. Separate surfaces by tone (`color-mix(in oklab, var(--ink) 4-6%, var(--surface))`), spacing, and type weight. Hairlines are allowed only for table rules, a sticky header over scrolling content, and focus rings.
2. Radius scale only: `--r-xs 6`, `--r-sm 8` (controls, rows), `--r-md 12` (cards, popovers), `--r-lg 16` (large panels, composer), `--r-xl 24` (hero), `--r-pill`. Nested radius = outer radius minus inset (concentric). No raw px radii.
3. Spacing from `--space-*` on a 4px grid. Group with whitespace before adding a container. Page gutters >= `--space-8` on desktop.
4. Elevation only for floating layers (popover, dialog, composer). Cards are flat.
5. Motion: `--motion-*` and `--ease-*` tokens, 120-320ms, opacity/transform only, respect reduced motion. Hover = tone shift, not outline.
6. Use assistant-ui components (`components/assistant-ui/elements/*`, `@assistant-ui/react` primitives) wherever a chat, thread list, suggestion, attachment, reasoning, sources, tool, or citation surface exists.
7. Keep every existing a11y attribute, i18n key (en, zh-Hant, ja), data-testid, and focus ring. Focus indicator stays visible.
8. Dark mode and `prefers-contrast: more` must still work (contrast mode may restore borders).
