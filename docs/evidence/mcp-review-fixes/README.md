# MCP defensive review fixes

The assignment regressions failed before the fix because approval omitted the existing attachment and remote text hash. Both now reject unsafe draft state, and no assignment tool calls final submission. The MCP and consent test run passes 206 tests. See [before](assignment-before.log) and [after](assignment-after.log).

Electron was not launched. The coordinator reserved its slot for streams P and C. Consent rendering is covered by the renderer tests, not screenshots or a live app run.

The Windows-shaped regression previously threw `DENIED` during runtime construction. It now resolves construction and readiness while off. Enabling contains the failure and returns disabled, unavailable state. Backend, persistence, and transport construction failures also remain local to MCP and allow an explicit retry. The runtime, IPC, and Settings tests pass 19 tests. See [before](runtime-before.log) and [after](runtime-after.log).

The two fragmented-secret cases failed before the fix. The final focused run passes 21 tests, including 400 deterministic randomized splits across nested leaves, whitespace-wrapped base64, base64url and hex, HTML cleanup, and limit overflow. See [before](redaction-before.log) and [after](redaction-after.log).

Data changes are additive except for the tool rename. Approval includes `remoteDraft` with `textHash`, attachment `name` and `size`, and `otherContent`. Settings state adds optional `unavailable`. The untrusted result envelope adds optional `redacted`. A whole-field replacement uses the fixed `[redacted]` marker. Excessive scan input drops the entire field set.

Final checks pass.

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | MCP, desktop and website pass | [typecheck](typecheck.log) |
| `pnpm security:check` | Security audit, lint, security lint, contrast, MCP and desktop tests pass | [security checks](security-check.log) |
| `pnpm --filter @vstudy/mcp test` | 130 pass, 2 skip, included in security checks | [test output](security-check.log) |
| Desktop Vitest through security checks | 1,391 pass, 14 skip | [test output](security-check.log) |
| `pnpm knip` | Pass, one existing CSS configuration hint | [knip](knip.log) |
| `pnpm vendor:check` | 55 vendor sources and 1 application file match | [vendor](vendor.log) |
| `pnpm --filter @vstudy/website build` | 52 pages built | [website](website-build.log) |
| `node scripts/check-readme-links.mjs` | 152 local links checked | [links](readme-links.log) |

Every Vitest run uses `--pool=forks --maxWorkers=2`. Native Windows acceptance remains untested on this Mac. Existing skipped tests remain skipped. There are no new screenshots because Electron was not launched. The original implementation required enabling again after restart. This was a regression corrected by [post-window restoration](../mcp-background-restore/README.md).

Stream P should preserve the lazy factory in `apps/desktop/src/main/ipc/index.ts` at lines 115–122 and 127. Windows transport and persistence injection remain at lines 128–129. In `main/mcp/runtime.ts`, line 14 accepts a backend factory, lines 37–43 expose safe idle state, lines 44–72 contain lazy construction, and lines 78–93 contain the failure boundary. `main/ipc/mcp.ts` line 16 uses runtime state without initializing the engine. `shared/mcp.ts` line 76 adds the optional unavailable flag. `renderer/settings/agents.tsx` line 26 shows the translated unavailable message. No changes were made to the platform transport or persistence interfaces.

Model the Domain shaped the typed remote draft snapshot and the bounded leaf list. Boundary Discipline kept platform failures inside MCP. Sequence Work into Verifiable Units kept each verified issue in its own commit. Implementation stayed in this agent under the assigned implementation-sub-agent scope.
