# Astryx API fit spike

The owner wants a calmer VStudy Pro UI without the current heavy shadows and competing layouts. This spike verifies the dependency, styling and runtime boundary before page migration. No application pages or existing UI implementations were migrated.

## Recommendation

Proceed with Astryx, but migrate callers directly for behavioral components. Keep thin facades only for badge, progress, separator and skeleton. The existing API exposes Radix context, Slot composition, uncontrolled state, button refs and native input events that Astryx does not preserve. Recreating those APIs would add a second component framework. The sidebar and dialog migrations need dedicated runtime checks.

## Version and theme

Pinned core and theme-neutral to 0.7.11. StyleX is pinned to 0.19.1. Imports use theme-neutral/built and its precompiled theme.css, not defineTheme or a runtime StyleX compiler. pnpm skipped the optional core install script; the prebuilt package still built and ran.

Neutral is the best baseline for this spike. Its restrained gray treatment adds fewer palette assumptions to the nine existing app themes. Matcha also fits a calm study app, but would privilege green over the existing palette choices. Stone adds more visual character. Butter, Chocolate, Gothic and Y2K introduce stronger accent or typography choices. Probe is an unpublished test fixture. Those descriptions were read from packages/themes in the reference clone.

The reference clone is 0.7.12. Installed 0.7.11 dist declarations and implementation are authoritative for this report; reference source was read only, and no reference scripts were executed.

## Cascade and appearance

style.css establishes reset, theme, base, astryx-base, astryx-theme, components, utilities in that order before importing any CSS. This gives Astryx precedence over Tailwind preflight and legacy base form rules, while utilities remain available. App unlayered CSS still wins. Legacy generic button/input selectors exclude Astryx stable classes. No compiler plugin or CSS copied into renderer source is needed.

tokens.css maps body/surface/card/popover/muted backgrounds, text, icons, accent/on-accent, border, overlay, interaction fills, status foregrounds and UI fonts to VStudy semantic variables. The provider and HTML portal root both receive these aliases. All nine themes therefore update through applyTheme, including custom/contrast-adjusted values. Shadows low/med/high are disabled for this flat preview. Astryx radius, spacing and typography scales remain intact.

AstryxTheme observes the root dark class and supplies an explicit light/dark mode. Its layout effect restores the app-owned data-theme palette ID after Astryx uses that attribute for mode. data-astryx-theme remains neutral for provider and portal CSS. This is an adapter requirement, not a change to the app theme schema. Runtime verifies that data-theme remains the palette ID and wrapper color-scheme follows both modes.

Remaining gaps include Astryx status-muted/on-status combinations, categorical/chart colors, syntax colors, focus/inset rings, spacing/density, radius, field-specific tokens and animations. These retain Neutral defaults. Existing contrast checks validate VStudy tokens, not every Astryx rendered state or imported vendor literal. Before migration, add computed contrast checks for every enabled/disabled/error/focus state and theme, including forced colors. useTheme token resolution uses the built Neutral object and does not know the CSS alias values; canvas/data-visualization consumers need a deliberate adapter. This spike validates CSS components only.

## API comparison

Counts below count matching renderer files, including tests and implementation self-imports, using `grep -rl "components/ui/<name>" apps/desktop/src/renderer | wc -l`. They are literal prefix counts, not an AST usage count. Barrel imports, relative imports and symbols re-exported through components/ui/index.ts are omitted. The toggle count also includes any toggle-group prefix match. There are more files in ui than these 22 requested modules.

| Existing file | Caller files | Astryx equivalent | Prop and behavior differences | Recommendation |
| --- | ---: | --- | --- | --- |
| avatar.tsx | 1 | Avatar, AvatarGroup, AvatarStatusDot | Image and fallback children become src, fallbackSrc, name and status props. Sizes default/sm/lg become md/sm/lg. Initials and tooltip are built in. Arbitrary fallback JSX and delayed Radix image mounting do not map. | (b) Few direct consumers. Move their image/fallback data into explicit props rather than clone children in a facade. |
| badge.tsx | 2 | Badge | children becomes required label. default/secondary/outline/ghost/link/destructive variants need semantic neutral/accent/error choices. No Radix Slot asChild replacement. | (a) A label and variant adapter is small. Audit asChild usage before keeping it. |
| button.tsx | 72 | Button, IconButton, Link | Required string label, default secondary, primary instead of default, isDisabled instead of disabled, sm/md/lg instead of xs/default/icon sizes. onClick remains; clickAction adds async pending state. href/as replaces Slot asChild. Disabled buttons use aria-disabled, not native disabled, which affects form submission and tests. | (b) 72 direct import files plus barrel consumers make a facade tempting, but the old API cannot infer names for icon children or preserve arbitrary Slot composition thinly. Migrate in bounded caller groups with explicit labels and disabled semantics. |
| card.tsx | 1 | Card, ClickableCard, Layout | Existing discriminated interactive button/link Card and CardHeader/Title/Description/Content/Footer/Action slots differ from the static Astryx Card and dedicated ClickableCard. Existing flat/raised appearance has no direct prop translation. | (b) Choose Card or ClickableCard explicitly and compose Layout slots. Do not preserve a second layout system through seven adapters. |
| checkbox.tsx | 2 | CheckboxInput | checked/defaultChecked/onCheckedChange become controlled value/onChange. value accepts boolean or indeterminate; htmlName replaces name; label is required and can be hidden. Ref changes from Radix button to native input. | (b) Move callers so form refs and labeling stay explicit; a facade cannot preserve the button ref contract. |
| command.tsx | 1 | CommandPalette, PowerSearch | cmdk root/input/list/group/item compound API becomes controlled isOpen/onOpenChange and searchSource/renderItem. Filtering, empty states, async results and selection belong to the search source, not cmdk DOM registration. | (b) Rebuild the command consumer around search data. A cmdk-compatible facade would be a second command engine. |
| dialog.tsx | 21 | Dialog, DialogHeader, Layout | Radix Root open/defaultOpen, Trigger, Portal, Overlay, Content, Close, Title and Description become isOpen/onOpenChange plus native dialog and header/layout composition. Native top-layer modal behavior replaces z-index portals. Focus, dismissal and trigger return need per-consumer checks. | (b) Explicitly migrate each dialog. Retaining all Radix children and event hooks would exceed a thin facade. |
| dropdown-menu.tsx | 6 | DropdownMenu and its item/submenu/checkbox/radio components | Root/Trigger/Content become button or renderTrigger plus items or compound children. open becomes isMenuOpen, side becomes placement, disabled becomes isDisabled, selection handlers use onClick rather than Radix onSelect. Trigger render props must all be spread. Popover and optional bottom-sheet presentation differ from Radix portals. | (b) Move each menu to the data API or Astryx compounds. Preserve prevent-close and checkbox/radio behavior deliberately. |
| input.tsx | 11 | TextInput | Native event onChange becomes onChange(value,event). Requires controlled value and label, with isLabelHidden available. disabled/readOnly/required/autoFocus/name become isDisabled/isReadOnly/isRequired/hasAutoFocus/htmlName. Root styling is a field wrapper rather than bare input. Not all HTML input types are supported. | (b) Migrate call sites and FormField usage together. A native-input facade cannot infer a label or maintain wrapper/ref styling reliably. |
| popover.tsx | 8 | Popover, usePopover | Root/Trigger/Content/Anchor become content and child render function or anchorRef. open becomes isOpen; side/align become placement/alignment. Native popover/top-layer dismissal replaces Radix portal behavior. | (b) Move consumers to explicit trigger refs/content. Do not emulate Radix context registration. |
| progress.tsx | 7 | ProgressBar | value/max transfer. Null value maps to isIndeterminate; label is required and isLabelHidden hides it. Astryx owns indicator rendering instead of the existing transform and Radix indicator. | (a) Translate numeric props and indeterminate state, and require an accessible name from callers. Keep existing className behavior only where it styles the outer root. |
| select.tsx | 4 | Selector | Radix Root/Trigger/Value/Content/Item composition becomes options with id/label, value/onChange, and required label. Nullable selection is a separate typed contract. No direct SelectScrollUpButton/DownButton or item Slot API. | (b) Convert options at the caller rather than parse JSX children in a facade. |
| separator.tsx | 1 | Divider | orientation transfers. Existing Radix decorative defaults true; Astryx always renders role separator. Astryx adds label, subtle/emphasized variants and full-bleed behavior. | (a) Map decorative to aria-hidden and preserve orientation. Verify assistive-technology output because the role cannot simply be overridden. |
| sheet.tsx | 2 | Drawer, BottomSheet, Dialog | Radix Dialog with four side positions becomes Drawer side start/end for lateral panels or BottomSheet for bottom placement. Controlled isOpen/onOpenChange and required label replace trigger/close compound context. Top sheets need a custom layout decision. | (b) Choose the correct component per caller. Do not preserve an unsupported four-sided sheet abstraction. |
| sidebar.tsx | 2 | SideNav, SideNavSection, SideNavItem, AppShell, MobileNav | 727-line module owns provider state, cookie persistence, keyboard shortcut, mobile Sheet, rail, inset, menu actions, submenus and tooltips. Astryx SideNav supplies sections, selection, resizable/collapsible config and row actions, while AppShell/MobileNav own responsive composition. No drop-in useSidebar context. | (b) Rebuild the shell boundary in a later task. Keep app navigation/persistence separately owned; do not wrap Astryx in the old shell machinery. |
| skeleton.tsx | 4 | Skeleton | className/style transfer. Astryx adds explicit width/height, token radius and stagger index; existing div uses Tailwind pulse and arbitrary dimensions. Astryx handles its own animation. | (a) A root prop adapter can preserve callers without duplicating selection or layout logic. |
| switch.tsx | 6 | Switch | checked/defaultChecked/onCheckedChange become controlled value/onChange. Required label, optional hidden label. disabled/name become isDisabled/htmlName. sm/default become sm/md. Ref changes from Radix button to input. | (b) Migrate settings callers to the labeled field and native input contract. |
| tabs.tsx | 3 | TabList, Tab | Root defaultValue/onValueChange and panels become value/onChange on TabList. Set role tablist explicitly; default is navigation. Each Tab needs label/value/panelId. Caller supplies panel IDs, aria-labelledby, visibility and mount behavior; no TabsContent export. | (b) Keep panel ownership at the consumer. Do not silently replace tabs with the radio-based SegmentedControl. |
| textarea.tsx | 5 | TextArea | Bare native textarea becomes labeled controlled field; onChange(value,event), isDisabled/isReadOnly/isRequired/htmlName and status replace native props and external error markup. Existing className may target the wrong wrapper. | (b) Migrate field state and labels with each caller. Keep event and ref expectations explicit. |
| toggle-group.tsx | 0 | ToggleButtonGroup, ToggleButton | Single/multiple selection exists. value/onValueChange become value/onChange; empty single selection changes from empty string to null. Controlled values and label required. Group spacing and outline variants need a new visual choice. SegmentedControl is radio-based and must retain one selection. | (b) Use ToggleButtonGroup when deselection/multiple selection matters. Convert the barrel-only gallery consumers too. |
| toggle.tsx | 2 | ToggleButton | pressed/defaultPressed/onPressedChange become controlled isPressed/onPressedChange. label required; disabled becomes isDisabled. Icon-only support and async pressedChangeAction are built in. Existing outline/default variants need review. | (b) Name each toggle explicitly and adopt controlled state; no benefit in a facade for two direct import files. |
| tooltip.tsx | 13 | Tooltip | Provider/Root/Trigger/Content become content plus child or anchorRef. delayDuration becomes delay, side/align become placement/alignment, open becomes isOpen. Supports focus and touch triggers. No provider-wide Radix skip-delay contract or separately styled arrow child. | (b) Migrate composition at callers and set intentional delay/focus behavior. A provider facade would retain undocumented timing assumptions. |

## Gates and minimal fixes

| Gate | Result and evidence | Minimal fix or limitation |
| --- | --- | --- |
| pnpm install | Passed before source inspection. | Install added core/theme/StyleX. No dependency scripts enabled. |
| check-contrast | Passed. `49 renderer CSS files use semantic theme tokens`. | Import vendor CSS from node_modules. Copying generated CSS into renderer would fail the fixed-color audit. No gate exemption added. |
| ui:check | Passed. `UI ratchet passed` with color 0. | Use semantic aliases and existing utility spacing. No baseline update. Imported vendor CSS is outside the source scan. |
| vendor-check | Passed. `55 vendor sources and 13 application files match reviewed hashes`. | New gallery/adapter live outside reviewed vendor directories. No manifest hashes changed. A later facade migration must review and update hashes. |
| pnpm typecheck | Passed for MCP, desktop, website and newsletter. Website reported 0 errors/warnings/hints. | Installed package types work under React 19 without type casts. |
| desktop ESLint | Passed. | Initial new-gallery literal JSX strings failed no-literal-string. Moved them to a copy object, matching the existing development gallery. No lint disable. |
| security-lint | Passed with 0 errors, 3 pre-existing dynamic shell.openExternal warnings in main/ipc/index.ts, main/moodle/sso-protocol.ts and main/moodle/webview.ts. | Run through `pnpm --filter @vstudy/desktop exec node scripts/security-lint.mjs`; direct root invocation fails to find src/main because the script expects desktop cwd. |
| security-audit | Passed. `failures: []`; existing accepted audit totals are 1 low, 4 moderate, 12 high, 1 critical. | New dependencies must use exact versions. The default caret from pnpm add for StyleX was replaced with 0.19.1. No audit exceptions changed. |
| focused Vitest | 5 files, 31 tests passed, maxWorkers=2. | Covers tokens, foundation, segmented control, setting row and security. |
| built Electron runtime | Passed. Eight components exercised. 18 palette/mode aliases checked. No page/CSP errors. | Build with explicit astryx-spike mode. Default release build excludes gallery. |

CSP is not declared by renderer/index.html. The production policy is served by src/main/security.ts and the app protocol response handler. It allows self scripts, self and inline styles, and no connect requests. Prebuilt StyleX needs no eval, remote fonts or network connection. The existing policy was not relaxed. The successful runtime loads the built file URL. Its reloaded document response reports the production CSP header, asserted by the runtime script and saved in runtime.json. Native dialog/popover layers work under this policy.

## Reproduce

Run commands from this worktree.

```sh
pnpm install
pnpm --filter @vstudy/desktop build
pnpm --filter @vstudy/desktop exec electron-vite build --mode astryx-spike
ASTRYX_EVIDENCE_DIR=/private/tmp/claude-501/-Users-vc--t3-projects-vstudy-pro/68bc03fd-445c-465f-b3a7-abc16d2e0b8c/scratchpad/w1a pnpm --filter @vstudy/desktop exec node e2e/astryx-spike.mjs
node apps/desktop/scripts/check-contrast.mjs
pnpm --filter @vstudy/desktop ui:check
node apps/desktop/scripts/vendor-check.mjs
pnpm typecheck
pnpm --filter @vstudy/desktop exec eslint .
pnpm --filter @vstudy/desktop exec node scripts/security-lint.mjs
pnpm --filter @vstudy/desktop exec vitest run src/renderer/tokens.test.ts src/renderer/components/ui/foundation.test.tsx src/renderer/components/ui/segmented-control.test.tsx src/renderer/components/ui/setting-row.test.tsx src/main/security.test.ts --maxWorkers=2
```

The first standard build prepares the MCP resources; the second builds the explicit gallery artifact. The runtime script launches one Electron instance with a disposable profile, closes it in finally, and removes the profile. It checks field edits, switch and segment selection, navigation selection, menu action, tooltip display, dialog Escape/focus return, and all nine palettes in both modes.

Evidence files are light.png, dark.png, light-dialog.png, dark-dialog.png, runtime.json and gate logs in the requested w1a directory. Screenshots show Astryx above the current components in the same gallery. Vite reports its large-chunk warning. This spike does not establish a bundle-size baseline or full component contrast/accessibility certification.
