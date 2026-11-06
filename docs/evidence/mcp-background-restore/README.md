# Restore agent access after creating the first window

Main `f5dacd1c` was merged before this fix. The earlier lazy initialization regression ignored saved enabled state and overwrote it during construction. A background launch could create its hidden window but could not serve an existing grant.

The IPC composition now listens once for `browser-window-created` and calls `runtime.restore()`. Initialization remains asynchronous and inside the existing caught boundary. It reads protected state only after window creation. A saved enabled opt-in starts the bridge. Disabled or absent state never starts it. Restoration does not write the enabled flag or create a new opt-in. Explicit Settings changes still use `setEnabled(boolean)`.

Corrupt, public or foreign state is rejected by the existing protected persistence and GrantStore validation. Construction, state-read and transport failures leave the runtime disabled/unavailable and emit only the fixed diagnostic. No new tool, wire-schema, grant or platform interface is introduced. The internal optional enabled argument distinguishes restoration from an explicit Settings decision.

## Evidence

The four hidden-window restoration regressions failed before the fix because protected state was never read. See [before](before.log). The focused main startup, runtime and IPC suite now passes 27 tests. See [after](startup-after.log).

Main startup tests execute the actual `main/index.ts` with mocked Electron windows and a real runtime at the IPC seam. They emit `browser-window-created`, verify that protected reads happen after a window exists, and prove that `--mcp-background` keeps it hidden. The matrix covers saved enabled state, a throwing read, absent state and corrupt state. The previous four off/on/failure cases remain green.

Runtime tests use real protected Unix state for enabled, disabled, absent, corrupt and unprotected files. Enabled and disabled files remain byte-for-byte unchanged after restoration. With absent state, no state file is written. Existing persistence tests reject symlinked directories and state files as well.

The SDK integration test builds the real runtime, seeds protected enabled state and an existing client grant, compiles the native peer verifier, and starts the Unix bridge through `restore()`. The official MCP SDK connects to the bundled stdio CLI and reads through the existing grant without new pairing or window restoration. The state file remains unchanged until the authenticated call. See [SDK](sdk.log). This complements the mocked hidden-window startup tests; no Electron process was launched.

All Vitest invocations use `--pool=forks --maxWorkers=2`.

| Check | Result | Evidence |
| --- | --- | --- |
| `pnpm typecheck` | MCP, desktop and website pass | [typecheck](typecheck.log) |
| `pnpm security:check` | Audit, root lint, security lint, contrast and tests pass | [security](security.log) |
| `pnpm --filter @vstudy/mcp test`, through security checks | 131 pass, 2 existing skips | [security](security.log) |
| Desktop tests, through security checks | 1,405 pass, 14 existing skips | [security](security.log) |
| `pnpm knip` | Pass, existing CSS configuration hint | [knip](knip.log) |

## Exact production lines for P

- `apps/desktop/src/main/ipc/index.ts` lines 132–133 register post-window restoration. Line 143 removes the listener during teardown.
- `apps/desktop/src/main/mcp/runtime.ts` line 38 distinguishes a restored choice from an explicit Settings decision. Line 44 adds restoration mode. Line 68 replaces the unconditional persisted disable with the saved-opt-in check. Lines 79–84 expose restoration through the same caught initialization path and write the enabled flag only for an explicit decision.

Transport invocation at runtime lines 69–72, the failure handler at lines 86–95, and platform injection are otherwise unchanged. This main-based branch still has no P `closed` block. Retain P's loss-disable and explicit-retry handling during integration; do not replace that block with this runtime file wholesale. No unmerged P commit was imported.

Model the Domain shaped the restored-versus-explicit choice. Boundary Discipline kept protected-state and transport failures local to MCP. Implementation and verification ran in this agent.
