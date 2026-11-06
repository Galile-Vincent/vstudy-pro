# MCP security audit fixes

The independent audit at `c451cac` reproduced four failures. Its original report remains in [security-audit.md](security-audit.md). These changes address the first point where each operation lost its security guarantee.

| Finding | Change | Regression evidence |
| --- | --- | --- |
| A. Secrets split across pages | The backend sanitizes and redacts complete text before truncation, pagination, or FTS indexing and excerpts. All Moodle-derived text uses the context's redactor. The engine still redacts the final envelope. | Both a 32-hex credential and a short opaque credential cross a page boundary in converted files and module descriptions. Concatenated pages contain the replacement marker, never the credential. Search cannot return the credential fragment. |
| B. First-write consent differs from execution | Exact-payload validation runs again after preparation loads secrets, before creating the proposal, and before execution or later dispatch. A changed payload is rejected rather than silently rewritten. | A first write containing a newly loaded secret returns `INVALID_ARGUMENT`, creates no proposal, and writes no task. A secret discovered while a proposal is pending also prevents the approved task from being written. |
| C. Assignment dispatch after grant expiry | Main-only prepared calls receive a live authorization callback. Backend rechecks and the actual HTTP dispatch call it after all queue waits. | A real two-second grant expires while assignment saving is held. The call returns `EXPIRED`, and no final submission request is dispatched. |
| D. Queued write after school disconnect | MCP Moodle clients capture the account generation. Disconnect invalidates that generation before awaiting credential or sync work. Each actual HTTP dispatch checks the generation, connected account, service lifetime, and operation authorization. | All six scheduler slots are held after module validation. Disconnecting the real account before release prevents the queued completion request from reaching the injected HTTP transport. |

The six regressions are in `apps/desktop/src/main/mcp/backend-security.test.ts`. The initial focused run passed all six. The preceding affected-area run passed 242 tests, and desktop typecheck and lint passed. Full integrated checks, packaged acceptance, and a fresh independent review follow these fixes. These results do not claim native Windows or live-school acceptance.

An already-dispatched Moodle request can finish after cancellation or expiry. The fix prevents a later request from being dispatched without current authorization. It cannot recall a request a school has already received.
