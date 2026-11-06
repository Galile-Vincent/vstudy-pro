# Stream P startup boundary handoff

The follow-up keeps platform persistence construction inside the lazy MCP boundary. It adds no dependency on stream P and copies no Windows host or persistence implementation.

`AppIpcOptions.mcpPersistence` and `McpRuntimeOptions.persistence` accept an adapter or a synchronous factory returning an adapter or undefined. Undefined retains the Unix default. IPC forwards a callback. The runtime invokes the factory only inside its deferred initialization promise, before engine construction. The existing failure handler contains factory exceptions and emits only the fixed unavailable diagnostic.

## Exact production changes in this follow-up

- `apps/desktop/src/main/ipc/index.ts` line 45 extends the injected persistence type. Line 129 wraps resolution in a callback.
- `apps/desktop/src/main/mcp/runtime.ts` line 13 extends the persistence type. Line 57 invokes the factory inside the initialization boundary. Line 59 passes its resolved adapter to the engine.

The earlier lazy guard remains in IPC lines 115–122 and 127. Runtime lines 37–43 provide idle state, lines 44–73 contain construction and readiness, and lines 79–94 contain failure handling. IPC `mcp.ts` line 16 reads `runtime.state()` without initializing the engine.

## Merge with P

Keep P's Windows default inside the persistence callback. Calling `createWindowsStatePersistence` before `createMcpRuntime` would still let a factory exception reach desktop startup. Resolve an explicitly injected adapter or factory first, then select the Windows default inside that same callback.

At P commit `330d43b`, preserve the transport `closed` handler in `runtime.ts` lines 60–67 and the loss-disable and explicit-retry checks at lines 75–81. This main-based branch has no `closed` handling or optional `McpTransport.closed` yet. This follow-up changes neither transport interfaces nor transport startup or loss handling. Do not replace P's loss handling with this branch's runtime file during integration.

## Unix test evidence

The new main startup cases import the real `main/index.ts` with mocked Electron windows. At the IPC registration seam, they attach the real MCP runtime. Each case reaches BrowserWindow creation, emits ready-to-show, verifies `show()`, completes main-frame loading, confirms startup, and checks that the app never exits or closes storage.

The four cases cover a throwing persistence factory and a process without `getuid`, each with MCP off and on. Off never invokes the factory. On contains the failure, returns disabled/unavailable state, and logs no private diagnostic. Runtime tests also prove that a throwing factory allows a later explicit retry and that readiness resolves safely.

Before factory support, the enabled factory regression failed because the factory was never invoked. See [before](startup-relay-before.log). The startup, runtime and IPC suite now passes 18 tests. See [after](startup-relay-after.log).

`pnpm typecheck` passes. See [typecheck](startup-relay-typecheck.log). `pnpm security:check` passes, including lint, security audit, contrast, 130 MCP tests and 1,396 desktop tests. The existing 2 MCP and 14 desktop skips remain. See [security checks](startup-relay-security.log). Every Vitest invocation uses `--pool=forks --maxWorkers=2`.

Electron was not launched. P retains packaged Windows startup acceptance with MCP off and on. These are Unix-hosted mocked-window tests, not native Windows acceptance.
