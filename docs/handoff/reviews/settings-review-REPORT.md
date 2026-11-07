Review the Settings redesign for a constant-size monochrome dialog while preserving every existing capability and all privacy, cost, and consent disclosures.

## Verdict

**Ship after fixes.** The three main reasons are:

1. The AI privacy, school-password, billing, and secure-storage guidance is now hidden by default, before the user reaches active key fields.
2. The new capture assertion does not enforce its stated pixel dimensions, contrast thresholds, or absence of renderer errors. Its passing result is weaker than its report suggests.
3. The long panes have a low-contrast scrollbar, and the API provider group loses the promised row dividers.

The constant size, default control contrast, locale parity, and basic preservation of existing actions are supported by independent checks. I found no removed capability that existed in HEAD. Custom-theme deletion is absent in both versions.

Review baseline: `a46f320ed09d0fc0eee0bf2d260a71d20b64a706`. Working tree was shared with active Courses, navigation, onboarding, and Moodle work. No source files were edited. No commits, stashes, checkouts, resets, or server termination were performed. Requested build and capture outputs were generated. All 130 `review-*` capture outputs were subsequently removed from the evidence directory. Text reports were retained in this scratch directory.

## Ranked findings

### 1. High. Measured. Essential AI disclosures are hidden by default.

File: [providers.tsx:156](apps/desktop/src/renderer/providers.tsx:156). Content: [ai-setup.tsx:26](apps/desktop/src/renderer/ai-setup.tsx:26).

Scenario: a student opens AI services and immediately pastes a school password into an API field, or assumes a ChatGPT subscription covers API charges. The field is available while the warning and fee explanation are inside a closed disclosure. `isVisible()` returned false for the school-password warning. In HEAD the guide was expanded content.

The unchanged warning starts: "Never paste your school password into AI settings or a chat." The same paragraph describes question, history, document-context, and selected-text disclosure. `novice:step_access` explains separate API charges. `novice:step_key` explains session-only use and denied storage permission.

Fix: keep these exact security, privacy, and billing strings visible before key-entry and setup actions. The numbered walkthrough, school-request template, and optional reading instructions can remain collapsed. Do not shorten the protected wording. API `key_help` and `keychain_help` also moved below the forms. Keep storage guidance discoverable before Save.

### 2. High checklist gap. Measured, pre-existing. Custom-theme deletion does not exist.

File: [appearance.tsx:91](apps/desktop/src/renderer/settings/appearance.tsx:91), [theme-editor.tsx:46](apps/desktop/src/renderer/settings/theme-editor.tsx:46).

Scenario: a student imports an unwanted custom theme. The available actions are select, edit, export, create, and import. There is no delete action. HEAD also has no delete action. This is not a regression introduced by this patch.

Fix: reconcile the checklist with the existing product, or add a separately scoped delete action with safe fallback when the selected pack is deleted. Do not claim deletion was preserved or tested.

### 3. Medium. Measured by source inspection. Capture assertions can accept broken evidence.

File: [capture-settings.mjs:104](apps/desktop/e2e/capture-settings.mjs:104).

Scenario: every tab accidentally becomes 880x640, or contrast falls below 3:1, or a renderer throws while leaving the shell rendered. `--assert` can still pass. It checks equality between tabs and overflow, but not expected dimensions. Contrast is printed but never asserted. Page errors are printed but never asserted.

Fix: assert the expected clamped dimensions, `errors.length === 0`, required contrast samples, and minimum contrast. Also extend the maintained matrix to Japanese, 200 percent text, and 600 px height. Independent review covered those layout gaps, but the reusable script currently does not.

### 4. Medium. Measured, pre-existing. Horizontal tabs retain vertical keyboard semantics.

File: [providers.tsx:87](apps/desktop/src/renderer/providers.tsx:87), [settings.css:831](apps/desktop/src/renderer/settings/settings.css:831).

Scenario: at 200 percent text and 1100 px width, the tabs become a horizontal scrolling row. `aria-orientation` remains `vertical`. ArrowRight leaves focus on General. ArrowDown moves to Appearance. The same orientation and responsive pattern exist in HEAD.

Fix: synchronize the Tabs orientation with the rendered layout, or retain a vertical layout at that breakpoint. Keep the roving focus and selected-tab scrolling supplied by the component.

### 5. Low. Measured computed contrast. Scrollbar is hard to discover on long panes.

File: [settings.css:101](apps/desktop/src/renderer/settings/settings.css:101).

Scenario: the user needs the converter or deletion controls near the bottom of Privacy, but the thin thumb barely separates from the surface. Its 25 percent ink color composites to approximately RGB 193 on white in light mode and RGB 76 on RGB 17 in dark mode. Contrast is **1.80:1 light** and **2.19:1 dark**. These are computed CSS composites, not a claim about every OS scrollbar rasterization.

Fix: use an opaque or stronger thumb token that reaches 3:1 against the default sheet. Include it in contrast sampling. High-contrast and forced-colors modes correctly remove the pane mask.

### 6. Low. Measured. API provider rows lose their shared dividers.

File: [settings.css:528](apps/desktop/src/renderer/settings/settings.css:528). The shared divider is at [settings.css:178](apps/desktop/src/renderer/settings/settings.css:178).

Scenario: Anthropic and OpenAI appear in one framed group with no boundary between their forms and helper paragraphs. The later, more specific `border: 0` overrides the shared `border-top`. Computed top border widths were 0px on every provider row. This leaves the AI group less structured than General and Storage.

Fix: explicitly restore `border-top: 1px solid var(--hairline)` on adjacent provider rows after the reset.

## Design review

The design findings are 1, 5, and 6 above. No additional design blockers were found.

I inspected before/after screenshot contact sheets for all seven tabs, open and bottom states, English dark/light at 1280x800, Traditional Chinese light at 1100x720, and additional original-size dark/light narrow captures. I also inspected the review captures at 200 percent text and 600 px height.

Hierarchy, aligned language controls, numbered AI steps, restrained surfaces, and light/dark parity are improved. The compact theme grid and swatches remain understandable. Scheme selection has both a strong border and a check indicator. Create and Add remain available under Advanced, although this is less discoverable than their former position beside Themes. The theme editor, import, and export flows worked.

General's empty lower half is acceptable under the explicit constant-size requirement. Filling it with extra content would not improve the task. Privacy remains long, about 1560 px in the default English capture, but its safety and deletion copy is preserved. Do not shorten that copy merely to reduce scrolling. The new groups broadly match the solid surfaces and soft structural lines in the supplied onboarding and current Courses style. I did not treat unrelated Courses or navigation changes as Settings findings.

## Wording preservation

[Complete quoted locale audit](locale-audit.md) lists every removed, changed, and added string for all three languages in the requested namespaces, plus analytics and ai-cli. [Disclosure audit](disclosures.md) quotes all newly collapsed guide strings and relocated API helpers in all three languages, with a visibility judgment for each.

Settings-specific removed strings:

| Key | English | Traditional Chinese | Japanese |
|---|---|---|---|
| `novice:ai_services` | "AI services" | "AI 服務" | "AI サービス" |
| `welcome:entry` | "What is VStudy Pro?" | "VStudy Pro 是什麼？" | "VStudy Pro とは？" |
| `themes:interface` | "Interface" | "介面" | "インターフェース" |

These are redundant headings/entry labels. The About page title remains. The visible General actions changed from the old replay label to "Show", and from the joined About label to "Open". Their row labels and new helpers explain the action.


The duplicate Privacy delete-group heading was removed, while the same label remains on the row and action. The former About button also lost its Try-it suffix. Exact displayed removals: en: removed duplicate heading "Delete all data"; removed About button suffix "Try it". zh-Hant: removed duplicate heading "刪除所有資料"; removed About button suffix "試試看". ja: removed duplicate heading "すべてのデータを削除"; removed About button suffix "試してみる".

No existing `settings` values were changed or removed. Each locale gained seven keys. `themes` gained two keys and removed `interface`. No `agents`, `storage`, `usage`, or `common` strings changed. No privacy, cost, consent, security, or deletion text was reworded within those Settings changes. Visibility is the issue in finding 1.

The shared working tree also has **21 removals and 14 changed values per language in onboarding**, plus one added value. These belong to the concurrent onboarding stream and are quoted in the complete audit. They include removal of `ai_paid_body`, `ai_login_body`, `ai_privacy_body`, `ai_keychain_body`, and `offline_promise`. `ai-cli:onboarding_login_body` was also removed in all languages. Do not attribute those deletions to Settings from this mixed working tree. Their old cost, permission, data-transfer, and storage disclosures need a separate onboarding review. In particular, the old claim "VStudy sends no analytics" should not simply be restored in an app that supports opt-in analytics.

Key parity: exact English/Traditional Chinese/Japanese key sets match in all 11 audited namespaces. The requested shared tests, including locale contract checks, passed.

## Capability checklist

Evidence labels: **M** means exercised in this review or the rerun Electron script. **S** means compared in source against HEAD. **T** means covered by passing relevant unit tests. **Mock** means UI action was exercised with an IPC or native-dialog stub. These labels distinguish retained code from full external-service verification.

| Capability | Result and evidence |
|---|---|
| Interface language and reply language | Present, S. Reply language saved as Japanese, M. Three locale layouts and key parity checked. |
| Welcome guide | Opens and exits, M. Calls the current onboarding implementation. |
| About | Opens the welcome/About page, M. |
| Theme pack selection and scheme | Present, S/M. Selected state, system transition unit tests, and reload persistence checked. |
| Create theme | Created and saved, M. |
| Add/import theme | Invalid JSON rejected; valid JSON imported, M. |
| Export theme | Export dialog produced valid JSON, M. Clipboard/download handlers retained, S; native file download not exercised. |
| Edit custom theme | Opens and cancels, M. |
| Delete custom theme | Missing in both HEAD and working tree. Finding 2. |
| Contrast, glass opacity, material | Retained with the same update handlers, S. Advanced keyboard disclosure exercised. Full slider pointer-drag race testing not performed. |
| Text size, density, reader font, reader size | Retained, S. Text size radio roles, labels, ArrowRight focus, Space selection, rapid changes, and saved/live final state checked, M. |
| Provider Save key | Retained, S. UI invokes the expected save channel, Mock. Real encrypted-save success not exercised. |
| Use without saving | Real Electron denied-Keychain/session-only branch passed in privacy-settings.mjs. No saved key remained, M. |
| Test connection | Exact handler body unchanged, S. Correct IPC call and success status, Mock. No live paid provider request made. |
| Get a key | Correct Anthropic URL and native-consent route, Mock. OpenAI and compatible routes retained, S. |
| Unlock/remove key | Retained, S. Remove UI and IPC action exercised, Mock. |
| AI CLI rows and setup | All three rows and advanced CLI controls present. Codex row opened its setup sheet and Settings closed, M. Guided setup/update actions retained, S/T. No install or update executed. |
| Check for updates | Both entry points and handlers retained, S/T. No live update check requested by review. |
| Agents and MCP grants | All controls and consent components retained. Relevant agent tests passed, T. Screenshots used an unpaired state. No live agent paired. |
| Usage dashboard, refresh, periods, grouping, daily table, CSV | Retained, S. Default and disclosure-open rendering passed axe. Native CSV export not exercised. |
| Budget and price overrides | Saved USD 12.34, token cap 1234, warning 75, and a valid override object through the UI, M. |
| Storage usage/cache clearing/converted clearing/integrity | Retained, S/T. Integrity button worked, M. |
| Backup and restore | Real export and restore scheduling worked through Settings using stubbed file dialogs and an isolated profile, M. Restore-after-restart was not run. |
| Delete all data | Confirmation field, exact DELETE guard, wording, and handler retained, S. Button disabled without confirmation in Electron e2e, M. Destructive action not executed. This control remains on Privacy, as in HEAD. |
| Converter idle minutes and mode | Present on Privacy, as in HEAD. Bounds, handler, and wording unchanged, S. No converter downloads triggered. |
| Analytics toggle, installation-ID copy, cloud deletion request | Present, S/T. Delete confirmation opened/cancelled, M. Relevant analytics tests passed. No live deletion request sent. |
| Network activity refresh | Present and clicked, M. Current request inventory rendered. |

No actual pre-change control was found removed. The misleading claim would be that every external workflow has been fully end-to-end validated. It has not.

## Correctness and accessibility checks

- The per-component appearance queue is unchanged. Rapid UI-scale changes ended at saved 100 and live scale 1. Theme creation/import survived reload.
- `forceMount` retains the tab-panel shells, but `tab === id` gates their contents. Hidden tabs do not keep the pane components and their effects mounted. This is the same behavior as HEAD. Tab switches can discard unsaved Usage edits, as before.
- Native details keyboard open worked. Focus rings were measured on selects, scheme cards, segmented controls, summaries, API fields, usage fields, CLI rows, switches, and checkboxes. Sampled dark focus outlines were solid 2px. This was not an exhaustive every-control focus-order audit.
- Text-size controls expose a named `radiogroup` with named `radio` items and `aria-checked`. Arrow keys move focus; Space selects. The underlying primitive was already used in HEAD.
- At 1100x720 and 1100x600, all seven tabs were checked in en, zh-Hant, and ja at 100 and 200 percent text. All 84 cases kept a usable pane and had no measured horizontal overflow. Dialogs were 1000x688 or 1000x568. At 200 percent, tabs became a horizontally scrolling row. Finding 4 describes its keyboard limitation.
- Forced colors removed the scroll mask and retained a visible selected-theme check. Reduced-motion captures and transition tests passed. Native OS reduced-motion preferences were not changed.
- Default sampled control edges: **4.40:1 dark**, **4.54:1 light**. Selected states: **18.09:1 dark**, **19.80:1 light**. These are sampled controls in the default theme, not every control in every custom pack.
- The fade is unconditional at top and bottom. In a keyboard traversal, Privacy Refresh reached the first 3 px of the bottom fade. No inaccessible action was demonstrated. Focus was not fully hidden. Stronger claims about universal focus visibility need further testing.

## Verification outputs

| Check | Independent result |
|---|---|
| `pnpm typecheck`, apps/desktop | Exit 0. |
| `pnpm lint`, apps/desktop | Exit 1. `✖ 155 problems (155 errors, 0 warnings)`. All reported paths were outside Settings. |
| Scoped ESLint on Settings, providers, privacy, usage, AI inventory, and capture/privacy scripts | Exit 0. Empty log. |
| Requested Vitest command | Exit 0. `Test Files 24 passed (24)`, `Tests 133 passed (133)`. |
| Additional provider-row, AI CLI, AI guide, analytics UI tests | Exit 0. `Test Files 5 passed (5)`, `Tests 69 passed (69)`. |
| `pnpm knip`, repository root | Exit 0. One configuration hint about `.css` imports not followed. |
| `pnpm build`, apps/desktop | Exit 0. |
| `node e2e/capture-settings.mjs --label review --axe --assert` | Exit 0. 56 size rows, 22 axe audits, zero violations, zero page errors. |
| `git diff --check` on reviewed source scope | Exit 0. |

The requested Vitest run printed `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package` but passed. I did not reproduce a 439-test count with the requested scope. The two relevant runs covered 202 tests. I did not run the full desktop suite or the known unrelated main/mcp/grants test.

Lint failures came from capture-courses, capture-onboarding-hero/steps/transition, fields-only-art, fixtures/courses-design, schools-registry, swipe-history, and onboarding/onboarding.tsx. Examples, verbatim:

```
10:32 error 'unusedRendererUrl' is assigned a value but never used @typescript-eslint/no-unused-vars
139:472 error Move user-visible copy to a locale catalog local/no-literal-string
✖ 155 problems (155 errors, 0 warnings)
```

These are other streams' files. The all-clean lint claim does not hold for the current mixed working tree. Exact full output: [lint.log](lint.log). Other raw logs are [typecheck](typecheck.log), [Vitest](vitest.log), [additional tests](extra-vitest.log), [Knip](knip.log), [build](build.log), and [capture](capture.log).

## Eight Electron script reruns

The author's exact eight-script list was not supplied in the Settings report. I selected the eight most directly relevant scripts below. I did not reproduce "six of eight". This selection produced one pass, six script failures, and one environment blocker.

To avoid overwriting unrelated evidence, I ran scratch copies with equivalent imports resolved to absolute paths and output/profile locations redirected to this scratch directory. Product source, assertions, fixtures, and test actions were not changed. Initial scratch import-resolution mistakes were corrected before the results below. Raw failures were retained.

| Script | Outcome and verbatim failure | Attribution and next action |
|---|---|---|
| `privacy-settings.mjs` | PASS, exit 0. All 36 screen audits and denied-Keychain/session-only assertions completed. | Measured Settings coverage. |
| `themes.mjs` | FAIL: `'9fa5a7' !== 'eef7f9'` at original line 62. | Inferred pre-existing timing assumption. The unmodified native theme code tweens for 280 ms, while the script compares native and renderer colors immediately. Wait for the native target. This failure occurs before Settings opens. |
| `theme-transitions.mjs` | FAIL: `'1' !== '0'` at original line 59. | Measured failure before Settings, in a shell-topbar pseudo-element opacity assertion. Inferred stale visual expectation after Courses/shell changes. Replace with the current fade contract. |
| `novice-ai-setup.mjs` | FAIL: `assert.ok((await page.locator('.pane-toolbar').innerText()).includes(copy.ready_to_read))` at original line 52. | Measured failure in reading-without-AI, before Settings. Inferred sample-navigation/readiness timing issue. The workspace Ready-to-read code is unchanged from HEAD. Wait for ready status and correct route before asserting. A product readiness regression outside Settings is not ruled out. |
| `storage.mjs` | BLOCKED: `Another Electron test is running. Retry after it exits. true !== false`. | Measured environment blocker. The existing dev Electron instance was left running. A focused isolated Settings export/restore-scheduling smoke passed separately. |
| `analytics-ui.mjs` | FAIL: `strict mode violation: getByTestId('privacy-settings').locator('details summary') resolved to 2 elements`. | Pre-existing stale selector. HEAD already renders What is collected and Exactly what we collect. Select the named summary. |
| `welcome-details.mjs` | FAIL: `locator.click: Timeout 30000ms exceeded`, with `dialog-overlay ... intercepts pointer events`, at original line 17. | Inferred stale onboarding flow. Original line 12 clicks Next four times. There are seven current steps, with an explicit privacy choice. It later clicks underlying UI while onboarding remains open. Use named steps and finish/exit the guide. |
| `ai-cli-layout.mjs` | FAIL: `locator.waitFor: Timeout 15000ms exceeded` waiting for `#ai-cli-preview code`, original line 41. | Inferred stale fixture for earlier manual-install changes. Missing manualInstallRequired/manualUpdateRequired fields default true. Current setup deliberately shows manual installation instead of managed command preview. Set the intended fixture fields or assert the manual flow. |

Stale scripts to repair rather than treat as Settings regressions: analytics-ui, welcome-details, ai-cli-layout, theme-transitions. Themes needs a native-transition wait. Novice-ai-setup needs readiness diagnosis, not automatic retirement. Storage needs an uncontended test session. None of these failures demonstrates a Settings capability removal.

Raw logs: [themes](themes.log), [theme transitions](theme-transitions.log), [novice AI](novice-ai-setup.log), [privacy](privacy-settings.log), [storage](storage.log), [analytics](analytics-ui.log), [welcome details](welcome-details.log), [CLI layout](ai-cli-layout.log).

## Leftovers and limitations

- `e2e/.inspect-settings.tmp.mjs` was absent. No Settings TODO/FIXME markers were found.
- Knip found no included unused-file/dependency issues. It explicitly does not follow CSS. It does not prove locale-key liveness.
- Removed heading/entry locale keys have no remaining exact source references. Added Settings keys are referenced.
- `.settings-disclosure > summary small` appears unused by the current Settings summaries. This is a minor CSS leftover, not a blocker. Several generic paragraph exclusions have no current consumer. No dead Settings component was established.
- The Settings README and CSS have explanatory/narrating comments. They are descriptive rather than TODOs. No substantive correctness issue was found in those comments.
- Screenshots and axe were checked in the supplied unpaired/empty-data states. Populated grant lists, long network histories, real school accounts, Windows/macOS parity, and arbitrary custom-theme contrast were not exhaustively exercised.
- No live provider authentication, paid connection request, CLI installation/update, cloud deletion, full data deletion, or restore-after-restart was executed.
- Full-system 200 percent browser zoom is distinct from the app's 200 percent text setting. This review measured the app text setting.
- The working tree was changing under other agents. Failure attribution marked inferred was not proven by rebuilding a clean HEAD checkout.
