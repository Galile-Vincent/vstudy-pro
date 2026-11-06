# MCP defensive review fixes

The assignment regressions failed before the fix because approval omitted the existing attachment and remote text hash. Both now reject unsafe draft state, and no assignment tool calls final submission. The MCP and consent test run passes 206 tests. See [before](assignment-before.log) and [after](assignment-after.log).

Electron was not launched. The coordinator reserved its slot for streams P and C. Consent rendering is covered by the renderer tests, not screenshots or a live app run.

The Windows-shaped regression previously threw `DENIED` during runtime construction. It now resolves construction and readiness while off. Enabling contains the failure and returns disabled, unavailable state. Backend, persistence, and transport construction failures also remain local to MCP and allow an explicit retry. The runtime, IPC, and Settings tests pass 19 tests. See [before](runtime-before.log) and [after](runtime-after.log).
