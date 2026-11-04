# Chat composer placement — 2026-11-04

The separate pre-conversation screen put a Start button and model picker near the top and provided no text field. A ready document with a usable model now opens its existing conversation or creates one empty conversation automatically. The vendor thread supplies the composer immediately, without a Start step. Automatic opening preserves reader focus and the selected pane. While the document/model is unavailable, a disabled text field and model picker remain at the bottom.

Two visual rounds: the first found that the empty-thread footer could extend below the viewport at 200% zoom; the second verified a shrinking thread root and sticky footer. Vendor files were not edited. Native Electron captures were used because Playwright's page screenshot crops the native viewport at browser zoom.

| Expo principle | Review |
| --- | --- |
| Contrast | Light/dark captures inspected; existing theme colors retained, no axe findings. |
| Hierarchy | Welcome and suggestions above; text entry and model controls below. Removed the extra Start action. |
| Alignment | Text field and suggestions follow the thread inset. |
| Proximity | Model controls stay inside the composer beside Send. |
| Repetition | Existing vendor thread, composer, buttons, and model selector reused. |
| Balance | Composer remains within the pane at 1200, 960, and 720px widths and 200% browser zoom. |
| White space | Welcome content uses the remaining area; the empty field stays near the bottom. |
| Unity | Empty and populated chats share the same composer and message runtime. |

Verification: typecheck, lint, build and all 60 vendor checks passed. Vitest: 358 passed, 13 skipped across 72 files (68 passed, four skipped). The new Electron regression checks eight composer positions, reload without duplicate conversations, and first-message sending; eight axe scans had zero violations. The broader accessibility script passed 144 audits. Chat-controls and selection/chat regressions also passed. Screenshots: `/tmp/vstudy-chat-bottom/1200-light.png`, `1200-dark.png`, `200-percent.png`, plus 960/720px theme captures.
