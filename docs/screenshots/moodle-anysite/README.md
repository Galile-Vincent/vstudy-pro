# Moodle connection verification

Run `pnpm build` from the repository root, then `pnpm exec node e2e/moodle-anysite.mjs` from `apps/desktop`.

The runner launches real Electron with a temporary user profile and the built main, preload, and renderer. It replaces the Moodle discovery, connection, and overview IPC handlers with fixture responses. It does not contact a school or identity provider. The preload still validates the requests and responses against the shared contract.

The screenshots cover URL entry, the checked site card, provider sign-in, password sign-in, and maintenance guidance. The runner checks keyboard submission, two accounts at different schools, Escape dismissal, password exclusion from recent-site storage, and renderer exceptions. All five screenshots were visually inspected.

The full verification run passed `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm security:check`, and `pnpm build`. The final suite has 509 passing tests and 13 skipped tests. The audit reports no unreviewed advisories against the existing repository baseline. Security-lint retains its existing allowed warning in `main/ipc/index.ts`.

The network tests use fake DNS and HTTPS sockets. Authentication, discovery, file rewriting, capability state, migration, and dialog tests use fixtures and literal expected values. The popup fallback uses the parameters defined in [Moodle's external API](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/message/output/popup/externallib.php). Popup records refer to the core notifications table, as shown by [Moodle's popup query](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/message/output/popup/classes/api.php).

Live school sign-in, identity provider redirects, and downloads remain unverified. The optional tokenpluginfile optimization is not enabled. Cross-domain canonical roots are rejected; users can enter the canonical site directly. When public config omits the Moodle version, the minimum version check happens after authenticated site info is available.

Boundary Discipline put DNS validation at socket creation. Model the Domain shaped the authentication and dialog unions. Sequence Work into Verifiable Units kept the requested eight-commit order. Test Behavior, Not Implementation drove literal request and result assertions. Prove It Works drove the Electron runner and screenshot inspection. The implementation stayed in this worktree without child agents.
