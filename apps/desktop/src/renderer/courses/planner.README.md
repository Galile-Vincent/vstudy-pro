# Today and planner controls

`planner.tsx` shows today's tasks, school deadlines, a seven-day study view, and exam countdowns. Students can use personal tasks before connecting a school. The local plan button works without an AI provider. Its review card states the study window, estimates, daily capacity, and every proposed block.

`planner-forms.tsx` handles direct task entry and exam proposals. `planner-proposal.tsx` renders all course-agent action variants. The planner gateway invokes validated IPC. Main rechecks current data and owns all persistence.

`agent.tsx` reuses the course chat and approval cards. Summary and quiz controls first ask permission to send selected converted materials. `Chat` carries this permission on the next request only. The main service checks course membership and readiness before reading contained Markdown.

All new strings use the `planner` locale namespace. CSS uses whole-app theme tokens. Unit interaction tests live in `planner.test.tsx`. The production Electron scenario is `e2e/planner.mjs`; it closes its instance and saves evidence in `docs/evidence/D`.
